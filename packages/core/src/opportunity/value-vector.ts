import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { Sensitivity } from '../primitives/origin'
import type { ContextHealthState } from '../context/health'

/**
 * Value Vector (baseline §18, spec §12).
 *
 * Thirteen factors recorded ONCE and read by three independent policies.
 *
 * Two invariants are structural here, not conventional:
 *
 *  1. There is no scalar. No `score`, no `confidence`, no weighted sum. A
 *     single number would let one factor silently pay for another, and it
 *     would present false precision the evidence does not support.
 *  2. Every factor carries its own origin. "Where did this come from?" must be
 *     answerable per factor, because a factor read from a declaration and a
 *     factor guessed by a rule deserve very different trust.
 */
export type FactorOrigin = 'deterministic' | 'declared' | 'rule' | 'inferred'

/**
 * One factor. The value is ordinal, categorical or boolean — never a float.
 * `basis` is a plain sentence naming what produced the value.
 */
export interface Factor<T extends string | boolean> {
  value: T
  origin: FactorOrigin
  basis: string
  /** Evidence, declaration or change ids the value rests on, when any. */
  derivedFrom: readonly string[]
}

export type Alignment = 'direct' | 'indirect' | 'none' | 'unknown'
export type Consequence = 'high' | 'medium' | 'low' | 'unknown'
export type TimeSensitivity = 'immediate' | 'soon' | 'later' | 'none' | 'unknown'
export type Novelty = 'new' | 'already_known' | 'uncertain'
export type Effort = 'low' | 'medium' | 'high' | 'unknown'
export type Reversibility = 'reversible' | 'compensable' | 'irreversible' | 'unknown'
export type PermissionScope = 'allowed' | 'confirm_required' | 'not_allowed' | 'unknown'
export type PreparationCost = 'none' | 'low' | 'medium' | 'high' | 'unknown'
export type DependencyReach = 'none' | 'single' | 'several' | 'unknown'
export type SensitivityRisk = 'low' | 'elevated' | 'high'

export interface ValueVector {
  alignment: Factor<Alignment>
  consequence: Factor<Consequence>
  timeSensitivity: Factor<TimeSensitivity>
  evidenceStrength: Factor<EvidenceStrength>
  contextHealth: Factor<ContextHealthState>
  novelty: Factor<Novelty>
  actionability: Factor<boolean>
  effort: Factor<Effort>
  reversibility: Factor<Reversibility>
  permissionScope: Factor<PermissionScope>
  preparationCost: Factor<PreparationCost>
  dependencyReach: Factor<DependencyReach>
  sensitivityRisk: Factor<SensitivityRisk>
}

export const VALUE_VECTOR_FACTORS: readonly (keyof ValueVector)[] = [
  'alignment', 'consequence', 'timeSensitivity', 'evidenceStrength', 'contextHealth',
  'novelty', 'actionability', 'effort', 'reversibility', 'permissionScope',
  'preparationCost', 'dependencyReach', 'sensitivityRisk',
] as const

export function factor<T extends string | boolean>(
  value: T, origin: FactorOrigin, basis: string, derivedFrom: readonly string[] = [],
): Factor<T> {
  return { value, origin, basis, derivedFrom }
}

/**
 * True when every factor names where it came from. A vector that fails this
 * cannot be explained in Why, so it must not reach a policy.
 */
export function hasCompleteProvenance(v: ValueVector): boolean {
  return VALUE_VECTOR_FACTORS.every((k) => {
    const f = v[k] as Factor<string | boolean>
    return typeof f?.basis === 'string' && f.basis.trim().length > 0
  })
}

/** Factors whose value could not be determined. Shown, never hidden. */
export function unknownFactors(v: ValueVector): (keyof ValueVector)[] {
  return VALUE_VECTOR_FACTORS.filter((k) => (v[k] as Factor<string | boolean>).value === 'unknown')
}

export function sensitivityRiskOf(s: Sensitivity): SensitivityRisk {
  if (s === 'restricted') return 'high'
  if (s === 'sensitive') return 'elevated'
  return 'low'
}

/**
 * Novelty in V0 (brief §16).
 *
 * `already_known` requires observability AVA does not have: nothing records
 * that the user read something. Absent that, the honest value is `uncertain`,
 * and inventing high novelty to make an item look more interesting is exactly
 * the proactivity-noise failure mode the baseline names.
 *
 * The one case we can honestly call `already_known` is an opportunity whose
 * identity was shown before and whose underlying condition has not changed.
 */
export function noveltyFor(input: {
  previouslyShown: boolean
  materiallyChangedSinceShown: boolean
}): { value: Novelty; basis: string } {
  if (input.previouslyShown && !input.materiallyChangedSinceShown) {
    return {
      value: 'already_known',
      basis: 'this same condition was already shown and has not changed since',
    }
  }
  if (input.previouslyShown) {
    return { value: 'new', basis: 'shown before, but the underlying condition changed materially' }
  }
  return { value: 'new', basis: 'this condition has not been shown before' }
}
