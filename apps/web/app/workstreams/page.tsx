import { getContext } from '@ava/app'
import { WorkstreamForm } from '../workstream-form'

export const dynamic = 'force-dynamic'

/**
 * Workstreams — a destination, no longer the entry point.
 *
 * They remain the real context boundary: evidence never crosses between them,
 * and that is enforced in the query layer rather than here.
 */
export default async function Page() {
  let workstreams
  let failure: string | null = null
  try {
    const ctx = await getContext()
    workstreams = await ctx.workstreams.list()
  } catch {
    failure = 'The local database is unavailable. Run `npm run db:migrate` and reload.'
  }

  return (
    <>
      <h1>Workstreams</h1>
      <p className="meta">
        Each workstream is a context boundary. Evidence stays inside the one it belongs to,
        which is why I can report across them without mixing them.
      </p>

      {failure && <div className="error" role="alert">{failure}</div>}

      {workstreams && workstreams.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <strong>Nothing captured yet.</strong>
          <p style={{ margin: '6px 0 0' }}>
            Create one below, or run <span className="mono">npm run db:seed -- --proactive</span>.
          </p>
        </div>
      )}

      {workstreams && workstreams.length > 0 && (
        <ul className="plain" style={{ marginTop: 18 }}>
          {workstreams.map((w) => (
            <li key={w.id} className="card">
              <h3><a href={`/workstreams/${w.id}`}>{w.name}</a></h3>
              {w.goal && <div className="meta">{w.goal}</div>}
              <div className="meta" style={{ marginTop: 8 }}>
                <a href={`/workstreams/${w.id}/today`}>Today</a>
                {' · '}
                <a href={`/workstreams/${w.id}/chat`}>Ask about this project</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>New workstream</h2>
      <WorkstreamForm />
    </>
  )
}
