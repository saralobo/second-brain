import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { ContentOrigin, Sensitivity } from '../primitives/origin'

/**
 * Declared Cognition and Behavioral Hypotheses (baseline §19, §20; spec §15).
 *
 * The point of this module is a distinction the type system is asked to keep:
 * what the user TOLD AVA is not the same kind of thing as what AVA NOTICED.
 * They are separate types with separate authority, and no code path turns the
 * second into the first.
 */

/** The nine declared categories (spec §15.1). No tenth is added. */
export type CognitionType =
  | 'principle'
  | 'quality_criterion'
  | 'contextual_preference'
  | 'autonomy_limit'
  | 'must_confirm_action'
  | 'never_infer_subject'
  | 'positive_example'
  | 'negative_example'
  | 'exception'

export const COGNITION_TYPES: readonly CognitionType[] = [
  'principle', 'quality_criterion', 'contextual_preference', 'autonomy_limit',
  'must_confirm_action', 'never_infer_subject', 'positive_example',
  'negative_example', 'exception',
] as const

export function isCognitionType(v: unknown): v is CognitionType {
  return typeof v === 'string' && (COGNITION_TYPES as readonly string[]).includes(v)
}

/**
 * How a declaration entered the system.
 *
 * There are exactly three routes, and observation is not one of them. A
 * pattern AVA noticed can become a hypothesis; it can never become a
 * declaration without the user saying so.
 */
export type CognitionOrigin = 'declared' | 'confirmed' | 'corrected'

export const COGNITION_ORIGINS: readonly CognitionOrigin[] = ['declared', 'confirmed', 'corrected'] as const

export type CognitionStatus = 'active' | 'superseded' | 'revoked'

/**
 * Where a declaration applies.
 *
 * Every dimension is optional, and an ABSENT dimension means "not constrained
 * on this axis" — not "applies everywhere unconditionally". The distinction
 * matters when a preference stated for one kind of work gets asked about in
 * another: an unscoped declaration is broad because the user left it broad,
 * and a scoped one must not silently widen.
 */
export interface CognitionScope {
  /** e.g. "craft", "strategy". Free text as the user phrased it. */
  workType?: string | null
  workstreamId?: string | null
  activity?: string | null
  decisionCategory?: string | null
  artifactType?: string | null
  /** Temporal validity. Absent means "until superseded", never "expired". */
  validFrom?: Date | null
  validUntil?: Date | null
  /**
   * Contexts explicitly carved out by the user. An exception BLOCKS the
   * declaration where it matches, and is matched with the same rules as the
   * scope itself.
   */
  exceptions?: readonly CognitionScope[]
}

export const EMPTY_SCOPE: CognitionScope = {}

export interface DeclaredCognition {
  id: string
  content: string
  cognitionType: CognitionType
  scope: CognitionScope
  /** Free-text note on who/what the declaration is addressed to. */
  audience: string | null
  declaredAt: Date
  effectiveAt: Date | null
  supersededBy: string | null
  /** The version chain this declaration belongs to. */
  rootId: string
  version: number
  status: CognitionStatus
  origin: CognitionOrigin
  /** Evidence in the ledger that carries the user's own words. Never empty. */
  evidenceIds: readonly string[]
  /** Set when this declaration confirms a hypothesis. */
  confirmsHypothesisId: string | null
  workstreamId: string | null
  sensitivity: Sensitivity
  /** Declared Cognition is ESTABLISHED inside its declared scope (spec §12). */
  strength: EvidenceStrength
}

/**
 * A raw behavioural observation. The lowest rung of the authority ladder
 * (baseline §20) and the only input a hypothesis may be built from.
 */
export interface BehavioralObservation {
  id: string
  description: string
  context: string
  evidenceIds: readonly string[]
  /** What else the user could have chosen. Empty means the choice was forced. */
  alternativesAvailable: readonly string[]
  contentOrigin: ContentOrigin
  observedAt: Date
  workstreamId: string | null
}

export type HypothesisStatus = 'candidate' | 'supported' | 'contradicted' | 'expired' | 'confirmed'

/**
 * A Behavioral Hypothesis. Shadow mode, always (spec §15.2).
 *
 * `falsifiableDescription` must describe an observed SITUATION, not a trait.
 * "In observed situations where X, Y happened often" is admissible;
 * "the user's principle is Y" is not — the second is a personality claim, and
 * the difference must live in the schema rather than in good intentions.
 */
export interface BehavioralHypothesis {
  id: string
  falsifiableDescription: string
  /** Always `observed`. A declared item is not a hypothesis. */
  knowledgeOrigin: 'observed'
  context: string
  scope: CognitionScope
  evidenceIds: readonly string[]
  counterEvidenceIds: readonly string[]
  confirmationOpportunitiesObserved: number
  /** Mandatory and non-empty: choosing the least bad option is not a preference. */
  alternativesAvailable: readonly string[]
  possibleConfounder: string | null
  status: HypothesisStatus
  /** Never above SPECULATIVE while unconfirmed. */
  strength: EvidenceStrength
  costOfMisapplication: 'low' | 'medium' | 'high'
  /** True always in V0: a hypothesis governs nothing. */
  shadowMode: true
  workstreamId: string | null
  sensitivity: Sensitivity
  createdAt: Date
  /** Set when the user turned this into a declaration. */
  confirmedByCognitionId: string | null
  rejectedReason: string | null
}

/** The three memory classes of baseline §14. There is no fourth. */
export type MemoryClass = 'episodic' | 'semantic_stabilized' | 'declared_cognition'

export const MEMORY_CLASSES: readonly MemoryClass[] = [
  'episodic', 'semantic_stabilized', 'declared_cognition',
] as const

/**
 * MemoryRecord (spec §3.11) — the query surface over the three classes.
 *
 * `evidenceReachable` is an invariant, not a field to be read: no record may
 * exist for which the original evidence cannot be reached. A memory that
 * outlives its sources is an unfalsifiable belief.
 */
export interface MemoryRecord {
  id: string
  memoryClass: MemoryClass
  refId: string
  refType: 'declared_cognition' | 'state_object_version' | 'behavioral_hypothesis' | 'evidence'
  title: string
  /** Level-zero evidence this record resolves to. Never empty. */
  derivedFromEvidenceIds: readonly string[]
  evidenceReachable: boolean
  strength: EvidenceStrength
  promotedAt: Date | null
  promotionDecisionRecordId: string | null
  workstreamId: string | null
  createdAt: Date
}
