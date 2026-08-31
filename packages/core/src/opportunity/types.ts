import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { ContentOrigin } from '../primitives/origin'
import type { ContextHealthState } from '../context/health'
import type { ValueVector } from './value-vector'
import type { GateReport } from './gates'
import type { PolicyOutcome } from './policies'

/**
 * Opportunity (baseline §17, spec §11).
 *
 * Exactly five classes. This list is closed on purpose: a sixth class is a
 * new claim about what deserves a person's attention, and that is an
 * architectural decision, not an implementation detail.
 */
export type OpportunityClass =
  | 'unpropagated_decision'
  | 'upcoming_commitment'
  | 'invalidated_work'
  | 'unresolved_question'
  | 'closing_risk'

export const OPPORTUNITY_CLASSES: readonly OpportunityClass[] = [
  'unpropagated_decision', 'upcoming_commitment', 'invalidated_work',
  'unresolved_question', 'closing_risk',
] as const

/**
 * Lifecycle (spec §3.8), with the two states the spec names for withdrawal.
 *
 * `suppressed` is deliberately a state and not a deletion: an opportunity a
 * gate refused is exactly the thing an audit needs to see. Slice 6 adds
 * `accepted`/`rejected`, which depend on feedback that does not exist yet.
 */
export type OpportunityStatus =
  | 'candidate' | 'eligible' | 'shown' | 'prepared'
  | 'suppressed' | 'superseded' | 'expired'

/**
 * An affected object, carried by reference. The opportunity never copies the
 * object's content: the ledger holds it, and a copy here could not be
 * reclassified by a later annotation.
 */
export interface AffectedObject {
  objectId: string
  objectType: string
  /** Why this object is in the list. Never asserts definitive invalidation. */
  relation: 'potentially_impacted' | 'potentially_outdated' | 'subject'
  viaKind: string | null
  depth: number
}

/**
 * What AVA could see AT GENERATION TIME.
 *
 * This is the anti-retroactivity record (spec §21). It is written once and
 * never recomputed, so an inspection months later shows the context that
 * actually produced the opportunity rather than today's better-informed view.
 */
export interface GenerationContext {
  generatedAt: Date
  /** The checkpoint window this generation ran for. */
  checkpointId: string | null
  /** Every evidence id that existed and was visible at generation time. */
  knownEvidenceIds: readonly string[]
  /** State versions current at generation time. */
  knownStateVersionIds: readonly string[]
  latestEvidenceObservedAt: Date | null
}

export interface OpportunityCandidate {
  id: string
  /** Stable identity across checkpoints. Two runs of the same unresolved
   *  condition produce the same key and therefore one opportunity. */
  identityKey: string
  opportunityClass: OpportunityClass
  workstreamId: string
  status: OpportunityStatus

  /** Change is the operational trigger (baseline §9). */
  triggerChangeIds: readonly string[]
  originEvidenceIds: readonly string[]
  impactedFrom: string | null
  affectedObjects: readonly AffectedObject[]

  /** Language obeys evidence: "may need review", never "you must redo". */
  headline: string
  detail: string
  minimalAction: string | null

  strength: EvidenceStrength
  contextHealth: ContextHealthState
  contentOrigin: ContentOrigin

  valueVector: ValueVector
  gates: GateReport
  investigate: PolicyOutcome
  show: PolicyOutcome
  prepare: PolicyOutcome

  generation: GenerationContext
  /** Version within the identity chain. A material change opens a new one. */
  version: number
  supersedesOpportunityId: string | null
  decisionRecordIds: readonly string[]
  expiresAt: Date | null
}
