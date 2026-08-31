'use server'

import { revalidatePath } from 'next/cache'
import { closeCheckpoint, getContext, prepareForOpportunity } from '@ava/app'

/**
 * Today actions. Wiring only — every rule lives in @ava/core and @ava/app.
 */
export async function closeCheckpointAction(
  _prev: unknown, form: FormData,
): Promise<{ message: string }> {
  const workstreamId = String(form.get('workstreamId') ?? '')
  const note = String(form.get('note') ?? '').trim() || null
  const ctx = await getContext()
  const closed = await closeCheckpoint(ctx, workstreamId, note)
  revalidatePath(`/workstreams/${workstreamId}/today`)
  return {
    message: closed === null
      ? 'There was no open checkpoint to close; a new one has been opened.'
      : 'Checkpoint closed. "Since the last checkpoint" now means since this moment.',
  }
}

/**
 * Preparing does not promote. The Show Policy already ran and does not see
 * this action's result — that separation is the preparation-bias guard.
 */
export async function prepareAction(
  _prev: unknown, form: FormData,
): Promise<{ message: string }> {
  const opportunityId = String(form.get('opportunityId') ?? '')
  const workstreamId = String(form.get('workstreamId') ?? '')
  const ctx = await getContext()
  const outcome = await prepareForOpportunity(ctx, opportunityId)
  revalidatePath(`/workstreams/${workstreamId}/today`)
  return {
    message: outcome.prepared
      ? 'Prepared a draft checklist. It is internal to AVA and was sent nowhere.'
      : `Not prepared — ${outcome.verdict}: ${outcome.reasons.join('; ')}`,
  }
}
