'use server'

import { revalidatePath } from 'next/cache'
import {
  confirmHypothesis, correctCognition, declareCognition, getContext,
  rebuildStaleViews, rejectHypothesis, revokeCognition,
} from '@ava/app'
import type { CognitionType } from '@ava/core'

/**
 * Memory actions. Wiring only — every rule lives in @ava/core and @ava/app.
 *
 * Each one writes a new event. None of them edits the past: `correct` appends
 * a version, `supersede` marks the old one replaced, `reject` records that the
 * user disagreed with a guess. Nothing here can delete what she said.
 */
function scopeFrom(form: FormData) {
  const s = (k: string) => {
    const v = String(form.get(k) ?? '').trim()
    return v === '' ? null : v
  }
  return {
    workType: s('workType'),
    activity: s('activity'),
    decisionCategory: s('decisionCategory'),
    artifactType: s('artifactType'),
  }
}

export async function declareAction(_prev: unknown, form: FormData): Promise<null> {
  const content = String(form.get('content') ?? '').trim()
  const cognitionType = String(form.get('cognitionType') ?? 'contextual_preference')
  if (content === '') return null

  const ctx = await getContext()
  await declareCognition(ctx, {
    content,
    cognitionType: cognitionType as CognitionType,
    scope: scopeFrom(form),
  })
  revalidatePath('/memory')
  return null
}

export async function correctAction(_prev: unknown, form: FormData): Promise<null> {
  const cognitionId = String(form.get('cognitionId') ?? '')
  const content = String(form.get('content') ?? '').trim()
  const kind = String(form.get('kind') ?? 'correct') === 'contextualize' ? 'contextualize' : 'correct'
  if (cognitionId === '' || content === '') return null

  const ctx = await getContext()
  await correctCognition(ctx, { cognitionId, content, kind, scope: scopeFrom(form) })
  // Views built on the old wording are already stale; rebuild them now so the
  // user never reads a summary of a sentence she just corrected.
  await rebuildStaleViews(ctx, null)
  revalidatePath('/memory')
  return null
}

export async function supersedeAction(_prev: unknown, form: FormData): Promise<null> {
  const cognitionId = String(form.get('cognitionId') ?? '')
  const reason = String(form.get('reason') ?? 'no longer applies').trim()
  if (cognitionId === '') return null

  const ctx = await getContext()
  await revokeCognition(ctx, cognitionId, reason)
  revalidatePath('/memory')
  return null
}

export async function confirmAction(_prev: unknown, form: FormData): Promise<null> {
  const hypothesisId = String(form.get('hypothesisId') ?? '')
  const content = String(form.get('content') ?? '').trim()
  if (hypothesisId === '' || content === '') return null

  const ctx = await getContext()
  await confirmHypothesis(ctx, hypothesisId, {
    content,
    cognitionType: 'contextual_preference',
  })
  revalidatePath('/memory')
  return null
}

export async function rejectAction(_prev: unknown, form: FormData): Promise<null> {
  const hypothesisId = String(form.get('hypothesisId') ?? '')
  const reason = String(form.get('reason') ?? 'not true of me').trim()
  if (hypothesisId === '') return null

  const ctx = await getContext()
  await rejectHypothesis(ctx, hypothesisId, reason)
  revalidatePath('/memory')
  return null
}
