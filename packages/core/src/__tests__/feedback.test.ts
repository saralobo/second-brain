import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_VERDICTS, DELIVERY_VERDICTS, EMPTY_COUNTS, EPISTEMIC_VERDICTS, NOT_A_RESULT,
  OUTCOME_STATES, anticipationWindowMs, currentOutcome, deriveObservations, detectionLatencyMs,
  feedbackAt, firstAction, isForbiddenOutcomeConversion, mayWriteWithoutReview, outcomeAt,
  projectFeedback, proposeOutcome,
} from '../index'
import type {
  FeedbackRecord, InterventionTimeline, OutcomeRecord, UserActionRecord,
} from '../index'

const T = (iso: string): Date => new Date(iso)

function feedback(over: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: 'F1', targetType: 'opportunity', targetId: 'O1', opportunityId: 'O1',
    decisionRecordId: 'DR1', epistemic: 'correct', delivery: 'valuable', artifact: null,
    reason: null, givenAt: T('2026-04-01T10:00:00Z'),
    correctsFeedbackId: null, supersededByFeedbackId: null, ...over,
  }
}

function action(over: Partial<UserActionRecord> = {}): UserActionRecord {
  return {
    id: 'A1', opportunityId: 'O1', kind: 'reviewed', description: null,
    actedAt: T('2026-04-02T10:00:00Z'), relatedObjectId: null, relatedArtifactId: null,
    recordedAt: T('2026-04-02T10:05:00Z'), ...over,
  }
}

function outcome(over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    id: 'OC1', opportunityId: 'O1', decisionRecordId: 'DR1', state: 'unresolved',
    resolvedBy: 'explicit_review', resolvedAt: null, evidenceIds: [], note: null,
    recordedAt: T('2026-04-01T12:00:00Z'),
    supersedesOutcomeId: null, supersededByOutcomeId: null, ...over,
  }
}

/**
 * The dimensions must stay apart. Merging them is the failure this slice
 * exists to prevent, so the combinations the brief names by hand are tested
 * one by one.
 */
describe('feedback dimensions are independent', () => {
  it('has no aggregate anywhere on the record', () => {
    const f = feedback() as unknown as Record<string, unknown>
    for (const forbidden of ['score', 'rating', 'reward', 'feedbackScore', 'value']) {
      expect(f[forbidden]).toBeUndefined()
    }
    for (const key of Object.keys(f)) {
      if (key === 'givenAt') continue
      expect(typeof f[key]).not.toBe('number')
    }
  })

  it('keeps correct + valuable distinct from correct + already_known', () => {
    const helped = projectFeedback([feedback({ epistemic: 'correct', delivery: 'valuable' })])
    const knew = projectFeedback([feedback({ epistemic: 'correct', delivery: 'already_known' })])
    expect(helped.epistemic).toBe(knew.epistemic)
    expect(helped.delivery).not.toBe(knew.delivery)
  })

  it('allows correct + too_late — right, but at the wrong moment', () => {
    const late = projectFeedback([feedback({ epistemic: 'correct', delivery: 'too_late' })])
    expect(late.epistemic).toBe('correct')
    expect(late.delivery).toBe('too_late')
  })

  it('allows incorrect + valuable — wrong, and still worth having seen', () => {
    const odd = projectFeedback([feedback({ epistemic: 'incorrect', delivery: 'valuable' })])
    expect(odd.epistemic).toBe('incorrect')
    expect(odd.delivery).toBe('valuable')
  })

  it('offers exactly the values the specification names', () => {
    expect([...EPISTEMIC_VERDICTS])
      .toEqual(['correct', 'partially_correct', 'incorrect', 'not_verifiable'])
    expect([...DELIVERY_VERDICTS])
      .toEqual(['valuable', 'already_known', 'irrelevant', 'too_early', 'too_late'])
    expect([...ARTIFACT_VERDICTS]).toEqual([
      'used_as_is', 'used_after_edit', 'not_used', 'not_shown', 'expired', 'replaced',
    ])
  })

  it('treats artifact feedback as a third axis, not a substitute', () => {
    const current = projectFeedback([feedback({
      epistemic: 'correct', delivery: 'valuable', artifact: 'used_after_edit',
    })])
    expect(current.epistemic).toBe('correct')
    expect(current.delivery).toBe('valuable')
    expect(current.artifact).toBe('used_after_edit')
  })
})

describe('no feedback is not negative feedback', () => {
  it('projects an empty set as NOT PROVIDED on every dimension', () => {
    const current = projectFeedback([])
    expect(current.epistemic).toBeNull()
    expect(current.delivery).toBeNull()
    expect(current.artifact).toBeNull()
    expect(current.hasAny).toBe(false)
  })

  it('counts a blank dimension separately from a negative one', () => {
    const counts = {
      ...EMPTY_COUNTS,
      shown: 4,
      delivery: { ...EMPTY_COUNTS.delivery, valuable: 1, irrelevant: 1, not_provided: 2 },
    }
    const observed = deriveObservations(counts)
    // The denominator excludes the two nobody answered, rather than counting
    // them as failures.
    expect(observed.valuable).toEqual({
      numerator: 1, denominator: 2, basis: 'interventions with a delivery verdict',
    })
    expect(observed.caveat).toBe(NOT_A_RESULT)
  })

  it('never reports a percentage', () => {
    const observed = deriveObservations({ ...EMPTY_COUNTS, shown: 3 })
    for (const value of Object.values(observed)) {
      if (typeof value === 'string') continue
      expect(value).toHaveProperty('numerator')
      expect(value).toHaveProperty('denominator')
      expect(value).not.toHaveProperty('percent')
    }
  })
})

describe('feedback history', () => {
  it('resolves each dimension independently across rows', () => {
    // Later feedback answers only "was it useful?"; the earlier correctness
    // answer must survive rather than being blanked.
    const current = projectFeedback([
      feedback({ id: 'F1', epistemic: 'correct', delivery: null }),
      feedback({ id: 'F2', epistemic: null, delivery: 'already_known', givenAt: T('2026-04-02T10:00:00Z') }),
    ])
    expect(current.epistemic).toBe('correct')
    expect(current.delivery).toBe('already_known')
    expect(current.sourceIds.epistemic).toBe('F1')
    expect(current.sourceIds.delivery).toBe('F2')
  })

  it('reads the correction, and keeps the corrected row reachable', () => {
    const rows = [
      feedback({ id: 'F1', delivery: 'already_known', supersededByFeedbackId: 'F2' }),
      feedback({
        id: 'F2', delivery: 'valuable', correctsFeedbackId: 'F1',
        givenAt: T('2026-04-05T10:00:00Z'),
      }),
    ]
    const current = projectFeedback(rows)
    expect(current.delivery).toBe('valuable')
    expect(current.history.map((f) => f.id)).toContain('F1')
  })

  it('answers what the user thought at t1, after they changed their mind at t2', () => {
    const rows = [
      feedback({ id: 'F1', delivery: 'already_known', supersededByFeedbackId: 'F2' }),
      feedback({
        id: 'F2', delivery: 'valuable', correctsFeedbackId: 'F1',
        givenAt: T('2026-04-05T10:00:00Z'),
      }),
    ]
    expect(feedbackAt(rows, T('2026-04-02T00:00:00Z')).delivery).toBe('already_known')
    expect(feedbackAt(rows, T('2026-04-06T00:00:00Z')).delivery).toBe('valuable')
  })
})

/**
 * The resolver never infers. Silence is the case that matters: a user who says
 * nothing has not said the item was useless, rejected or resolved.
 */
describe('outcome resolution', () => {
  const base = {
    opportunityId: 'O1', now: T('2026-04-10T10:00:00Z'),
    expiresAt: null, shownAt: T('2026-04-01T10:00:00Z'),
  }

  it('reads silence as unresolved, and hands it to a person', () => {
    const proposal = proposeOutcome({ ...base, actions: [] })
    expect(proposal.state).toBe('unresolved')
    expect(proposal.needsExplicitReview).toBe(true)
    expect(mayWriteWithoutReview(proposal)).toBe(false)
    expect(proposal.reason).toContain('silence is not an answer')
  })

  it('resolves on an observed action, and dates it from the action', () => {
    const proposal = proposeOutcome({ ...base, actions: [action()] })
    expect(proposal.state).toBe('resolved')
    expect(proposal.resolvedBy).toBe('deterministic_event')
    expect(proposal.resolvedAt).toEqual(T('2026-04-02T10:00:00Z'))
  })

  it('calls a dismissal ambiguous rather than resolved', () => {
    const proposal = proposeOutcome({ ...base, actions: [action({ kind: 'dismissed' })] })
    expect(proposal.state).toBe('ambiguous')
    expect(proposal.needsExplicitReview).toBe(true)
  })

  it('expires only when the window actually closed', () => {
    expect(proposeOutcome({
      ...base, actions: [], expiresAt: T('2026-04-05T00:00:00Z'),
    }).state).toBe('expired')
    expect(proposeOutcome({
      ...base, actions: [], expiresAt: T('2026-05-05T00:00:00Z'),
    }).state).toBe('unresolved')
  })

  it('offers exactly four states', () => {
    expect([...OUTCOME_STATES]).toEqual(['resolved', 'unresolved', 'expired', 'ambiguous'])
  })

  it('refuses to convert unresolved into a verdict by inference', () => {
    expect(isForbiddenOutcomeConversion('unresolved', 'resolved', 'deterministic_event').forbidden)
      .toBe(false)
    expect(isForbiddenOutcomeConversion('unresolved', 'ambiguous', 'deterministic_event').forbidden)
      .toBe(true)
    expect(isForbiddenOutcomeConversion('unresolved', 'expired', 'deterministic_event').forbidden)
      .toBe(true)
  })

  it('reconstructs the outcome as it stood at an earlier instant', () => {
    const history = [
      outcome({ id: 'OC1', state: 'unresolved', supersededByOutcomeId: 'OC2' }),
      outcome({
        id: 'OC2', state: 'resolved', resolvedAt: T('2026-04-08T10:00:00Z'),
        recordedAt: T('2026-04-08T10:00:00Z'), supersedesOutcomeId: 'OC1',
      }),
    ]
    expect(outcomeAt(history, T('2026-04-02T00:00:00Z'))?.state).toBe('unresolved')
    expect(outcomeAt(history, T('2026-04-09T00:00:00Z'))?.state).toBe('resolved')
    expect(currentOutcome(history)?.state).toBe('resolved')
  })
})

describe('actions are not feedback', () => {
  it('ignores an unobservable action rather than counting it', () => {
    expect(firstAction([action({ kind: 'unknown' })])).toBeNull()
    expect(firstAction([])).toBeNull()
  })

  it('returns the earliest real action', () => {
    const later = action({ id: 'A2', actedAt: T('2026-04-09T10:00:00Z') })
    expect(firstAction([later, action()])?.id).toBe('A1')
  })
})

describe('timeline', () => {
  const timeline: InterventionTimeline = {
    opportunityId: 'O1',
    evidenceArrivedAt: T('2026-03-30T09:00:00Z'),
    changeDetectableAt: T('2026-03-30T09:00:00Z'),
    changeDetectedAt: T('2026-03-30T09:05:00Z'),
    opportunityGeneratedAt: T('2026-03-30T09:06:00Z'),
    opportunityShownAt: T('2026-04-01T10:00:00Z'),
    userSeenAt: null,
    feedbackAt: T('2026-04-01T11:00:00Z'),
    userActionAt: T('2026-04-02T10:00:00Z'),
    outcomeAt: T('2026-04-02T10:05:00Z'),
  }

  it('leaves user_seen_at null, because shown is not seen', () => {
    expect(timeline.userSeenAt).toBeNull()
  })

  it('returns null rather than zero when an end is missing', () => {
    expect(anticipationWindowMs({ ...timeline, userActionAt: null })).toBeNull()
    expect(detectionLatencyMs({ ...timeline, changeDetectableAt: null })).toBeNull()
  })

  it('measures the window when both ends exist', () => {
    expect(anticipationWindowMs(timeline)).toBe(86_400_000)
    expect(detectionLatencyMs(timeline)).toBe(300_000)
  })
})
