import { getContext, currentState } from '@ava/app'
import type { CurrentStateEntry } from '@ava/core'
import type { ChangeRecord } from '@ava/core'

export const dynamic = 'force-dynamic'

function when(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

/** Observation time and effective time are shown as different things. */
function Timing({ observedAt, effectiveAt }: { observedAt: Date; effectiveAt: Date | null }) {
  return (
    <span className="meta">
      observed {when(observedAt)}
      {effectiveAt && <> · effective {when(effectiveAt)}</>}
    </span>
  )
}

function StateCard({ entry, workstreamId }: { entry: CurrentStateEntry; workstreamId: string }) {
  const superseded = entry.current.status === 'superseded'
  return (
    <li className="card">
      <h3>{entry.current.title}</h3>
      <div style={{ margin: '6px 0' }}>
        <span className="tag">{entry.type}</span>
        <span className={superseded ? 'tag superseded' : 'tag'}>{entry.current.status}</span>
        <span className="tag strong">{entry.current.strength}</span>
        <span className="tag">v{entry.current.version}</span>
      </div>
      <Timing observedAt={entry.current.observedAt} effectiveAt={entry.current.effectiveAt} />
      <div className="meta mono" style={{ marginTop: 6 }}>
        object {entry.objectId} · evidence {entry.current.evidenceIds.join(', ')}
      </div>

      {entry.superseded.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="meta">
            {entry.superseded.length} earlier version
            {entry.superseded.length > 1 ? 's' : ''} — still reachable
          </summary>
          <ul className="plain" style={{ marginTop: 8 }}>
            {entry.superseded.map((v) => (
              <li key={v.id} className="meta" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <strong>v{v.version}</strong> · {v.status} · {v.title}
                <div className="mono">{when(v.observedAt)}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!superseded && (
        <div style={{ marginTop: 10 }}>
          <a className="meta" href={`/capture?workstream=${workstreamId}&supersedes=${entry.objectId}`}>
            Capture superseding information →
          </a>
        </div>
      )}
    </li>
  )
}

function ChangeCard({ change }: { change: ChangeRecord }) {
  return (
    <li className="card">
      <div>
        <span className="tag change">{change.changeType}</span>
        <span className="tag">{change.detector}</span>
        <span className="tag strong">{change.strength}</span>
        {change.status === 'candidate' && <span className="tag superseded">candidate — needs review</span>}
      </div>
      <div className="meta" style={{ marginTop: 6 }}>detected from evidence observed {when(change.observedAt)}</div>
      <div className="diff">
        <div>
          <div className="lbl">before</div>
          <div className="mono">{change.beforeVersionRef ?? '— (first version)'}</div>
        </div>
        <div>
          <div className="lbl">after</div>
          <div className="mono">{change.afterVersionRef ?? '—'}</div>
        </div>
      </div>
      {change.changedFields.length > 0 && (
        <div className="meta" style={{ marginTop: 8 }}>changed: {change.changedFields.join(', ')}</div>
      )}
      <div className="meta mono" style={{ marginTop: 6 }}>
        object {change.objectId} · evidence {change.evidenceIds.join(', ') || '—'}
        {change.candidateDependencies.length > 0 && <> · impacts {change.candidateDependencies.join(', ')}</>}
      </div>
    </li>
  )
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  const ws = await ctx.workstreams.findById(id)

  if (!ws) {
    return (
      <>
        <h1>Workstream not found</h1>
        <p className="meta"><a href="/">Back to workstreams</a></p>
      </>
    )
  }

  const [view, changes, evidence] = await Promise.all([
    currentState(ctx, id),
    ctx.changes.listByWorkstream(id, 25),
    ctx.evidence.listByWorkstream(id, 25),
  ])

  return (
    <>
      <h1>{ws.name}</h1>
      {ws.goal && <p className="meta">{ws.goal}</p>}
      <p style={{ marginTop: 14 }}>
        <a href={`/capture?workstream=${id}`}>Capture into this workstream →</a>
        {'  ·  '}
        <a href={`/workstreams/${id}/chat`}>Ask AVA about this workstream →</a>
      </p>

      <h2>Current state</h2>
      {view.entries.length === 0 ? (
        <div className="empty">
          Nothing has state yet. Decisions, goals, commitments, questions and risks create state;
          notes and principles are recorded as evidence only.
        </div>
      ) : (
        <ul className="plain">
          {view.entries.map((e) => <StateCard key={e.objectId} entry={e} workstreamId={id} />)}
        </ul>
      )}

      <h2>Recent changes</h2>
      {changes.length === 0 ? (
        <div className="empty">Nothing has changed since the first capture.</div>
      ) : (
        <ul className="plain">{changes.map((c) => <ChangeCard key={c.id} change={c} />)}</ul>
      )}

      <h2>Recent evidence</h2>
      {evidence.length === 0 ? (
        <div className="empty">No evidence recorded yet.</div>
      ) : (
        <ul className="plain">
          {evidence.map((e) => (
            <li key={e.id} className="card">
              <div>
                <span className="tag">{e.captureType}</span>
                <span className="tag">origin: {e.contentOrigin}</span>
                <span className="tag strong">{e.strength}</span>
              </div>
              {e.title && <h3 style={{ marginTop: 8 }}>{e.title}</h3>}
              <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{e.content}</p>
              <Timing observedAt={e.observedAt} effectiveAt={e.effectiveAt} />
              <div className="meta mono" style={{ marginTop: 4 }}>
                {e.id} · source {e.sourceRecordId} · sha256 {e.hash.slice(0, 12)}…
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
