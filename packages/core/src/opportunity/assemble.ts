import { ulid } from '../primitives/id'
import { sensitivityRiskOf, factor, noveltyFor } from './value-vector'
import { evaluateGates } from './gates'
import { evaluateInvestigate, evaluatePrepare, evaluateShow } from './policies'
import { identityKeyFor } from './identity'
import type { Sensitivity } from '../primitives/origin'
import type { ContextHealthState } from '../context/health'
import type { DeclaredCognition } from '../cognition/types'
import type { DetectedCondition } from './detect'
import type { ValueVector } from './value-vector'
import type { OpportunityCandidate } from './types'

/**
 * Assembly: condition → Value Vector → gates → three policies → candidate.
 *
 * The order matters and is fixed. Gates run before policies, and the policies
 * run independently over one vector that was computed once. Nothing here reads
 * a model score, and nothing here reads whether the item was prepared.
 */
export interface AssembleInput {
  condition: DetectedCondition
  now: Date
  contextHealth: ContextHealthState
  /** Highest sensitivity among the objects involved. */
  sensitivity: Sensitivity
  /** True when the evidence ids actually resolve in the ledger. */
  evidenceExists: boolean
  /** Declarations whose scope matched this context. Already filtered. */
  applicableDeclarations: readonly DeclaredCognition[]
  /**
   * Hypotheses relevant to this context, carried for display only.
   *
   * They are recorded on the candidate as shadow signals and are NOT passed to
   * any policy: a pattern AVA noticed must never authorise AVA to act.
   */
  shadowHypothesisIds: readonly string[]
  /** Whether this identity was shown before, and whether it has moved since. */
  previouslyShown: boolean
  materiallyChangedSinceShown: boolean
  /** Whether the workstream records a goal this relates to. */
  relatedGoalIds: readonly string[]
  budgetAllowed: boolean
  budgetReason: string | null
  structuredOutputValid: boolean
  checkpointId: string | null
  knownEvidenceIds: readonly string[]
  knownStateVersionIds: readonly string[]
  latestEvidenceObservedAt: Date | null
  version?: number
  supersedesOpportunityId?: string | null
}

/** Declarations that forbid AVA acting without being asked, in this scope. */
function autonomyLimitsIn(declarations: readonly DeclaredCognition[]) {
  return declarations
    .filter((d) => d.cognitionType === 'autonomy_limit')
    .map((d) => ({ cognitionId: d.id, content: d.content }))
}

function requiresConfirmation(declarations: readonly DeclaredCognition[]): boolean {
  return declarations.some((d) => d.cognitionType === 'must_confirm_action')
}

export function buildValueVector(input: AssembleInput): ValueVector {
  const c = input.condition
  const declarationIds = input.applicableDeclarations.map((d) => d.id)
  const novelty = noveltyFor(input)

  // Consequence and time sensitivity come from the class and the recorded
  // window — from structure, not from a model's impression of importance.
  const consequence = consequenceFor(c)
  const timeSensitivity = timeSensitivityFor(c, input.now)
  const reach = c.affectedObjects.length === 0 ? 'none'
    : c.affectedObjects.length === 1 ? 'single' : 'several'

  return {
    alignment: input.relatedGoalIds.length > 0
      ? factor('direct', 'deterministic',
        'the objects involved are linked to a recorded goal in this workstream', input.relatedGoalIds)
      : factor('indirect', 'deterministic',
        'no goal link is recorded, so the relation to what the user is pursuing is not established', []),
    consequence: factor(consequence.value, 'rule', consequence.basis, c.triggerChangeIds),
    timeSensitivity: factor(timeSensitivity.value, 'rule', timeSensitivity.basis, []),
    evidenceStrength: factor(c.strength, 'deterministic',
      'the weakest link among the change and the objects involved', c.originEvidenceIds),
    contextHealth: factor(input.contextHealth, 'deterministic',
      'aggregated for the opportunity-generation task at this checkpoint', []),
    novelty: factor(novelty.value, 'deterministic', novelty.basis, []),
    actionability: factor(c.actionable, 'rule',
      c.minimalAction === null ? 'no concrete next step could be named' : `a concrete next step exists: ${c.minimalAction}`, []),
    effort: factor(effortFor(c), 'rule',
      'estimated from the class of opportunity and the number of objects involved', []),
    reversibility: factor('reversible', 'rule',
      'the suggested step is a review or a decision, both of which can be undone', []),
    permissionScope: factor(
      requiresConfirmation(input.applicableDeclarations) ? 'confirm_required'
        : autonomyLimitsIn(input.applicableDeclarations).length > 0 ? 'not_allowed' : 'allowed',
      input.applicableDeclarations.length > 0 ? 'declared' : 'deterministic',
      input.applicableDeclarations.length > 0
        ? 'a declaration in scope constrains what AVA may do here'
        : 'no declaration constrains this scope',
      declarationIds),
    preparationCost: factor(
      c.opportunityClass === 'upcoming_commitment' ? 'medium' : 'low', 'rule',
      'estimated from what preparing this class of item would require', []),
    dependencyReach: factor(reach, 'deterministic',
      `${c.affectedObjects.length} object(s) reached along declared relations`,
      c.affectedObjects.map((a) => a.objectId)),
    sensitivityRisk: factor(sensitivityRiskOf(input.sensitivity), 'deterministic',
      `highest sensitivity among the objects involved is ${input.sensitivity}`, []),
  }
}

function consequenceFor(c: DetectedCondition): { value: 'high' | 'medium' | 'low'; basis: string } {
  if (c.opportunityClass === 'invalidated_work' || c.opportunityClass === 'closing_risk') {
    return { value: 'high', basis: `${c.opportunityClass} carries a loss that acting later cannot undo` }
  }
  if (c.opportunityClass === 'unpropagated_decision') {
    return c.affectedObjects.length > 1
      ? { value: 'high', basis: 'several dependent items were written against the earlier decision' }
      : { value: 'medium', basis: 'one dependent item was written against the earlier decision' }
  }
  if (c.opportunityClass === 'upcoming_commitment') {
    return { value: 'medium', basis: 'a commitment falls due with work still unfinished' }
  }
  // An open question is low consequence on its own. Blocking a commitment
  // that falls due shortly is what gives it weight — and the rule that fired
  // is the only thing that knows which of the two cases this is.
  if (c.ruleId.endsWith('blocks_approaching_commitment')) {
    return { value: 'medium', basis: 'the question blocks a commitment that falls due soon' }
  }
  return { value: 'low', basis: 'an open question carries no loss by itself' }
}

function timeSensitivityFor(
  c: DetectedCondition, now: Date,
): { value: 'immediate' | 'soon' | 'later' | 'none'; basis: string } {
  const until = c.window?.until ?? null
  if (until === null) {
    return { value: 'later', basis: 'no closing window is recorded, so waiting costs nothing measurable' }
  }
  const days = (until.getTime() - now.getTime()) / 86_400_000
  if (days <= 1) return { value: 'immediate', basis: 'the window closes within a day' }
  if (days <= 7) return { value: 'soon', basis: 'the window closes within a week' }
  return { value: 'later', basis: 'the window is more than a week away' }
}

function effortFor(c: DetectedCondition): 'low' | 'medium' | 'high' {
  if (c.affectedObjects.length > 2) return 'high'
  return c.opportunityClass === 'unresolved_question' ? 'low' : 'medium'
}

/**
 * Builds the full candidate. Every policy verdict and every gate reason is
 * recorded on the object, including the failures: an opportunity a gate
 * refused stays visible to an audit rather than disappearing.
 */
export function assembleOpportunity(input: AssembleInput): OpportunityCandidate {
  const c = input.condition
  const vector = buildValueVector(input)

  const gates = evaluateGates({
    evidenceIds: c.originEvidenceIds,
    evidenceExists: input.evidenceExists,
    strength: c.strength,
    contextHealth: input.contextHealth,
    sensitivity: input.sensitivity,
    // A declared autonomy limit constrains what AVA may DO, not what she may
    // SAY. Telling someone their proposal rests on a decision that changed is
    // information they own; letting "never draft for me unasked" also silence
    // that would turn a limit on action into a limit on honesty. The Prepare
    // Policy is where the limit binds.
    permissionBlocked: false,
    permissionDetail: null,
    window: c.window,
    now: input.now,
    structuredOutputValid: input.structuredOutputValid,
  })

  const investigate = evaluateInvestigate(vector, gates)
  // Show reads the vector and the gates. It is not given, and cannot obtain,
  // the preparation status.
  const show = evaluateShow(vector, gates)
  const prepare = evaluatePrepare({
    vector, gates,
    budgetAllowed: input.budgetAllowed,
    budgetReason: input.budgetReason,
    autonomyLimits: autonomyLimitsIn(input.applicableDeclarations),
    requiresConfirmation: requiresConfirmation(input.applicableDeclarations),
  })

  return {
    id: ulid(input.now.getTime()),
    identityKey: identityKeyFor({
      opportunityClass: c.opportunityClass,
      workstreamId: c.workstreamId,
      subjectObjectId: c.subjectObjectId,
      affectedObjectIds: c.affectedObjects.map((a) => a.objectId),
    }),
    opportunityClass: c.opportunityClass,
    workstreamId: c.workstreamId,
    status: gates.passed ? (show.verdict === 'PASS' ? 'eligible' : 'candidate') : 'suppressed',
    triggerChangeIds: c.triggerChangeIds,
    originEvidenceIds: c.originEvidenceIds,
    impactedFrom: c.subjectObjectId,
    affectedObjects: c.affectedObjects,
    headline: c.headline,
    detail: c.detail,
    minimalAction: c.minimalAction,
    strength: c.strength,
    contextHealth: input.contextHealth,
    // An opportunity is something AVA produced. It is system-origin and can
    // never corroborate the evidence it was derived from.
    contentOrigin: 'system',
    valueVector: vector,
    gates,
    investigate, show, prepare,
    generation: {
      generatedAt: input.now,
      checkpointId: input.checkpointId,
      knownEvidenceIds: input.knownEvidenceIds,
      knownStateVersionIds: input.knownStateVersionIds,
      latestEvidenceObservedAt: input.latestEvidenceObservedAt,
    },
    version: input.version ?? 1,
    supersedesOpportunityId: input.supersedesOpportunityId ?? null,
    decisionRecordIds: [],
    expiresAt: c.window?.until ?? null,
  }
}

export { autonomyLimitsIn }
