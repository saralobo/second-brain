import type { ProviderPolicy } from './provider'
import { BOUNDARY_RULES, isDenied } from './classification'
import type { DataClass } from './classification'

/**
 * Provider policy gate.
 *
 * Sits before the budget gate on purpose: a call that policy forbids must
 * never consume budget headroom, even notionally.
 */
export type PolicyDecision =
  | { allowed: true; conditional: boolean }
  | { allowed: false; reason: string; deniedClass: DataClass }

export interface PolicyInput {
  classes: readonly DataClass[]
  policy: ProviderPolicy
  /** Whether the boundary pipeline actually applied redaction. */
  redactionApplied: boolean
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  // CLASS 3 is absolute in V0. There is no automatic override.
  const restricted = input.classes.find(isDenied)
  if (restricted !== undefined) {
    return {
      allowed: false,
      deniedClass: restricted,
      reason: 'restricted content may not cross the provider boundary in V0',
    }
  }

  const conditional = input.classes.some((c) => BOUNDARY_RULES[c] === 'CONDITIONAL')

  if (conditional) {
    if (!input.redactionApplied) {
      return {
        allowed: false,
        deniedClass: 'CLASS_2',
        reason: 'work-context content requires redaction before it may be sent',
      }
    }
    if (input.policy.usedForTraining === true) {
      return {
        allowed: false,
        deniedClass: 'CLASS_2',
        reason: 'provider trains on submitted data; work-context content may not be sent',
      }
    }
    if (input.policy.usedForTraining === 'unknown') {
      return {
        allowed: false,
        deniedClass: 'CLASS_2',
        reason: 'provider training policy is unverified; work-context content may not be sent',
      }
    }
    if (!input.policy.allowedSensitivity.includes('sensitive')) {
      return {
        allowed: false,
        deniedClass: 'CLASS_2',
        reason: 'provider policy does not permit sensitive content',
      }
    }
  }

  return { allowed: true, conditional }
}
