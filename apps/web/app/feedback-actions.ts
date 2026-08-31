'use server'

import { revalidatePath } from 'next/cache'
import {
  correctFeedback, getContext, recordFeedback, recordOutcome, recordUserAction, resolveOutcome,
} from '@ava/app'
import type {
  ArtifactVerdict, DeliveryVerdict, EpistemicVerdict, OutcomeState, UserActionKind,
} from '@ava/core'

/**
 * Feedback actions. Wiring only — every rule lives in @ava/core and @ava/app.
 *
 * Nothing here touches a policy, a threshold or a stored preference. Marking
 * an item irrelevant records that judgement about that item; it does not tell
 * AVA the user never cares about the category, and there is no code path by
 * which it could.
 */
function optional(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? '').trim()
  return value === '' || value === 'not_provided' ? null : value
}

export async function feedbackAction(
  _prev: unknown, form: FormData,
): Promise<{ message: string }> {
  const targetId = String(form.get('targetId') ?? '')
  const targetType = String(form.get('targetType') ?? 'opportunity') as 'opportunity'
  const workstreamId = String(form.get('workstreamId') ?? '')
  const correctsFeedbackId = optional(form, 'correctsFeedbackId')

  const input = {
    epistemic: optional(form, 'epistemic') as EpistemicVerdict | null,
    delivery: optional(form, 'delivery') as DeliveryVerdict | null,
    artifact: optional(form, 'artifact') as ArtifactVerdict | null,
    reason: optional(form, 'reason'),
  }
  if (input.epistemic === null && input.delivery === null && input.artifact === null) {
    return { message: 'Nothing was selected, so nothing was recorded. Leaving it blank is fine.' }
  }

  const ctx = await getContext()
  if (correctsFeedbackId !== null) {
    await correctFeedback(ctx, correctsFeedbackId, input)
  } else {
    await recordFeedback(ctx, { targetType, targetId, ...input })
  }

  revalidatePath(`/workstreams/${workstreamId}/today`)
  revalidatePath(`/why/opportunity/${targetId}`)
  return {
    message: correctsFeedbackId !== null
      ? 'Recorded. Your earlier answer is still readable in the history.'
      : 'Recorded. This changes what AVA knows about what you thought, not how AVA decides.',
  }
}

export async function actionAction(_prev: unknown, form: FormData): Promise<{ message: string }> {
  const opportunityId = String(form.get('opportunityId') ?? '')
  const workstreamId = String(form.get('workstreamId') ?? '')
  const kind = String(form.get('kind') ?? 'unknown') as UserActionKind
  const description = optional(form, 'description')

  const ctx = await getContext()
  await recordUserAction(ctx, { opportunityId, kind, description })

  // An observed action may settle the outcome on its own. Anything needing
  // judgement is left for the user rather than guessed.
  const resolution = await resolveOutcome(ctx, opportunityId)

  revalidatePath(`/why/opportunity/${opportunityId}`)
  revalidatePath(`/workstreams/${workstreamId}/today`)
  return {
    message: resolution.written !== null
      ? `Recorded. The outcome moved to ${resolution.state} because ${resolution.reason}.`
      : `Recorded. The outcome is still ${resolution.state} — ${resolution.reason}.`,
  }
}

export async function outcomeAction(_prev: unknown, form: FormData): Promise<{ message: string }> {
  const opportunityId = String(form.get('opportunityId') ?? '')
  const workstreamId = String(form.get('workstreamId') ?? '')
  const state = String(form.get('state') ?? '') as OutcomeState
  const note = optional(form, 'note')

  const ctx = await getContext()
  try {
    await recordOutcome(ctx, { opportunityId, state, note })
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'The outcome could not be recorded.' }
  }

  revalidatePath(`/why/opportunity/${opportunityId}`)
  revalidatePath(`/workstreams/${workstreamId}/today`)
  return { message: `Outcome recorded as ${state}. Any earlier outcome stays in the history.` }
}
