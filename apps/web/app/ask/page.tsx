import { getContext } from '@ava/app'
import { AskPanel } from './ask-panel'

export const dynamic = 'force-dynamic'

/**
 * Ask AVA — the written path, with the same scope rules as Live.
 *
 * Scope is explicit and always visible. A question asked with no workstream
 * selected is answered from global personal cognition or refused with its
 * reason; it is never quietly answered from one project and presented as
 * though it covered everything.
 */
export default async function Page() {
  const ctx = await getContext()
  const workstreams = await ctx.workstreams.list()
  return (
    <>
      <h1>Ask AVA</h1>
      <AskPanel workstreams={workstreams.map((w) => ({ id: w.id, name: w.name }))} />
    </>
  )
}
