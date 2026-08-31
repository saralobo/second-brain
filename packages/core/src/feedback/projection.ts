import type {
  ArtifactVerdict, DeliveryVerdict, EpistemicVerdict, FeedbackRecord, OutcomeRecord,
  UserActionRecord,
} from './types'

/**
 * Reading feedback back.
 *
 * Feedback is append-only. A correction writes a new row and points at the one
 * it corrects; nothing is overwritten, so "what did I think at t1?" stays
 * answerable after the user changes their mind at t2.
 */

/**
 * The current state of feedback for one target.
 *
 * `null` on any dimension means NOT PROVIDED. That is a legitimate state and
 * must never be rendered or counted as a negative — a person who did not
 * answer "was this correct?" has not said it was wrong.
 */
export interface CurrentFeedback {
  epistemic: EpistemicVerdict | null
  delivery: DeliveryVerdict | null
  artifact: ArtifactVerdict | null
  reason: string | null
  givenAt: Date | null
  /** The row each current value came from, so Why can cite it. */
  sourceIds: { epistemic: string | null; delivery: string | null; artifact: string | null }
  /** Every row for this target, newest first. Corrections included. */
  history: readonly FeedbackRecord[]
  hasAny: boolean
}

export const NO_FEEDBACK: CurrentFeedback = {
  epistemic: null, delivery: null, artifact: null, reason: null, givenAt: null,
  sourceIds: { epistemic: null, delivery: null, artifact: null },
  history: [], hasAny: false,
}

/**
 * Projects the current view.
 *
 * Each dimension is resolved INDEPENDENTLY: a later row that answers only
 * "was it useful?" does not erase an earlier answer to "was it correct?".
 * Merging them would silently drop a judgement the user made.
 */
export function projectFeedback(rows: readonly FeedbackRecord[]): CurrentFeedback {
  if (rows.length === 0) return NO_FEEDBACK

  const ordered = [...rows].sort((a, b) => a.givenAt.getTime() - b.givenAt.getTime()
    || (a.id < b.id ? -1 : 1))

  // A row counts as superseded only when the row that replaced it is present.
  // The pointer records what is true NOW; a read of an earlier instant must
  // not be told about a correction that had not happened yet.
  // Each dimension resolves to the most recent row that ANSWERED it. A
  // correction replaces what it restates and nothing else: someone who
  // revises "was it useful?" has not withdrawn their answer to "was it
  // correct?", and silently dropping that verdict would lose a judgement they
  // never took back.
  //
  // Supersession pointers are therefore history links, not filters. That also
  // makes a read of an earlier instant correct for free: a correction that had
  // not happened yet simply is not in the input.
  const live = ordered

  const latest = <T>(pick: (r: FeedbackRecord) => T | null): { value: T | null; id: string | null } => {
    for (let i = live.length - 1; i >= 0; i--) {
      const row = live[i]!
      const value = pick(row)
      if (value !== null) return { value, id: row.id }
    }
    return { value: null, id: null }
  }

  const epistemic = latest((r) => r.epistemic)
  const delivery = latest((r) => r.delivery)
  const artifact = latest((r) => r.artifact)
  const reason = latest((r) => r.reason)
  const newest = live[live.length - 1] ?? ordered[ordered.length - 1]!

  return {
    epistemic: epistemic.value,
    delivery: delivery.value,
    artifact: artifact.value,
    reason: reason.value,
    givenAt: newest.givenAt,
    sourceIds: { epistemic: epistemic.id, delivery: delivery.id, artifact: artifact.id },
    history: [...ordered].reverse(),
    hasAny: epistemic.value !== null || delivery.value !== null || artifact.value !== null,
  }
}

/** Feedback as it stood at a given instant. Used to prove nothing leaks back. */
export function feedbackAt(rows: readonly FeedbackRecord[], at: Date): CurrentFeedback {
  return projectFeedback(rows.filter((r) => r.givenAt.getTime() <= at.getTime()))
}

/**
 * The full prospective timeline of one intervention (spec §21, §23).
 *
 * Every field is nullable, and a null is left null. Back-filling a missing
 * timestamp with a plausible one would destroy the only thing this timeline is
 * for — measuring, later, whether AVA actually anticipated anything.
 */
export interface InterventionTimeline {
  opportunityId: string
  evidenceArrivedAt: Date | null
  changeDetectableAt: Date | null
  changeDetectedAt: Date | null
  opportunityGeneratedAt: Date
  opportunityShownAt: Date | null
  /** Still null. There is no client acknowledgement, and `shown` is not `seen`. */
  userSeenAt: null
  feedbackAt: Date | null
  userActionAt: Date | null
  outcomeAt: Date | null
}

/**
 * The anticipation window, when both ends exist.
 *
 * Returns null rather than zero when either end is missing: zero is a
 * measurement, and "we do not know" is not zero.
 */
export function anticipationWindowMs(t: InterventionTimeline): number | null {
  if (t.opportunityShownAt === null || t.userActionAt === null) return null
  return t.userActionAt.getTime() - t.opportunityShownAt.getTime()
}

export function detectionLatencyMs(t: InterventionTimeline): number | null {
  if (t.changeDetectableAt === null || t.changeDetectedAt === null) return null
  return t.changeDetectedAt.getTime() - t.changeDetectableAt.getTime()
}

/** Earliest action, or null. Never a substitute for feedback. */
export function firstAction(actions: readonly UserActionRecord[]): UserActionRecord | null {
  const known = actions.filter((a) => a.kind !== 'unknown')
  if (known.length === 0) return null
  return [...known].sort((a, b) => a.actedAt.getTime() - b.actedAt.getTime())[0] ?? null
}

/** The live outcome: the newest row that nothing supersedes. */
export function currentOutcome(history: readonly OutcomeRecord[]): OutcomeRecord | null {
  const live = history.filter((o) => o.supersededByOutcomeId === null)
  const ordered = [...live].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
  return ordered[ordered.length - 1] ?? null
}
