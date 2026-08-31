'use server'

import { revalidatePath } from 'next/cache'
import { ask, buildProviderRegistry, getContext } from '@ava/app'

/**
 * Chat server action.
 *
 * Wiring only. Every decision — retrieval, health, gating, grounding — lives
 * in @ava/app and @ava/core.
 */
export async function askAction(_prev: unknown, form: FormData): Promise<null> {
  const workstreamId = String(form.get('workstreamId') ?? '')
  const conversationId = String(form.get('conversationId') ?? '')
  const question = String(form.get('question') ?? '').trim()
  if (question === '' || workstreamId === '') return null

  const ctx = await getContext()
  const setup = await buildProviderRegistry()

  await ctx.conversations.addMessage({ conversationId, role: 'user', body: question })
  await ask(ctx, { registry: setup.registry, providerName: setup.active, caps: setup.caps }, {
    workstreamId, question, conversationId,
  })

  revalidatePath(`/workstreams/${workstreamId}/chat`)
  return null
}
