'use client'

import { useActionState, useState } from 'react'
import { CAPTURE_TYPES } from '@ava/core'
import { captureAction } from '../actions'
import { EMPTY_FORM_STATE } from '../form-state'

interface Props {
  workstreams: { id: string; name: string }[]
  defaultWorkstreamId: string
  supersedes: string
}

export function CaptureForm({ workstreams, defaultWorkstreamId, supersedes }: Props) {
  const [state, action, pending] = useActionState(captureAction, EMPTY_FORM_STATE)
  const [type, setType] = useState(supersedes ? 'correction' : 'decision')
  const [workstreamId, setWorkstreamId] = useState(defaultWorkstreamId)

  const issue = (field: string) => state.issues.find((i) => i.field === field)?.message

  return (
    <form action={action} className="card">
      {state.error && <div className="error" role="alert">{state.error}</div>}

      {state.createdEvidenceId && (
        <div className="notice" role="status">
          Evidence recorded — <span className="mono">{state.createdEvidenceId}</span>.{' '}
          <a href={`/workstreams/${workstreamId}`}>See the workstream</a>.
        </div>
      )}

      <input type="hidden" name="workstreamId" value={workstreamId} />

      <label htmlFor="cap-ws">Workstream</label>
      <select id="cap-ws" value={workstreamId} onChange={(e) => setWorkstreamId(e.target.value)}>
        {workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <label htmlFor="cap-type">Type</label>
      <select id="cap-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
        {CAPTURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {issue('type') && <div className="meta" style={{ color: 'var(--danger)' }}>{issue('type')}</div>}

      <label htmlFor="cap-title">Title (optional)</label>
      <input id="cap-title" name="title" />

      <label htmlFor="cap-content">Content</label>
      <textarea id="cap-content" name="content" required aria-describedby="cap-content-err" />
      {issue('content') && (
        <div id="cap-content-err" className="meta" style={{ color: 'var(--danger)' }}>{issue('content')}</div>
      )}

      {type === 'commitment' && (
        <>
          <label htmlFor="cap-due">Due at</label>
          <input id="cap-due" name="dueAt" type="datetime-local" />
          {issue('fields.dueAt') && (
            <div className="meta" style={{ color: 'var(--danger)' }}>{issue('fields.dueAt')}</div>
          )}
        </>
      )}

      {type === 'correction' && (
        <>
          <label htmlFor="cap-sup">Corrects which state object?</label>
          <input
            id="cap-sup" name="supersedesStateObjectId" defaultValue={supersedes}
            placeholder="state object id" className="mono"
          />
          <div className="meta" style={{ marginTop: 4 }}>
            A correction never overwrites. It writes a new version and leaves the previous one
            reachable.
          </div>
          {issue('supersedesStateObjectId') && (
            <div className="meta" style={{ color: 'var(--danger)' }}>{issue('supersedesStateObjectId')}</div>
          )}
        </>
      )}

      <button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record'}</button>
    </form>
  )
}
