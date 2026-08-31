'use server'

import {
  buildProviderRegistry, commitPendingWrite, getContext, handleTurn,
} from '@ava/app'
import type { PendingWrite, TurnOutcome } from '@ava/app'

/**
 * One conversational turn.
 *
 * Shared by Live and by the written Ask surface, deliberately: speech and
 * typing are two transports into the same brain, and giving them separate
 * handlers is how they would drift apart.
 */
export async function turnAction(input: {
  text: string
  workstreamId: string | null
  lastDecisionRecordId: string | null
  observedAt: string | null
}): Promise<TurnOutcome> {
  const ctx = await getContext()
  const setup = await buildProviderRegistry()
  return handleTurn(
    ctx,
    { registry: setup.registry, providerName: setup.active, caps: setup.caps },
    {
      text: input.text,
      workstreamId: input.workstreamId,
      lastDecisionRecordId: input.lastDecisionRecordId,
      observedAt: input.observedAt,
    },
  )
}

/**
 * Executes a write the user confirmed out loud.
 *
 * Routed through the same domain services the forms use. There is no separate
 * write path for speech, and a confirmation is required before anything here
 * runs.
 */
export async function commitAction(pending: PendingWrite): Promise<TurnOutcome> {
  const ctx = await getContext()
  return commitPendingWrite(ctx, pending)
}
