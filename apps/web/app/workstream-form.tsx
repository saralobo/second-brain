'use client'

import { useActionState } from 'react'
import { createWorkstreamAction } from './actions'
import { EMPTY_FORM_STATE } from './form-state'

export function WorkstreamForm() {
  const [state, action, pending] = useActionState(createWorkstreamAction, EMPTY_FORM_STATE)

  return (
    <form action={action} className="card">
      {state.error && <div className="error" role="alert">{state.error}</div>}
      <label htmlFor="ws-name">Name</label>
      <input id="ws-name" name="name" required aria-describedby="ws-name-err" />
      {state.issues.filter((i) => i.field === 'name').map((i) => (
        <div key={i.message} id="ws-name-err" className="meta" style={{ color: 'var(--danger)' }}>{i.message}</div>
      ))}
      <label htmlFor="ws-goal">Goal (optional)</label>
      <input id="ws-goal" name="goal" />
      <button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create workstream'}</button>
    </form>
  )
}
