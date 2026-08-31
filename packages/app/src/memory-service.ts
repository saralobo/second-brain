import {
  countIndependentSupport, evaluatePromotion, strengthOfView,
} from '@ava/core'
import type {
  ContextHealthState, DeclaredCognition, EvidenceStrength, MemoryRecord,
  MemoryView, PromotionDecision, SupportItem,
} from '@ava/core'
import type { Evidence } from '@ava/db'
import type { AppContext } from './context'

/**
 * The three memory classes (baseline §14) and the rules that keep them honest.
 *
 * Episodic memory is written as evidence arrives. Stabilized semantic
 * knowledge is written only when deterministic promotion rules pass. Declared
 * Cognition is written only by the user. Nothing here consults a model:
 * promotion driven by a model's confidence in its own output is precisely the
 * `fake confidence` failure the baseline names.
 */
export interface MemorySnapshot {
  declared: MemoryRecord[]
  evidenceBacked: MemoryRecord[]
  hypotheses: MemoryRecord[]
  uncertain: MemoryRecord[]
  superseded: MemoryRecord[]
}

/** Records episodic memory for a state object version. */
export async function recordEpisodic(
  ctx: AppContext,
  versionId: string,
  title: string,
  evidenceIds: readonly string[],
  strength: EvidenceStrength,
  workstreamId: string | null,
): Promise<MemoryRecord | null> {
  if (evidenceIds.length === 0) return null
  return ctx.memory.upsert({
    memoryClass: 'episodic',
    refId: versionId,
    refType: 'state_object_version',
    title,
    derivedFromEvidenceIds: evidenceIds,
    strength,
    workstreamId,
  })
}

export interface PromotionRequest {
  versionId: string
  title: string
  evidenceIds: readonly string[]
  contextHealth: ContextHealthState
  materialConflicts: number
  scoped: boolean
  riskOfMisapplication?: 'low' | 'medium' | 'high'
  workstreamId: string | null
}

export interface PromotionOutcome {
  decision: PromotionDecision
  record: MemoryRecord | null
}

/**
 * Promotion to stabilized semantic knowledge (S4-T04).
 *
 * Conservative on purpose. Failing promotion is not an error state: the claim
 * stays episodic, still fully usable and still pointing at its evidence. The
 * only thing it does not get is the higher standing that would let it be
 * stated as settled.
 */
export async function promoteToStabilized(
  ctx: AppContext, req: PromotionRequest,
): Promise<PromotionOutcome> {
  const evidence = await ctx.evidence.findByIds(req.evidenceIds)

  const support: SupportItem[] = evidence.map((e) => ({
    id: e.id, contentOrigin: e.contentOrigin, lineage: e.lineage,
  }))

  const decision = evaluatePromotion({
    support,
    strengths: evidence.map((e) => e.strength),
    contextHealth: req.contextHealth,
    materialConflicts: req.materialConflicts,
    scoped: req.scoped,
    riskOfMisapplication: req.riskOfMisapplication ?? 'medium',
  })

  if (!decision.promote) return { decision, record: null }

  const record = await ctx.memory.upsert({
    memoryClass: 'semantic_stabilized',
    refId: req.versionId,
    refType: 'state_object_version',
    title: req.title,
    derivedFromEvidenceIds: req.evidenceIds,
    strength: decision.strength,
    promotedAt: new Date(),
    workstreamId: req.workstreamId,
  })

  await ctx.telemetry.record({
    eventType: 'knowledge_promoted', occurredAt: new Date(),
    subjectType: 'memory_record', subjectId: record.id,
    workstreamId: req.workstreamId, evidenceStrength: decision.strength,
    contextHealth: req.contextHealth,
    payload: {
      independentSupport: countIndependentSupport(support),
      reasons: decision.reasons,
    },
  })

  return { decision, record }
}

/**
 * Builds a derived view.
 *
 * Two properties are enforced here rather than trusted. The view flattens to
 * LEVEL-ZERO evidence ids, so a view of a view cannot introduce a new layer of
 * support. And its strength is the weakest of its sources, so summarising
 * never makes a claim stronger than the words it summarises.
 */
export async function buildView(
  ctx: AppContext,
  input: { title: string; summary: string; evidenceIds: readonly string[]; workstreamId: string | null },
): Promise<MemoryView> {
  const evidence: Evidence[] = await ctx.evidence.findByIds(input.evidenceIds)
  if (evidence.length === 0) {
    throw new Error('a view must resolve to level-zero evidence; it cannot summarise nothing')
  }

  return ctx.memory.saveView({
    title: input.title,
    summary: input.summary,
    derivedFromEvidenceIds: evidence.map((e) => e.id),
    contentOrigin: 'system',
    strength: strengthOfView(evidence.map((e) => e.strength)),
    workstreamId: input.workstreamId,
    stale: false,
  })
}

/**
 * Rebuilds stale views from the ledger (S4-T09).
 *
 * A correction invalidates every view built on the corrected words. Rebuilding
 * reads the evidence again rather than patching the old summary — a patched
 * summary would still carry the sentence the user came back to fix.
 */
export async function rebuildStaleViews(
  ctx: AppContext, workstreamId: string | null,
): Promise<{ rebuilt: number; dropped: number }> {
  const views = await ctx.memory.listViews(workstreamId)
  let rebuilt = 0
  let dropped = 0

  for (const view of views) {
    if (!view.stale) continue

    const evidence = await ctx.evidence.findByIds(view.derivedFromEvidenceIds)
    if (evidence.length === 0) {
      // Nothing left underneath: the view is deleted rather than kept as an
      // orphan claim with no way back to a source.
      await ctx.memory.deleteView(view.id)
      dropped += 1
      continue
    }

    await ctx.memory.deleteView(view.id)
    await ctx.memory.saveView({
      title: view.title,
      summary: evidence.map((e) => e.content).join('\n'),
      derivedFromEvidenceIds: evidence.map((e) => e.id),
      contentOrigin: 'system',
      strength: strengthOfView(evidence.map((e) => e.strength)),
      workstreamId,
      stale: false,
    })
    rebuilt += 1
  }

  if (rebuilt > 0 || dropped > 0) {
    await ctx.telemetry.record({
      eventType: 'memory_view_rebuilt', occurredAt: new Date(),
      subjectType: 'workstream', subjectId: workstreamId ?? 'all',
      workstreamId,
      payload: { rebuilt, dropped },
    })
  }
  return { rebuilt, dropped }
}

export interface MemorySurface {
  declared: DeclaredCognition[]
  superseded: DeclaredCognition[]
  evidenceBacked: MemoryRecord[]
  hypotheses: Awaited<ReturnType<AppContext['hypotheses']['list']>>
  uncertain: MemoryRecord[]
}

/**
 * Everything AVA knows, grouped by the five sections of spec §2.5.
 *
 * The grouping IS the product. A single "Memory" list would present a guess
 * and a statement the user made as the same kind of object, which is the one
 * thing this surface exists to prevent.
 */
export async function memorySurface(
  ctx: AppContext, workstreamId: string | null = null,
): Promise<MemorySurface> {
  const [all, episodic, stabilized, hypotheses] = await Promise.all([
    ctx.cognition.listAll(),
    ctx.memory.listByClass('episodic', workstreamId),
    ctx.memory.listByClass('semantic_stabilized', workstreamId),
    ctx.hypotheses.list(workstreamId),
  ])

  const scoped = workstreamId === null
    ? all
    : all.filter((c) => c.workstreamId === null || c.workstreamId === workstreamId)

  return {
    declared: scoped.filter((c) => c.status === 'active'),
    superseded: scoped.filter((c) => c.status !== 'active'),
    evidenceBacked: stabilized,
    hypotheses,
    // Episodic records that never met the promotion rules. Not a failure —
    // an honest resting state for a claim with one source behind it.
    uncertain: episodic.filter((e) => e.strength !== 'ESTABLISHED'),
  }
}
