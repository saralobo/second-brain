import { MAX_PER_BLOCK, MAX_PER_BRIEFING, capBriefing } from '@ava/core'
import type { AppContext } from './context'
import { buildBriefing } from './briefing-service'
import type { BlockId, Briefing, BriefingItem } from './briefing-service'

/**
 * Global surfaces (Interaction Layer I2).
 *
 * AGGREGATION, not cross-workstream retrieval. Each workstream computes its own
 * briefing behind its own boundary — every retrieval query is still
 * `WHERE workstream_id = $1` — and this concatenates the outputs.
 *
 * No evidence from one workstream ever enters a Context Packet built for
 * another. Reasoning across projects would require a global Context Packet and
 * is deferred to ADR-23; nothing here approaches that line.
 *
 * There is no global score and no global Context Health. The specification is
 * explicit that health is per task, so each item carries its own.
 */
export interface GlobalItem extends BriefingItem {
  workstreamId: string
  workstreamName: string
  /** Health of the workstream this came from. There is no global value. */
  contextHealth: string
}

export interface GlobalBlock {
  id: BlockId
  title: string
  items: GlobalItem[]
  emptyMessage: string
}

export interface GlobalBriefing {
  generatedAt: Date
  blocks: GlobalBlock[]
  /** Per workstream, so a gap is attributable rather than diffuse. */
  workstreams: { id: string; name: string; contextHealth: string; gaps: string[] }[]
  attentionCount: number
  changeCount: number
  droppedByCap: number
}

/**
 * Composes Today across every workstream.
 *
 * `deliver` behaves exactly as it does locally: it is what stamps `shown_at`,
 * so a preview cannot corrupt the exposure timeline.
 */
export async function buildGlobalBriefing(
  ctx: AppContext, opts: { deliver?: boolean; now?: Date } = {},
): Promise<GlobalBriefing> {
  const now = opts.now ?? new Date()
  const workstreams = await ctx.workstreams.list()

  const perWorkstream: { name: string; briefing: Briefing }[] = []
  for (const ws of workstreams) {
    const briefing = await buildBriefing(ctx, ws.id, { deliver: opts.deliver, now })
    perWorkstream.push({ name: ws.name, briefing })
  }

  const blockIds: BlockId[] = [
    'needs_your_attention', 'what_changed', 'open_threads', 'ava_noticed', 'prepared_for_you',
  ]
  const titles: Record<BlockId, string> = {
    what_changed: 'What changed',
    needs_your_attention: 'Needs your attention',
    open_threads: 'Open loops',
    ava_noticed: 'AVA noticed',
    prepared_for_you: 'Prepared for you',
  }
  const empties: Record<BlockId, string> = {
    what_changed: 'Nothing has changed across your projects.',
    needs_your_attention: 'Nothing needs your attention right now.',
    open_threads: 'No open questions or commitments anywhere.',
    ava_noticed: 'AVA has not noticed anything else worth raising.',
    prepared_for_you: 'Nothing has been prepared.',
  }

  const blocks: GlobalBlock[] = blockIds.map((id) => {
    const merged: GlobalItem[] = []
    for (const { name, briefing } of perWorkstream) {
      // A workstream whose context is INSUFFICIENT contributes nothing to the
      // global surface, exactly as it contributes nothing locally.
      if (briefing.contextHealth === 'INSUFFICIENT') continue
      const block = briefing.blocks.find((b) => b.id === id)
      if (block === undefined) continue
      for (const item of block.items) {
        merged.push({
          ...item,
          workstreamId: briefing.workstreamId,
          workstreamName: name,
          contextHealth: briefing.contextHealth,
        })
      }
    }
    return { id, title: titles[id], items: merged.slice(0, MAX_PER_BLOCK), emptyMessage: empties[id] }
  })

  // The attention cap applies to the composed briefing. Ten items is ten items,
  // whether they come from one project or four.
  const capped = capBriefing(blocks.map((b) => ({ id: b.id, items: b.items })), MAX_PER_BRIEFING)
  for (const [i, b] of blocks.entries()) b.items = capped.blocks[i]?.items ?? []

  return {
    generatedAt: now,
    blocks,
    workstreams: perWorkstream.map(({ name, briefing }) => ({
      id: briefing.workstreamId,
      name,
      contextHealth: briefing.contextHealth,
      gaps: [...briefing.gaps],
    })),
    attentionCount: blocks.find((b) => b.id === 'needs_your_attention')?.items.length ?? 0,
    changeCount: blocks.find((b) => b.id === 'what_changed')?.items.length ?? 0,
    droppedByCap: capped.dropped,
  }
}

/**
 * A one-line reading of the landscape, for the home surface.
 *
 * Counts only. It states what is waiting, never how AVA is doing.
 */
export interface Landscape {
  workstreamCount: number
  attentionCount: number
  changeCount: number
  openLoopCount: number
  degradedWorkstreams: string[]
}

export async function readLandscape(ctx: AppContext, now: Date = new Date()): Promise<Landscape> {
  const briefing = await buildGlobalBriefing(ctx, { deliver: false, now })
  return {
    workstreamCount: briefing.workstreams.length,
    attentionCount: briefing.blocks.find((b) => b.id === 'needs_your_attention')?.items.length ?? 0,
    changeCount: briefing.blocks.find((b) => b.id === 'what_changed')?.items.length ?? 0,
    openLoopCount: briefing.blocks.find((b) => b.id === 'open_threads')?.items.length ?? 0,
    degradedWorkstreams: briefing.workstreams
      .filter((w) => w.contextHealth !== 'HEALTHY').map((w) => w.name),
  }
}
