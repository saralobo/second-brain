import { getContext } from '@ava/app'
import { WorkstreamForm } from './workstream-form'

export const dynamic = 'force-dynamic'

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
        Everything below lives on this machine only. No external model has been called.
      </p>

      {failure && <div className="error" role="alert">{failure}</div>}

      {workstreams && workstreams.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <strong>Nothing captured yet.</strong>
          <p style={{ margin: '6px 0 0' }}>
            Create a workstream below, or run <span className="mono">npm run db:seed</span> to load
            the synthetic Project Alpha scenario.
          </p>
        </div>
      )}

      {workstreams && workstreams.length > 0 && (
        <ul className="plain" style={{ marginTop: 18 }}>
          {workstreams.map((w) => (
            <li key={w.id} className="card">
              <h3><a href={`/workstreams/${w.id}`}>{w.name}</a></h3>
              {w.goal && <div className="meta">{w.goal}</div>}
              <div className="meta mono" style={{ marginTop: 6 }}>{w.id}</div>
            </li>
          ))}
        </ul>
      )}

      <h2>New workstream</h2>
      <WorkstreamForm />
    </>
  )
}
