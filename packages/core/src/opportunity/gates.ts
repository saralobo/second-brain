import type { ContextHealthState } from '../context/health'
import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { Sensitivity } from '../primitives/origin'

/**
 * Quality gates (spec §11).
 *
 * Gates are SEPARATE from the Value Vector and run BEFORE any policy. The
 * distinction matters: a gate answers "is this even admissible?", a policy
 * answers "is it worth it?". Collapsing them would let a high-value item talk
 * its way past a permission refusal.
 *
 * A blocked gate never deletes the opportunity. It stays recorded with the
 * reason attached, because an audit needs to see what AVA decided not to say.
 */
export type GateId =
  | 'grounding'
  | 'permission'
  | 'temporal_validity'
  | 'security'
  | 'context_health'
  | 'structured_output_validity'

export const GATE_IDS: readonly GateId[] = [
  'grounding', 'permission', 'temporal_validity', 'security',
  'context_health', 'structured_output_validity',
] as const

export interface GateResult {
  id: GateId
  passed: boolean
  /** Plain reason, always present — including when the gate passed. */
  reason: string
}

export interface GateReport {
  passed: boolean
  results: readonly GateResult[]
  blockedBy: readonly GateId[]
}

export interface GateInput {
  /** Every claim in the opportunity must point at real evidence. */
  evidenceIds: readonly string[]
  evidenceExists: boolean
  strength: EvidenceStrength
  contextHealth: ContextHealthState
  /** Highest sensitivity among the objects the opportunity refers to. */
  sensitivity: Sensitivity
  /** True when acting or showing needs a permission the user has not given. */
  permissionBlocked: boolean
  permissionDetail: string | null
  /** The window this opportunity is about, when it has one. */
  window: { from: Date | null; until: Date | null } | null
  now: Date
  /** False when a model produced malformed output on this path. */
  structuredOutputValid: boolean
}

export function evaluateGates(input: GateInput): GateReport {
  const results: GateResult[] = []

  results.push(
    input.evidenceIds.length > 0 && input.evidenceExists
      ? { id: 'grounding', passed: true, reason: `rests on ${input.evidenceIds.length} evidence item(s) that exist in the ledger` }
      : { id: 'grounding', passed: false, reason: 'no reachable evidence supports this opportunity' },
  )

  results.push(
    input.permissionBlocked
      ? { id: 'permission', passed: false, reason: input.permissionDetail ?? 'permission has not been given for this' }
      : { id: 'permission', passed: true, reason: 'no permission restriction applies' },
  )

  results.push(temporalValidity(input))

  // CLASS 3 material never becomes a proactive item: proactivity puts things
  // in front of a person unasked, which is the worst place for restricted data.
  results.push(
    input.sensitivity === 'restricted'
      ? { id: 'security', passed: false, reason: 'refers to restricted material, which is never surfaced proactively' }
      : { id: 'security', passed: true, reason: `sensitivity is ${input.sensitivity}` },
  )

  results.push(
    input.contextHealth === 'INSUFFICIENT'
      ? { id: 'context_health', passed: false, reason: 'context is INSUFFICIENT; a proactive claim would outrun what AVA can see' }
      : { id: 'context_health', passed: true, reason: `context is ${input.contextHealth}` },
  )

  results.push(
    input.structuredOutputValid
      ? { id: 'structured_output_validity', passed: true, reason: 'no malformed model output on this path' }
      : { id: 'structured_output_validity', passed: false, reason: 'model output failed structural validation' },
  )

  const blockedBy = results.filter((r) => !r.passed).map((r) => r.id)
  return { passed: blockedBy.length === 0, results, blockedBy }
}

function temporalValidity(input: GateInput): GateResult {
  const w = input.window
  if (w === null) return { id: 'temporal_validity', passed: true, reason: 'no time window applies' }
  if (w.until !== null && w.until.getTime() < input.now.getTime()) {
    return { id: 'temporal_validity', passed: false, reason: 'the window this refers to has already closed' }
  }
  if (w.from !== null && w.from.getTime() > input.now.getTime()) {
    return { id: 'temporal_validity', passed: false, reason: 'the window this refers to has not opened yet' }
  }
  return { id: 'temporal_validity', passed: true, reason: 'the window is open' }
}
