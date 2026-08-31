import {
  MAX_PER_BLOCK, MAX_PER_BRIEFING, assertivenessNote, capBriefing, selectTopK,
} from '@ava/core'
import type { ChangeRecord } from '@ava/core'
import type { PreparedArtifact, StoredOpportunity } from '@ava/db'
import type { AppContext } from './context'
import { currentStateQuiet } from './change-service'
import { generateOpportunities } from './opportunity-service'

/**
 * Home / Today and the briefing (S5-T11, S5-T12, spec §2.1).
 *
 * ONE source of truth. The briefing is a composition over the same
 * opportunities Today reads — there is no second engine, because two engines
 * would eventually disagree and the user would have no way to tell which one
 * was right.
 *
 * Empty is a correct result. "Nothing needs your attention right now" is an
 * answer, and filling a block to avoid looking idle is the proactivity-noise
 * failure mode the baseline names.
 */
export type BlockId =
  | 'what_changed' | 'needs_your_attention' | 'open_threads' | 'ava_noticed' | 'prepared_for_you'

export const BLOCK_IDS: readonly BlockId[] = [
  'what_changed', 'needs_your_attention', 'open_threads', 'ava_noticed', 'prepared_for_you',
] as const

export interface BriefingItem {
  id: string
  headline: string
  detail: string
  /** The ordinal strength shown next to the item. Never a number. */
  strength: string
  /** Hedge required by health and strength, when one is required. */
  note: string | null
  /** Where Why can be opened for this item. */
  whyHref: string | null
  opportunityId: string | null
}

export interface BriefingBlock {
  id: BlockId
  title: string
  items: BriefingItem[]
  /** What the block says when it holds nothing. Never an error. */
  emptyMessage: string
  /** Items that qualified but did not fit, with the reason. */
  heldBack: { headline: string; reason: string }[]
}

export interface Briefing {
  workstreamId: string
  generatedAt: Date
  contextHealth: string
  gaps: string[]
  blocks: BriefingBlock[]
  /** Items dropped by the whole-briefing attention cap. */
  droppedByCap: number
  since: Date | null
}

const TITLES: Record<BlockId, string> = {
  what_changed: 'What changed',
  needs_your_attention: 'Needs your attention',
  open_threads: 'Open threads',
  ava_noticed: 'AVA noticed',
  prepared_for_you: 'Prepared for you',
}

/**
 * Builds Today.
 *
 * `deliver` controls whether this counts as showing. A preview that nobody
 * saw must not stamp `shown_at`: that timestamp feeds the prospective latency
 * measurements, and a rendered-but-unshown item would silently corrupt them.
 */
export async function buildBriefing(
  ctx: AppContext, workstreamId: string, opts: { deliver?: boolean; now?: Date } = {},
): Promise<Briefing> {
  const now = opts.now ?? new Date()
  const deliver = opts.deliver ?? false

  const generation = await generateOpportunities(ctx, workstreamId, now)
  await ctx.opportunities.expireDue(now)

  const lastClosed = await ctx.checkpoints.lastClosed(workstreamId)
  const since = lastClosed?.closedAt ?? null

  const live = await ctx.opportunities.listByWorkstream(
    workstreamId, ['eligible', 'shown', 'prepared'])
  const changes = await ctx.changes.listByWorkstream(workstreamId, 100)
  const view = await currentStateQuiet(ctx, workstreamId, now)
  const preparedArtifacts = await ctx.prepared.listAvailable(workstreamId)

  const health = await healthOf(ctx, generation.healthId, generation.contextHealth)

  // --- What changed ---------------------------------------------------------
  const recentChanges = changes
    .filter((c) => since === null || c.observedAt.getTime() >= since.getTime())
    .filter((c) => c.status !== 'rejected' && c.changeType !== 'unknown_change')
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, MAX_PER_BLOCK)

  // --- Opportunity blocks ---------------------------------------------------
  // Show Policy decides admission. Preparation status is not consulted here
  // and is not available to the filter: cost already spent must not buy
  // attention (baseline §18).
  const attention = selectTopK(live, MAX_PER_BLOCK, (o) => {
    if (o.show.verdict !== 'PASS') {
      return { keep: false, reason: `show policy returned ${o.show.verdict}` }
    }
    const high = o.valueVector.consequence.value === 'high'
      || o.valueVector.timeSensitivity.value === 'immediate'
      || o.valueVector.timeSensitivity.value === 'soon'
    return high
      ? { keep: true, reason: 'high consequence or a closing window' }
      : { keep: false, reason: 'belongs in AVA noticed rather than in attention' }
  })

  const attentionIds = new Set(attention.selected.map((o) => o.id))
  const noticed = selectTopK(live, MAX_PER_BLOCK, (o) => {
    if (attentionIds.has(o.id)) return { keep: false, reason: 'already in Needs your attention' }
    if (o.show.verdict !== 'PASS') {
      return { keep: false, reason: `show policy returned ${o.show.verdict}` }
    }
    return { keep: true, reason: 'shown with lower consequence' }
  })

  // --- Open threads ---------------------------------------------------------
  const openThreads = view.entries
    .filter((e) =>
      (e.type === 'question' && (e.current.status === 'open' || e.current.status === 'reopened'))
      || (e.type === 'commitment' && e.current.status === 'open')
      || (e.type === 'decision' && e.current.status === 'proposed'))
    .slice(0, MAX_PER_BLOCK)

  const blocks: BriefingBlock[] = [
    block('what_changed', recentChanges.map(changeItem),
      since === null
        ? 'Nothing has changed yet. Close a checkpoint to set a boundary for "since then".'
        : 'Nothing changed since the last checkpoint.', []),
    block('needs_your_attention', attention.selected.map((o) => opportunityItem(o, health.state)),
      'Nothing needs your attention right now.',
      attention.heldBack.map((h) => ({ headline: h.item.headline, reason: h.reason }))),
    block('open_threads', openThreads.map((e) => ({
      id: e.objectId,
      headline: e.current.title,
      detail: `${e.type} · ${e.current.status}`,
      strength: e.current.strength,
      note: null, whyHref: null, opportunityId: null,
    })), 'No open questions, commitments or proposed decisions.', []),
    block('ava_noticed', noticed.selected.map((o) => opportunityItem(o, health.state)),
      'AVA has not noticed anything else worth raising.',
      noticed.heldBack.map((h) => ({ headline: h.item.headline, reason: h.reason }))),
    block('prepared_for_you', preparedArtifacts.slice(0, MAX_PER_BLOCK).map(preparedItem),
      'Nothing has been prepared. AVA only prepares when the Prepare Policy allows it.', []),
  ]

  // The attention cap applies to the composed briefing, not per block: the
  // limit protects a person's attention, and ten items is ten items.
  const capped = capBriefing(blocks.map((b) => ({ id: b.id, items: b.items })), MAX_PER_BRIEFING)
  for (const [i, b] of blocks.entries()) b.items = capped.blocks[i]?.items ?? []

  if (deliver) {
    for (const o of [...attention.selected, ...noticed.selected]) {
      if (!blocks.some((b) => b.items.some((i) => i.opportunityId === o.id))) continue
      if (o.shownAt === null) {
        await ctx.opportunities.markStatus(o.id, 'shown', now)
        await ctx.telemetry.record({
          eventType: 'opportunity_shown', occurredAt: now,
          subjectType: 'opportunity', subjectId: o.id, workstreamId,
          contextHealth: o.contextHealth, evidenceStrength: o.strength,
          payload: { opportunityClass: o.opportunityClass },
        })
      }
    }
  }

  await ctx.telemetry.record({
    eventType: deliver ? 'briefing_shown' : 'briefing_generated', occurredAt: now,
    subjectType: 'workstream', subjectId: workstreamId, workstreamId,
    contextHealth: health.state,
    payload: {
      items: blocks.reduce((n, b) => n + b.items.length, 0),
      droppedByCap: capped.dropped,
      blocks: Object.fromEntries(blocks.map((b) => [b.id, b.items.length])),
    },
  })

  return {
    workstreamId, generatedAt: now,
    contextHealth: health.state, gaps: [...health.gaps],
    blocks, droppedByCap: capped.dropped, since,
  }
}

function block(
  id: BlockId, items: BriefingItem[], emptyMessage: string,
  heldBack: { headline: string; reason: string }[],
): BriefingBlock {
  return { id, title: TITLES[id], items, emptyMessage, heldBack }
}

function changeItem(c: ChangeRecord): BriefingItem {
  return {
    id: c.id,
    headline: `${c.objectType} ${c.changeType.replace(/_/g, ' ')}`,
    detail: c.changedFields.length > 0
      ? `fields: ${c.changedFields.join(', ')}` : 'no field-level detail recorded',
    strength: c.strength,
    note: null, whyHref: null, opportunityId: null,
  }
}

function opportunityItem(o: StoredOpportunity, health: string): BriefingItem {
  return {
    id: o.id,
    headline: o.headline,
    detail: o.detail,
    strength: o.strength,
    note: assertivenessNote(o.strength, o.contextHealth) ?? (health === 'DEGRADED'
      ? 'Context is incomplete — see the gaps before acting on this.' : null),
    whyHref: `/why/opportunity/${o.id}`,
    opportunityId: o.id,
  }
}

function preparedItem(a: PreparedArtifact): BriefingItem {
  return {
    id: a.id,
    headline: a.title,
    detail: a.body,
    strength: 'SUPPORTED',
    note: `Prepared by AVA in ${a.executionMode} mode. It is a draft, not a decision.`,
    whyHref: `/why/opportunity/${a.opportunityId}`,
    opportunityId: a.opportunityId,
  }
}

async function healthOf(ctx: AppContext, healthId: string, fallbackState: string) {
  const stored = await ctx.contextHealth.findById(healthId)
  return stored ?? { state: fallbackState, gaps: [] as readonly string[] }
}
