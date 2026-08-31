import {
  currentOutcome, firstAction, isForbiddenOutcomeConversion, projectFeedback, proposeOutcome,
} from '@ava/core'
import type {
  ArtifactVerdict, CurrentFeedback, DeliveryVerdict, EpistemicVerdict, FeedbackRecord,
  FeedbackTargetType, InterventionTimeline, OutcomeRecord, OutcomeState, UserActionKind,
  UserActionRecord,
} from '@ava/core'
import type { StoredOpportunity } from '@ava/db'
import type { AppContext } from './context'

/**
 * Feedback, actions and outcomes (S6-T02…T05, T07).
 *
 * This slice RECORDS. It changes nothing about how AVA decides.
 *
 * There is no code path from a feedback row to a policy, a threshold, an
 * attention rank, a Declared Cognition or a Behavioral Hypothesis. That is the
 * point of the slice boundary: feedback is data, not yet policy, and turning
 * one into the other without an evaluation protocol is how a system starts
 * optimising for a signal nobody validated.
 */
export interface FeedbackInput {
  targetType: FeedbackTargetType
  targetId: string
  epistemic?: EpistemicVerdict | null
  delivery?: DeliveryVerdict | null
  artifact?: ArtifactVerdict | null
  reason?: string | null
  givenAt?: Date
  /** Set when this replaces an earlier judgement. The earlier one survives. */
  correctsFeedbackId?: string | null
}

/**
 * Records feedback against a target.
 *
 * The opportunity and DecisionRecord are RESOLVED and LINKED, never modified.
 * The DecisionRecord says what AVA knew when it decided; writing the user's
 * later judgement into it would claim AVA had that judgement at the time.
 */
export async function recordFeedback(
  ctx: AppContext, input: FeedbackInput,
): Promise<FeedbackRecord> {
  const { opportunityId, decisionRecordId, workstreamId } = await resolveTarget(ctx, input)

  const row = await ctx.feedback.record({
    targetType: input.targetType,
    targetId: input.targetId,
    opportunityId,
    decisionRecordId,
    epistemic: input.epistemic ?? null,
    delivery: input.delivery ?? null,
    artifact: input.artifact ?? null,
    reason: input.reason ?? null,
    givenAt: input.givenAt,
    correctsFeedbackId: input.correctsFeedbackId ?? null,
  })

  // One event per dimension actually given. A dimension left blank produces
  // no event, because nothing was observed about it.
  const base = {
    occurredAt: row.givenAt,
    subjectType: input.targetType,
    subjectId: input.targetId,
    workstreamId,
    decisionRecordId,
  } as const

  if (row.epistemic !== null) {
    await ctx.telemetry.record({
      ...base, eventType: 'feedback_epistemic_recorded',
      payload: { verdict: row.epistemic, feedbackId: row.id, opportunityId },
    })
  }
  if (row.delivery !== null) {
    await ctx.telemetry.record({
      ...base, eventType: 'feedback_delivery_recorded',
      payload: { verdict: row.delivery, feedbackId: row.id, opportunityId },
    })
  }
  if (row.artifact !== null) {
    await ctx.telemetry.record({
      ...base, eventType: 'artifact_feedback_recorded',
      payload: { verdict: row.artifact, feedbackId: row.id, opportunityId },
    })
  }
  if (row.correctsFeedbackId !== null) {
    await ctx.telemetry.record({
      ...base, eventType: 'feedback_corrected',
      payload: { feedbackId: row.id, corrects: row.correctsFeedbackId },
    })
  }

  return row
}

/**
 * Corrects earlier feedback.
 *
 * The earlier row stays in the table and stays readable. "I said already_known
 * at t1 and valuable at t2" is two facts about two moments, and flattening
 * them into one would erase the change of mind that a later evaluation might
 * most want to see.
 */
export async function correctFeedback(
  ctx: AppContext, feedbackId: string, input: Omit<FeedbackInput, 'targetType' | 'targetId'>,
): Promise<FeedbackRecord> {
  const previous = await ctx.feedback.findById(feedbackId)
  if (previous === null) throw new Error(`no such feedback: ${feedbackId}`)
  if (previous.supersededByFeedbackId !== null) {
    throw new Error(
      `feedback ${feedbackId} was already corrected by ${previous.supersededByFeedbackId}; `
      + 'correct the current row instead',
    )
  }
  return recordFeedback(ctx, {
    ...input,
    targetType: previous.targetType,
    targetId: previous.targetId,
    correctsFeedbackId: feedbackId,
  })
}

/**
 * Records something the user did.
 *
 * `unknown` is a legitimate kind. When an action is not observable, that is
 * what gets written down — never a guess dressed as an observation.
 */
export async function recordUserAction(
  ctx: AppContext,
  input: {
    opportunityId: string
    kind: UserActionKind
    description?: string | null
    actedAt?: Date
    relatedObjectId?: string | null
    relatedArtifactId?: string | null
  },
): Promise<UserActionRecord> {
  const opportunity = await ctx.opportunities.findById(input.opportunityId)
  if (opportunity === null) throw new Error(`no such opportunity: ${input.opportunityId}`)

  const row = await ctx.userActions.record({
    opportunityId: input.opportunityId,
    kind: input.kind,
    description: input.description ?? null,
    actedAt: input.actedAt ?? new Date(),
    relatedObjectId: input.relatedObjectId ?? null,
    relatedArtifactId: input.relatedArtifactId ?? null,
  })

  await ctx.telemetry.record({
    eventType: 'user_action_recorded', occurredAt: row.actedAt,
    subjectType: 'opportunity', subjectId: input.opportunityId,
    workstreamId: opportunity.workstreamId,
    payload: { kind: row.kind, actionId: row.id },
  })
  return row
}

export interface OutcomeInput {
  opportunityId: string
  state: OutcomeState
  note?: string | null
  resolvedAt?: Date | null
  evidenceIds?: readonly string[]
  recordedAt?: Date
}

/**
 * Records an outcome the user states explicitly.
 *
 * A change from `unresolved` is checked against the one conversion the plan
 * forbids by name: it may move because a person reviewed it or because an
 * action was observed, and never because time passed or nothing happened.
 */
export async function recordOutcome(
  ctx: AppContext, input: OutcomeInput,
): Promise<OutcomeRecord> {
  const opportunity = await ctx.opportunities.findById(input.opportunityId)
  if (opportunity === null) throw new Error(`no such opportunity: ${input.opportunityId}`)

  const history = await ctx.outcomes.historyFor(input.opportunityId)
  const previous = currentOutcome(history)

  if (previous !== null) {
    const check = isForbiddenOutcomeConversion(previous.state, input.state, 'explicit_review')
    if (check.forbidden) throw new Error(check.reason)
  }

  const row = await ctx.outcomes.record({
    opportunityId: input.opportunityId,
    decisionRecordId: await decisionRecordFor(ctx, opportunity),
    state: input.state,
    resolvedBy: 'explicit_review',
    resolvedAt: input.resolvedAt ?? null,
    evidenceIds: input.evidenceIds ?? [],
    note: input.note ?? null,
    recordedAt: input.recordedAt,
    supersedesOutcomeId: previous?.id ?? null,
  })

  await ctx.telemetry.record({
    eventType: previous === null ? 'outcome_recorded' : 'outcome_updated',
    occurredAt: row.recordedAt,
    subjectType: 'opportunity', subjectId: input.opportunityId,
    workstreamId: opportunity.workstreamId,
    payload: {
      state: row.state, resolvedBy: row.resolvedBy, outcomeId: row.id,
      previousState: previous?.state ?? null,
    },
  })
  return row
}

/**
 * Proposes an outcome from what has actually been observed, and writes it only
 * when the proposal needs no human judgement.
 *
 * When it does need judgement — dismissal, or plain silence — nothing is
 * written and the caller is told what a person would have to decide.
 */
export async function resolveOutcome(
  ctx: AppContext, opportunityId: string, now: Date = new Date(),
): Promise<{ written: OutcomeRecord | null; state: OutcomeState; reason: string; needsReview: boolean }> {
  const opportunity = await ctx.opportunities.findById(opportunityId)
  if (opportunity === null) throw new Error(`no such opportunity: ${opportunityId}`)

  const actions = await ctx.userActions.forOpportunity(opportunityId)
  const proposal = proposeOutcome({
    opportunityId, now, actions,
    expiresAt: opportunity.expiresAt,
    shownAt: opportunity.shownAt,
  })

  if (proposal.needsExplicitReview) {
    return {
      written: null, state: proposal.state, reason: proposal.reason, needsReview: true,
    }
  }

  const history = await ctx.outcomes.historyFor(opportunityId)
  const previous = currentOutcome(history)
  if (previous !== null && previous.state === proposal.state) {
    return { written: null, state: proposal.state, reason: 'already recorded', needsReview: false }
  }

  const row = await ctx.outcomes.record({
    opportunityId,
    decisionRecordId: await decisionRecordFor(ctx, opportunity),
    state: proposal.state,
    resolvedBy: proposal.resolvedBy,
    resolvedAt: proposal.resolvedAt,
    note: proposal.reason,
    recordedAt: now,
    supersedesOutcomeId: previous?.id ?? null,
  })

  await ctx.telemetry.record({
    eventType: previous === null ? 'outcome_recorded' : 'outcome_updated',
    occurredAt: now,
    subjectType: 'opportunity', subjectId: opportunityId,
    workstreamId: opportunity.workstreamId,
    payload: { state: row.state, resolvedBy: row.resolvedBy, outcomeId: row.id },
  })

  return { written: row, state: proposal.state, reason: proposal.reason, needsReview: false }
}

/**
 * Everything known about one intervention, assembled for Why and for chat.
 *
 * Assembled at READ time from separate records. Nothing here is written back
 * onto the opportunity or its DecisionRecord.
 */
export interface InterventionHistory {
  opportunity: StoredOpportunity
  feedback: CurrentFeedback
  actions: readonly UserActionRecord[]
  outcomeHistory: readonly OutcomeRecord[]
  outcome: OutcomeRecord | null
  timeline: InterventionTimeline
}

export async function interventionHistory(
  ctx: AppContext, opportunityId: string,
): Promise<InterventionHistory | null> {
  const opportunity = await ctx.opportunities.findById(opportunityId)
  if (opportunity === null) return null

  const rows = await ctx.feedback.forOpportunity(opportunityId)
  const feedback = projectFeedback(rows)
  const actions = await ctx.userActions.forOpportunity(opportunityId)
  const outcomeHistory = await ctx.outcomes.historyFor(opportunityId)
  const outcome = currentOutcome(outcomeHistory)

  const evidence = await ctx.evidence.findByIds(opportunity.originEvidenceIds)
  const earliestEvidence = evidence.reduce<Date | null>(
    (min, e) => (min === null || e.observedAt < min ? e.observedAt : min), null)
  const changeEvents = await ctx.telemetry.listBySubject(opportunity.impactedFrom ?? opportunityId)
  const at = (type: string): Date | null => {
    const row = changeEvents.find((e) => e.event_type === type)
    return row ? new Date(row.occurred_at) : null
  }
  const action = firstAction(actions)

  return {
    opportunity, feedback, actions, outcomeHistory, outcome,
    timeline: {
      opportunityId,
      evidenceArrivedAt: earliestEvidence,
      changeDetectableAt: at('change_detectable_at'),
      changeDetectedAt: at('change_detection_triggered'),
      opportunityGeneratedAt: opportunity.generation.generatedAt,
      opportunityShownAt: opportunity.shownAt,
      // Still null, and still deliberate. `shown` is not `seen`.
      userSeenAt: null,
      feedbackAt: feedback.givenAt,
      userActionAt: action?.actedAt ?? null,
      outcomeAt: outcome?.recordedAt ?? null,
    },
  }
}

async function resolveTarget(ctx: AppContext, input: FeedbackInput): Promise<{
  opportunityId: string | null; decisionRecordId: string | null; workstreamId: string | null
}> {
  if (input.targetType === 'opportunity') {
    const o = await ctx.opportunities.findById(input.targetId)
    if (o === null) throw new Error(`no such opportunity: ${input.targetId}`)
    return {
      opportunityId: o.id,
      decisionRecordId: await decisionRecordFor(ctx, o),
      workstreamId: o.workstreamId,
    }
  }
  if (input.targetType === 'prepared_artifact') {
    const rows = await ctx.db.query<{ opportunity_id: string }>(
      'SELECT opportunity_id FROM prepared_artifact WHERE id = $1', [input.targetId])
    const opportunityId = rows.rows[0]?.opportunity_id ?? null
    if (opportunityId === null) throw new Error(`no such prepared artifact: ${input.targetId}`)
    const o = await ctx.opportunities.findById(opportunityId)
    return {
      opportunityId,
      decisionRecordId: o ? await decisionRecordFor(ctx, o) : null,
      workstreamId: o?.workstreamId ?? null,
    }
  }
  // A grounded answer is identified by its DecisionRecord.
  const dr = await ctx.decisionRecords.findById(input.targetId)
  if (dr === null) throw new Error(`no such decision record: ${input.targetId}`)
  return { opportunityId: null, decisionRecordId: dr.id, workstreamId: dr.workstreamId }
}

/** The generation DecisionRecord for an opportunity, found by reference. */
async function decisionRecordFor(
  ctx: AppContext, opportunity: StoredOpportunity,
): Promise<string | null> {
  const res = await ctx.db.query<{ id: string }>(
    `SELECT id FROM decision_record
     WHERE kind = 'opportunity_generation' AND scope_match->>'opportunityId' = $1
     ORDER BY decided_at LIMIT 1`,
    [opportunity.id],
  )
  return res.rows[0]?.id ?? null
}
