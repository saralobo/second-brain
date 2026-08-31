'use client'

import { useActionState } from 'react'
import { closeCheckpointAction, prepareAction } from '../../../today-actions'

export function CheckpointForm({ workstreamId }: { workstreamId: string }) {
  const [state, action, pending] = useActionState(closeCheckpointAction, null)
  return (
    <form action={action} className="card">
      <input type="hidden" name="workstreamId" value={workstreamId} />
      <label htmlFor="cp-note">Note (optional)</label>
      <input id="cp-note" name="note" placeholder="end of the working day" />
      <div className="actions">
        <button type="submit" disabled={pending}>Close this checkpoint</button>
      </div>
      {state?.message && <p className="meta">{state.message}</p>}
    </form>
  )
}

/**
 * Preparing is an explicit act, and it is separate from showing. An item can
 * be shown and never prepared, or prepared and never shown — pressing this
 * does not make the item any more likely to appear.
 */
export function PrepareForm(
  { opportunityId, workstreamId }: { opportunityId: string; workstreamId: string },
) {
  const [state, action, pending] = useActionState(prepareAction, null)
  return (
    <form action={action} style={{ marginTop: 8 }}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="workstreamId" value={workstreamId} />
      <button type="submit" disabled={pending}>Prepare a review checklist</button>
      {state?.message && <p className="meta" style={{ marginTop: 6 }}>{state.message}</p>}
    </form>
  )
}
