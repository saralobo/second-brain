/**
 * Feedback and Outcome (baseline §23, spec §3.12, §3.13, §16).
 *
 * The central rule of this slice is that the two dimensions never merge.
 * "Was AVA right?" and "did this deserve my attention now?" are different
 * questions with different answers, and a system that collapses them into one
 * number destroys exactly the information validation needs. There is no
 * reward score, no aggregate column, and no arithmetic anywhere in this file.
 */

/** Was AVA's claim actually correct? */
export type EpistemicVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'not_verifiable'

export const EPISTEMIC_VERDICTS: readonly EpistemicVerdict[] = [
  'correct', 'partially_correct', 'incorrect', 'not_verifiable',
] as const

/** Did this intervention deserve attention at this moment? */
export type DeliveryVerdict = 'valuable' | 'already_known' | 'irrelevant' | 'too_early' | 'too_late'

export const DELIVERY_VERDICTS: readonly DeliveryVerdict[] = [
  'valuable', 'already_known', 'irrelevant', 'too_early', 'too_late',
] as const

/**
 * What happened to a prepared artifact. A third, independent axis.
 *
 * Spec §16.1 names these six. An edited artifact is not a verdict on
 * correctness: editing does not reveal why it was edited (baseline §23).
 */
export type ArtifactVerdict =
  | 'used_as_is' | 'used_after_edit' | 'not_used' | 'not_shown' | 'expired' | 'replaced'

export const ARTIFACT_VERDICTS: readonly ArtifactVerdict[] = [
  'used_as_is', 'used_after_edit', 'not_used', 'not_shown', 'expired', 'replaced',
] as const

/** Feedback always points at something. There is no untargeted feedback. */
export type FeedbackTargetType = 'opportunity' | 'grounded_answer' | 'prepared_artifact'

export const FEEDBACK_TARGET_TYPES: readonly FeedbackTargetType[] = [
  'opportunity', 'grounded_answer', 'prepared_artifact',
] as const

export interface FeedbackRecord {
  id: string
  targetType: FeedbackTargetType
  targetId: string
  /** The opportunity this feedback belongs to, when the target is not one. */
  opportunityId: string | null
  /** The decision this feedback is ABOUT — referenced, never edited. */
  decisionRecordId: string | null

  /**
   * Three independent, independently nullable dimensions. A row may carry one,
   * two or all three. `null` means NOT PROVIDED — it is never a negative.
   */
  epistemic: EpistemicVerdict | null
  delivery: DeliveryVerdict | null
  artifact: ArtifactVerdict | null

  /** Optional free note. May be personal; never crosses a provider boundary. */
  reason: string | null

  givenAt: Date
  /** The feedback row this one corrects. The corrected row stays readable. */
  correctsFeedbackId: string | null
  supersededByFeedbackId: string | null
}

/**
 * Something the user did. Deliberately separate from feedback: thinking an
 * item was valuable and acting on it are different observations, and one is
 * not evidence for the other.
 */
export type UserActionKind =
  | 'reviewed' | 'updated_artifact' | 'made_decision' | 'dismissed' | 'other' | 'unknown'

export const USER_ACTION_KINDS: readonly UserActionKind[] = [
  'reviewed', 'updated_artifact', 'made_decision', 'dismissed', 'other', 'unknown',
] as const

export interface UserActionRecord {
  id: string
  opportunityId: string
  kind: UserActionKind
  description: string | null
  /** When the action happened, as reported. Never the write time. */
  actedAt: Date
  relatedObjectId: string | null
  relatedArtifactId: string | null
  recordedAt: Date
}

/** Outcome Resolution (spec §16.2). Four states, and no fifth. */
export type OutcomeState = 'resolved' | 'unresolved' | 'expired' | 'ambiguous'

export const OUTCOME_STATES: readonly OutcomeState[] = [
  'resolved', 'unresolved', 'expired', 'ambiguous',
] as const

export type OutcomeResolvedBy = 'deterministic_event' | 'explicit_review'

export interface OutcomeRecord {
  id: string
  opportunityId: string | null
  decisionRecordId: string | null
  state: OutcomeState
  resolvedBy: OutcomeResolvedBy
  /** Set only for `resolved`. The other three states have no resolution time. */
  resolvedAt: Date | null
  evidenceIds: readonly string[]
  note: string | null
  recordedAt: Date
  /** Outcome history is append-only; a change writes a new row. */
  supersedesOutcomeId: string | null
  supersededByOutcomeId: string | null
}
