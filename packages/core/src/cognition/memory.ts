import type { ContentOrigin, Lineage } from '../primitives/origin'
import type { EvidenceStrength } from '../primitives/evidence-strength'
import { weakestOf } from '../primitives/evidence-strength'
import type { ContextHealthState } from '../context/health'

/**
 * Memory consolidation without recursive drift (baseline §14, spec §13.2).
 *
 * Everything here exists to stop one failure: a system summarising its own
 * summaries until a single observation looks like a body of evidence. The
 * rules are structural, so the failure is prevented rather than discouraged.
 */

/**
 * A derived view. A cache, never a source.
 *
 * `derivedFromEvidenceIds` must resolve to LEVEL-ZERO evidence — the ledger
 * rows — not to other views. That is what makes a view rebuildable and what
 * makes double-counting detectable.
 */
export interface MemoryView {
  id: string
  title: string
  summary: string
  /** Level-zero evidence ids only. A view of a view flattens to these. */
  derivedFromEvidenceIds: readonly string[]
  /** Always `system`: AVA wrote it. */
  contentOrigin: ContentOrigin
  strength: EvidenceStrength
  builtAt: Date
  /** Rebuilt from scratch when any source is corrected. */
  stale: boolean
}

export interface SupportItem {
  id: string
  contentOrigin: ContentOrigin
  lineage: Lineage
  /** Present for derived views; absent for level-zero evidence. */
  derivedFromEvidenceIds?: readonly string[]
}

/**
 * How many INDEPENDENT pieces of evidence support a claim.
 *
 * Three rules apply together, and each one closes a different route to
 * inflated support:
 *
 *  1. `system`-origin items never count. AVA restating a claim is not a
 *     second witness to it.
 *  2. A derived view resolves to the level-zero evidence beneath it. Source
 *     plus a summary of that source is ONE piece of evidence, not two.
 *  3. Items sharing a lineage root count once. The same content copied into
 *     three places still has one causal origin.
 */
export function countIndependentSupport(items: readonly SupportItem[]): number {
  const roots = new Set<string>()

  for (const item of items) {
    if (item.contentOrigin === 'system') continue

    const derived = item.derivedFromEvidenceIds
    if (derived && derived.length > 0) {
      // A view contributes the evidence beneath it, never itself.
      for (const evidenceId of derived) roots.add(`evidence:${evidenceId}`)
      continue
    }

    roots.add(item.lineage.rootRunId ? `run:${item.lineage.rootRunId}` : `evidence:${item.id}`)
  }
  return roots.size
}

/** A view never strengthens what it summarises. */
export function strengthOfView(sources: readonly EvidenceStrength[]): EvidenceStrength {
  return weakestOf(sources)
}

/**
 * The invariant behind `MemoryRecord.evidence_reachable` (S4-T05).
 *
 * A memory whose sources cannot be reached is an unfalsifiable belief: the
 * user cannot check it, correct it, or see where it came from. Such a record
 * must not be storable, so this is checked on write and not merely reported.
 */
export function evidenceReachable(
  derivedFromEvidenceIds: readonly string[],
  existingEvidenceIds: ReadonlySet<string>,
): boolean {
  if (derivedFromEvidenceIds.length === 0) return false
  return derivedFromEvidenceIds.every((id) => existingEvidenceIds.has(id))
}

export interface PromotionInput {
  /** Support for the claim, already including any derived views. */
  support: readonly SupportItem[]
  strengths: readonly EvidenceStrength[]
  contextHealth: ContextHealthState
  /** Unresolved contradictions touching this claim. */
  materialConflicts: number
  /** True when the claim carries a scope and a time it refers to. */
  scoped: boolean
  /** Damage if the claim is applied when wrong. */
  riskOfMisapplication: 'low' | 'medium' | 'high'
}

export type PromotionDecision =
  | { promote: true; strength: EvidenceStrength; reasons: readonly string[] }
  | { promote: false; reasons: readonly string[] }

/** Minimum independent support before a claim may stabilise. */
export const MIN_INDEPENDENT_SUPPORT = 2

/**
 * Promotion to stabilized semantic knowledge (baseline §14).
 *
 * Deliberately conservative and entirely deterministic — no model score
 * participates, because a model's confidence in its own output is exactly the
 * `fake confidence` failure mode the baseline names. When the rules are not
 * met the claim simply stays episodic, which is a correct resting state and
 * not a degraded one.
 */
export function evaluatePromotion(input: PromotionInput): PromotionDecision {
  const reasons: string[] = []
  let ok = true

  const independent = countIndependentSupport(input.support)
  if (independent < MIN_INDEPENDENT_SUPPORT) {
    ok = false
    reasons.push(`only ${independent} independent source(s); ${MIN_INDEPENDENT_SUPPORT} required`)
  } else {
    reasons.push(`${independent} independent source(s)`)
  }

  if (input.support.every((s) => s.contentOrigin === 'system')) {
    ok = false
    reasons.push('all support is system-generated; AVA cannot corroborate itself')
  }

  if (input.contextHealth !== 'HEALTHY') {
    ok = false
    reasons.push(`context health is ${input.contextHealth}; promotion requires HEALTHY`)
  }

  if (input.materialConflicts > 0) {
    ok = false
    reasons.push(`${input.materialConflicts} unresolved material conflict(s)`)
  }

  if (!input.scoped) {
    ok = false
    reasons.push('claim carries no scope or temporal validity')
  }

  const strength = weakestOf(input.strengths)
  if (strength === 'SPECULATIVE') {
    ok = false
    reasons.push('weakest supporting evidence is SPECULATIVE')
  }

  // High-risk claims need direct evidence, not merely enough of it.
  if (input.riskOfMisapplication === 'high' && strength !== 'ESTABLISHED') {
    ok = false
    reasons.push('high misapplication risk requires ESTABLISHED evidence')
  }

  return ok ? { promote: true, strength, reasons } : { promote: false, reasons }
}
