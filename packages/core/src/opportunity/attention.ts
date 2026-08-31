import type { OpportunityCandidate } from './types'

/**
 * Attention Engine V0 (spec §11): FILTERS + TOP-K. Nothing else.
 *
 * No learned ranking, no bandit, no reward model, no preference vector. The
 * ordering below is a fixed, readable rule that a person can disagree with
 * out loud — which is the point. A learned ranker would optimise for
 * engagement, and "number of opportunities shown" is explicitly not a success
 * metric.
 */
export const MAX_PER_BLOCK = 3
export const MAX_PER_BRIEFING = 10

const TIME_ORDER = { immediate: 0, soon: 1, later: 2, none: 3, unknown: 4 } as const
const CONSEQUENCE_ORDER = { high: 0, medium: 1, low: 2, unknown: 3 } as const
const STRENGTH_ORDER = { ESTABLISHED: 0, SUPPORTED: 1, SPECULATIVE: 2 } as const

/**
 * Deterministic order: time sensitivity, then consequence, then evidence
 * strength, then oldest-first so a long-standing condition is not buried by
 * newer arrivals. Ties break on id, so two runs over the same data agree.
 */
export function compareForAttention(a: OpportunityCandidate, b: OpportunityCandidate): number {
  const t = TIME_ORDER[a.valueVector.timeSensitivity.value] - TIME_ORDER[b.valueVector.timeSensitivity.value]
  if (t !== 0) return t
  const c = CONSEQUENCE_ORDER[a.valueVector.consequence.value] - CONSEQUENCE_ORDER[b.valueVector.consequence.value]
  if (c !== 0) return c
  const s = STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]
  if (s !== 0) return s
  const g = a.generation.generatedAt.getTime() - b.generation.generatedAt.getTime()
  if (g !== 0) return g
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface AttentionResult<T> {
  selected: readonly T[]
  /** Items that qualified but did not fit. Recorded, never silently dropped. */
  heldBack: readonly { item: T; reason: string }[]
}

/** Filters, then takes the top k. Both steps are inspectable. */
export function selectTopK<T extends OpportunityCandidate>(
  candidates: readonly T[],
  k: number,
  filter: (c: T) => { keep: boolean; reason: string },
): AttentionResult<T> {
  const kept: T[] = []
  const heldBack: { item: T; reason: string }[] = []
  for (const c of candidates) {
    const verdict = filter(c)
    if (verdict.keep) kept.push(c)
    else heldBack.push({ item: c, reason: verdict.reason })
  }
  kept.sort(compareForAttention)
  const selected = kept.slice(0, k)
  for (const overflow of kept.slice(k)) {
    heldBack.push({ item: overflow, reason: `ranked below the top ${k} for this block` })
  }
  return { selected, heldBack }
}

/**
 * Caps a whole briefing at MAX_PER_BRIEFING while preserving block order.
 * The cap is a limit on attention, so it is enforced on the composed briefing
 * and not left to the sum of the blocks.
 */
export function capBriefing<T>(blocks: readonly { id: string; items: readonly T[] }[], max = MAX_PER_BRIEFING): {
  blocks: { id: string; items: T[] }[]
  dropped: number
} {
  let budget = max
  let dropped = 0
  const out = blocks.map((b) => {
    const take = Math.max(0, Math.min(budget, b.items.length))
    budget -= take
    dropped += b.items.length - take
    return { id: b.id, items: b.items.slice(0, take) }
  })
  return { blocks: out, dropped }
}
