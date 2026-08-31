import { getContext } from '@ava/app'
import { LiveSession } from './live-session'

export const dynamic = 'force-dynamic'

/**
 * Live — voice conversation with AVA.
 *
 * Per ADR-24: browser speech recognition, canonical AVA cognition, local
 * speech synthesis. Consent is required before the microphone opens, and the
 * microphone state is visible at all times.
 */
export default async function Page() {
  const ctx = await getContext()
  const workstreams = await ctx.workstreams.list()
  return (
    <LiveSession workstreams={workstreams.map((w) => ({ id: w.id, name: w.name }))} />
  )
}
