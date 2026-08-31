import type { ValueVector } from './value-vector'
import type { GateReport } from './gates'

/**
 * The three policies (baseline §18, spec §12).
 *
 * They read the SAME Value Vector and decide independently. One policy passing
 * says nothing about the others: investigating is cheap and private, showing
 * spends a person's attention, and preparing spends money before anyone asked.
 *
 * There is no `opportunity_score`. Each policy states its own reasons.
 */
export const POLICY_VERSION = '1.0.0'

export type PolicyId = 'investigate' | 'show' | 'prepare'

export type PolicyVerdict =
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED_BY_GATE'
  | 'BLOCKED_BY_HEALTH'
  | 'DENIED_BY_BUDGET'
  | 'DENIED_BY_PERMISSION'

export interface PolicyOutcome {
  policy: PolicyId
  version: string
  verdict: PolicyVerdict
  /** Only reasons that actually participated. Never a post-hoc narrative. */
  reasons: readonly string[]
  /** Factors the policy read, so Why can show what it ignored. */
  factorsRead: readonly (keyof ValueVector)[]
}

function outcome(
  policy: PolicyId, verdict: PolicyVerdict, reasons: string[],
  factorsRead: (keyof ValueVector)[],
): PolicyOutcome {
  return { policy, version: POLICY_VERSION, verdict, reasons, factorsRead }
}

/**
 * Investigate: is it worth spending processing to reduce uncertainty?
 *
 * The most permissive of the three, and deliberately so — investigating is
 * internal, costs no attention, and is how a `DEGRADED` context gets better.
 * A gate failure still stops it, because investigating restricted material is
 * not made acceptable by being quiet.
 */
export function evaluateInvestigate(v: ValueVector, gates: GateReport): PolicyOutcome {
  const read: (keyof ValueVector)[] = [
    'consequence', 'evidenceStrength', 'contextHealth', 'sensitivityRisk', 'dependencyReach',
  ]
  if (!gates.passed && gates.blockedBy.some((g) => g === 'security' || g === 'permission')) {
    return outcome('investigate', 'BLOCKED_BY_GATE',
      [`blocked by the ${gates.blockedBy.join(', ')} gate`], read)
  }
  if (v.consequence.value === 'low' && v.evidenceStrength.value === 'ESTABLISHED') {
    return outcome('investigate', 'FAIL',
      ['consequence is low and the evidence is already established; there is nothing left to learn'], read)
  }
  const reasons: string[] = []
  if (v.evidenceStrength.value !== 'ESTABLISHED') reasons.push('evidence is not established, so investigation could strengthen or refute it')
  if (v.contextHealth.value !== 'HEALTHY') reasons.push('context is incomplete, and investigation is how that gets repaired')
  if (v.consequence.value === 'high') reasons.push('consequence is high enough to justify looking closer')
  if (reasons.length === 0) reasons.push('the condition is worth confirming before anything is said about it')
  return outcome('investigate', 'PASS', reasons, read)
}

/**
 * Show: does this deserve a place in the next checkpoint?
 *
 * NOTE ON THE INPUT TYPE. This function takes the Value Vector and the gates.
 * It does not take preparation status, and there is no parameter through which
 * one could be passed. That is the preparation-bias guard (baseline §18) made
 * structural rather than conventional: money already spent cannot argue for
 * a person's attention, and here it has no way to try.
 */
export function evaluateShow(v: ValueVector, gates: GateReport): PolicyOutcome {
  const read: (keyof ValueVector)[] = [
    'alignment', 'consequence', 'timeSensitivity', 'evidenceStrength',
    'contextHealth', 'novelty', 'actionability',
  ]
  if (!gates.passed) {
    return outcome('show',
      gates.blockedBy.includes('context_health') ? 'BLOCKED_BY_HEALTH'
        : gates.blockedBy.includes('permission') ? 'DENIED_BY_PERMISSION' : 'BLOCKED_BY_GATE',
      gates.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.reason}`), read)
  }
  if (v.novelty.value === 'already_known') {
    return outcome('show', 'FAIL',
      ['this was already shown and nothing about it has changed'], read)
  }
  if (!v.actionability.value) {
    return outcome('show', 'FAIL',
      ['there is no concrete next step, so showing it would only add noise'], read)
  }
  if (v.alignment.value === 'none') {
    return outcome('show', 'FAIL', ['it does not relate to anything the user is working towards'], read)
  }
  if (v.consequence.value === 'low' && v.timeSensitivity.value !== 'immediate') {
    return outcome('show', 'FAIL',
      ['low consequence and no time pressure; plausibility alone is not enough to interrupt'], read)
  }
  const reasons = [
    `consequence is ${v.consequence.value}`,
    `time sensitivity is ${v.timeSensitivity.value}`,
    'there is a concrete next step',
  ]
  if (v.contextHealth.value === 'DEGRADED') {
    reasons.push('context is DEGRADED, so this is shown with the gap stated and reduced assertiveness')
  }
  return outcome('show', 'PASS', reasons, read)
}

export interface PrepareInput {
  vector: ValueVector
  gates: GateReport
  /** Budget authorisation for the preparation, when a model would be used. */
  budgetAllowed: boolean
  budgetReason: string | null
  /** Declared cognition limiting autonomy in this scope, when any applies. */
  autonomyLimits: readonly { cognitionId: string; content: string }[]
  requiresConfirmation: boolean
}

/**
 * Prepare: is it worth building something reversible before being asked?
 *
 * The strictest of the three. It spends money and produces an artifact that
 * may never be wanted, so it demands an established, reversible, low-cost,
 * well-grounded case — and it stops dead at a declared autonomy limit.
 *
 * Behavioral hypotheses are absent from this input on purpose. A pattern AVA
 * noticed must never authorise AVA to act.
 */
export function evaluatePrepare(input: PrepareInput): PolicyOutcome {
  const v = input.vector
  const read: (keyof ValueVector)[] = [
    'consequence', 'evidenceStrength', 'contextHealth', 'reversibility',
    'permissionScope', 'preparationCost', 'effort', 'sensitivityRisk',
  ]
  if (!input.gates.passed) {
    return outcome('prepare',
      input.gates.blockedBy.includes('context_health') ? 'BLOCKED_BY_HEALTH' : 'BLOCKED_BY_GATE',
      input.gates.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.reason}`), read)
  }
  if (input.autonomyLimits.length > 0) {
    return outcome('prepare', 'DENIED_BY_PERMISSION',
      input.autonomyLimits.map((l) => `a declared autonomy limit applies: "${l.content}"`), read)
  }
  if (input.requiresConfirmation) {
    return outcome('prepare', 'DENIED_BY_PERMISSION',
      ['the user declared that this kind of action must be confirmed first'], read)
  }
  // Context health limits proactivity: preparing on top of a known gap
  // produces confident-looking work built on what AVA could not see.
  if (v.contextHealth.value !== 'HEALTHY') {
    return outcome('prepare', 'BLOCKED_BY_HEALTH',
      [`context is ${v.contextHealth.value}; preparation would rest on context AVA does not have`], read)
  }
  if (v.reversibility.value !== 'reversible') {
    return outcome('prepare', 'FAIL',
      [`preparation is only allowed for reversible work; this is ${v.reversibility.value}`], read)
  }
  if (v.evidenceStrength.value === 'SPECULATIVE') {
    return outcome('prepare', 'FAIL',
      ['the evidence is speculative; preparing on it would manufacture work from a guess'], read)
  }
  if (!input.budgetAllowed) {
    return outcome('prepare', 'DENIED_BY_BUDGET',
      [input.budgetReason ?? 'the operational safety cap refused this preparation'], read)
  }
  if (v.preparationCost.value === 'high' || v.effort.value === 'high') {
    return outcome('prepare', 'FAIL',
      ['the preparation cost is high relative to a request nobody has made'], read)
  }
  return outcome('prepare', 'PASS', [
    'the work is reversible',
    `evidence is ${v.evidenceStrength.value}`,
    'context is HEALTHY and no declared limit applies',
  ], read)
}
