'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { capture, getContext } from '@ava/app'
import { EMPTY_FORM_STATE } from './form-state'
import type { FormState } from './form-state'

/**
 * Server actions.
 *
 * These are wiring only. All domain logic lives in @ava/core and @ava/app —
 * the web layer never decides anything about state, change or evidence.
 */

export async function createWorkstreamAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') ?? '').trim()
  const goal = String(form.get('goal') ?? '').trim()
  if (name === '') {
    return { ...EMPTY_FORM_STATE, issues: [{ field: 'name', message: 'name is required' }] }
  }
  let id: string
  try {
    const ctx = await getContext()
    const ws = await ctx.workstreams.create(name, goal === '' ? null : goal)
    id = ws.id
  } catch (e) {
    return { ...EMPTY_FORM_STATE, error: describe(e) }
  }
  revalidatePath('/')
  redirect(`/workstreams/${id}`)
}

export async function captureAction(_prev: FormState, form: FormData): Promise<FormState> {
  const workstreamId = String(form.get('workstreamId') ?? '')
  const type = String(form.get('type') ?? '')
  const content = String(form.get('content') ?? '')
  const title = String(form.get('title') ?? '').trim()
  const dueAt = String(form.get('dueAt') ?? '').trim()
  const supersedes = String(form.get('supersedesStateObjectId') ?? '').trim()

  try {
    const ctx = await getContext()
    const result = await capture(ctx, {
      workstreamId,
      type,
      content,
      title: title === '' ? null : title,
      supersedesStateObjectId: supersedes === '' ? null : supersedes,
      fields: dueAt === '' ? {} : { dueAt },
    })
    if (!result.ok) {
      return { error: null, issues: result.issues, createdEvidenceId: null }
    }
    revalidatePath(`/workstreams/${workstreamId}`)
    return { error: null, issues: [], createdEvidenceId: result.evidence.id }
  } catch (e) {
    return { ...EMPTY_FORM_STATE, error: describe(e) }
  }
}

/** Surfaces the failure without leaking captured content into the message. */
function describe(e: unknown): string {
  if (e instanceof Error && /database|connect|ECONN/i.test(e.message)) {
    return 'The local database is unavailable. Nothing was written. Run `npm run db:migrate` and try again.'
  }
  return 'The write did not complete. Nothing was saved.'
}
