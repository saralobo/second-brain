import type { OutcomeRecord, OutcomeState, UserActionRecord } from './types'

/**
 * Outcome Resolution (spec §16.2).
 *
 * The resolver uses deterministic events where they exist and explicit review
 * everywhere else. What it never does is infer.
 *
 * Silence is the case that matters. A user who says nothing has not told you
 * the item was useless, or rejected, or resolved — they have told you nothing,
 * and `unresolved` is the honest record of that. Converting silence into a
 * verdict is fabrication, and it would poison every measurement built on top.
 */
export interface ResolutionInput {
  opportunityId: string
  now: Date
  /** Actions observed against this opportunity, if any. */
  actions: readonly UserActionRecord[]
  /** The window this opportunity was about, when it had one. */
  expiresAt: Date | null
  /** Whether the opportunity was ever delivered. */
  shownAt: Date | null
}

export interface ResolutionProposal {
  state: OutcomeState
  resolvedBy: 'deterministic_event' | 'explicit_review'
  resolvedAt: Date | null
  /** Why the resolver reached this. Always present, including for `unresolved`. */
  reason: string
  /** True when a person must decide; the resolver refuses to guess. */
  needsExplicitReview: boolean
}

/**
 * Proposes an outcome. It PROPOSES: nothing here writes, and anything
 * needing judgement is handed back with `needsExplicitReview`.
 */
export function proposeOutcome(input: ResolutionInput): ResolutionProposal {
  const decisive = input.actions.filter(
    (a) => a.kind === 'reviewed' || a.kind === 'updated_artifact' || a.kind === 'made_decision')

  if (decisive.length > 0) {
    const first = [...decisive].sort((a, b) => a.actedAt.getTime() - b.actedAt.getTime())[0]!
    return {
      state: 'resolved',
      resolvedBy: 'deterministic_event',
      resolvedAt: first.actedAt,
      reason: `a recorded action closed it: ${first.kind.replace(/_/g, ' ')}`,
      needsExplicitReview: false,
    }
  }

  const dismissed = input.actions.some((a) => a.kind === 'dismissed')
  if (dismissed) {
    // Dismissing ends AVA's involvement but says nothing about whether the
    // underlying condition was dealt with. That is precisely `ambiguous`.
    return {
      state: 'ambiguous',
      resolvedBy: 'explicit_review',
      resolvedAt: null,
      reason: 'the item was dismissed, which does not say whether the condition was addressed',
      needsExplicitReview: true,
    }
  }

  if (input.expiresAt !== null && input.expiresAt.getTime() < input.now.getTime()) {
    return {
      state: 'expired',
      resolvedBy: 'deterministic_event',
      resolvedAt: null,
      reason: 'the window this referred to closed with no recorded action',
      needsExplicitReview: false,
    }
  }

  return {
    state: 'unresolved',
    resolvedBy: 'explicit_review',
    resolvedAt: null,
    reason: input.shownAt === null
      ? 'nothing has been observed, and this was never shown'
      : 'nothing has been observed since this was shown; silence is not an answer',
    needsExplicitReview: true,
  }
}

/**
 * Whether a proposed outcome may be written without a person confirming it.
 *
 * `unresolved` and `ambiguous` are legitimate END STATES, not placeholders to
 * be tidied away. If they dominate, that is the `outcome ambiguity` failure
 * mode of baseline §33 and must stay visible.
 */
export function mayWriteWithoutReview(proposal: ResolutionProposal): boolean {
  return !proposal.needsExplicitReview
}

/**
 * A guard against the one conversion the plan forbids by name: `unresolved`
 * is never turned into a rejection or a confirmation.
 */
export function isForbiddenOutcomeConversion(
  from: OutcomeState, to: OutcomeState, resolvedBy: 'deterministic_event' | 'explicit_review',
): { forbidden: boolean; reason: string } {
  if (from === 'unresolved' && to === 'resolved' && resolvedBy === 'deterministic_event') {
    return {
      forbidden: false,
      reason: 'a later action was actually observed, which is a real event rather than an inference',
    }
  }
  if (from === 'unresolved' && to !== 'unresolved' && resolvedBy !== 'explicit_review') {
    return {
      forbidden: true,
      reason: 'an unresolved outcome may only change when a person reviews it or an action is observed',
    }
  }
  return { forbidden: false, reason: `${from} → ${to} by ${resolvedBy}` }
}

/** The outcome as it stood at a given instant. History is never rewritten. */
export function outcomeAt(
  history: readonly OutcomeRecord[], at: Date,
): OutcomeRecord | null {
  const visible = history
    .filter((o) => o.recordedAt.getTime() <= at.getTime())
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
  return visible[visible.length - 1] ?? null
}
