import { WHEN_QUESTION, classifyUtterance, confirmationFor } from '@ava/core'
import type { ClassifiedUtterance } from '@ava/core'
import type { AppContext } from './context'
import { capture } from './capture-service'
import { correctCognition, declareCognition } from './cognition-service'
import { ask } from './answer-service'
import type { AskDeps } from './answer-service'

/**
 * Conversational capture (Interaction Layer I4).
 *
 * The invariant this file exists to hold:
 *
 *   Voice is transport. It does not decide what AVA believes.
 *
 * Every write here goes through the SAME domain services the forms use —
 * `capture`, `declareCognition`, `correctCognition`. There is no second write
 * path, no shortcut for speech, and no way for a spoken sentence to reach the
 * ledger without passing the quarantine pipeline.
 *
 * The reason is concrete. Speech is cheap to produce and easy to mis-transcribe.
 * If the voice layer could write directly, the least validated input path would
 * also be the most convenient one, and the corpus would degrade fastest exactly
 * where it is used most.
 */
export type TurnOutcome =
  /** AVA answered. No state changed. */
  | { kind: 'answer'; text: string; decisionRecordId: string; abstained: boolean
      evidenceCount: number; contextHealth: string; workstreamId: string | null }
  /** A write is proposed and awaits confirmation. Nothing has been written. */
  | { kind: 'confirm'; text: string; pending: PendingWrite }
  /** AVA needs to know when it happened before she can record it. */
  | { kind: 'needs_time'; text: string; pending: PendingWrite }
  /** AVA could not tell what was meant and is asking. */
  | { kind: 'clarify'; text: string }
  /** A write completed. */
  | { kind: 'recorded'; text: string; objectId: string | null }
  /** The user asked to see the evidence. */
  | { kind: 'why'; text: string; decisionRecordId: string | null }
  /** AVA declined because answering would need something she cannot do. */
  | { kind: 'refused'; text: string }

export interface PendingWrite {
  utterance: ClassifiedUtterance
  workstreamId: string
  /** ISO date the user gave, when the sentence implied the past. */
  observedAt: string | null
  /** The exact sentence AVA said back, so confirmation is checkable. */
  confirmation: string
}

export interface TurnRequest {
  text: string
  /** Null means the global scope. */
  workstreamId: string | null
  /** The DecisionRecord of the previous answer, for "why?". */
  lastDecisionRecordId?: string | null
  /** Set when the user has already answered "when did that happen?". */
  observedAt?: string | null
}

/**
 * Cross-workstream evidence synthesis. Not supported, and said so rather than
 * answered from one workstream while appearing to answer globally.
 */
const CROSS_WORKSTREAM =
  /\b(across (?:all )?(?:my )?projects|all my projects|every project|compare .* projects|pattern .* projects)\b/i

export async function handleTurn(
  ctx: AppContext, deps: AskDeps, req: TurnRequest,
): Promise<TurnOutcome> {
  const u = classifyUtterance(req.text)

  if (u.kind === 'why') {
    return {
      kind: 'why',
      text: req.lastDecisionRecordId === null || req.lastDecisionRecordId === undefined
        ? 'There is nothing to explain yet — ask me something first.'
        : 'Opening the evidence behind that answer.',
      decisionRecordId: req.lastDecisionRecordId ?? null,
    }
  }

  if (u.kind === 'ambiguous') {
    return {
      kind: 'clarify',
      text: 'I could not tell whether that was a question or something to record. Which did you mean?',
    }
  }

  if (!u.writes) {
    // A question that would need one Context Packet spanning workstreams is
    // refused. Answering from a single workstream while appearing to answer
    // globally would be the most misleading thing available here.
    if (req.workstreamId === null && CROSS_WORKSTREAM.test(req.text)) {
      return {
        kind: 'refused',
        text:
          'I can report across your projects, but I cannot yet reason across them. '
          + 'Each project\'s evidence stays inside its own boundary, so I would be '
          + 'answering from one and calling it all of them. Ask me inside a project, '
          + 'or ask what needs attention across everything.',
      }
    }
    if (req.workstreamId === null) {
      return {
        kind: 'refused',
        text:
          'That question needs a project. I keep each project\'s evidence separate, '
          + 'so tell me which one you mean and I will answer from it.',
      }
    }

    const answer = await ask(ctx, deps, { workstreamId: req.workstreamId, question: req.text })
    return {
      kind: 'answer',
      text: answer.answer,
      decisionRecordId: answer.decisionRecordId,
      abstained: answer.abstained,
      evidenceCount: answer.evidence.length,
      contextHealth: answer.contextHealth.state,
      workstreamId: req.workstreamId,
    }
  }

  // --- A write is proposed. Nothing is written yet. ---
  if (req.workstreamId === null) {
    return {
      kind: 'refused',
      text: 'Tell me which project this belongs to and I will record it there.',
    }
  }

  const observedAt = req.observedAt ?? null
  if (u.impliesPast && observedAt === null) {
    return {
      kind: 'needs_time',
      text: WHEN_QUESTION,
      pending: {
        utterance: u, workstreamId: req.workstreamId, observedAt: null,
        confirmation: confirmationFor(u, 'at a time you have not given yet'),
      },
    }
  }

  const when = observedAt === null ? 'effective today' : `effective ${observedAt.slice(0, 10)}`
  const confirmation = confirmationFor(u, when)
  return {
    kind: 'confirm',
    text: confirmation,
    pending: { utterance: u, workstreamId: req.workstreamId, observedAt, confirmation },
  }
}

/**
 * Executes a write the user has confirmed.
 *
 * Every branch calls the same service a form would. Autonomy limits, scope
 * rules, the quarantine pipeline and `observedAt` discipline all apply
 * unchanged, because this is not a separate path — it is the same one.
 */
export async function commitPendingWrite(
  ctx: AppContext, pending: PendingWrite,
): Promise<TurnOutcome> {
  const { utterance: u, workstreamId, observedAt } = pending

  if (u.kind === 'declaration') {
    const declared = await declareCognition(ctx, {
      content: u.payload,
      cognitionType: 'contextual_preference',
      workstreamId,
    })
    return {
      kind: 'recorded',
      text: 'Recorded as something you told me. You can correct it any time, and the original stays readable.',
      objectId: declared.cognition.id,
    }
  }

  if (u.kind === 'correction') {
    const active = await ctx.cognition.listActive(workstreamId)
    const latest = active[0]
    if (latest === undefined) {
      return {
        kind: 'clarify',
        text: 'I do not have anything recorded that matches what you are correcting. What should I change?',
      }
    }
    const corrected = await correctCognition(ctx, {
      cognitionId: latest.id, content: u.payload,
    })
    return {
      kind: 'recorded',
      text: 'Corrected. The earlier version is still readable under Superseded.',
      objectId: corrected.cognition.id,
    }
  }

  const type =
    u.kind === 'decision' ? 'decision'
    : u.kind === 'commitment' ? 'commitment'
    : 'note'

  const outcome = await capture(ctx, {
    workstreamId,
    type,
    title: u.payload.slice(0, 110),
    content: u.payload,
    ...(observedAt === null ? {} : { observedAt }),
  })

  if (!outcome.ok) {
    return {
      kind: 'clarify',
      text: `I could not record that: ${outcome.issues.map((i) => i.message).join('; ')}`,
    }
  }
  return {
    kind: 'recorded',
    text: observedAt === null
      ? 'Recorded.'
      : `Recorded, dated ${observedAt.slice(0, 10)} rather than now.`,
    objectId: outcome.change?.objectId ?? null,
  }
}
