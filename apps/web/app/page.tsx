import { getContext, readLandscape } from '@ava/app'
import { HomeCore } from './_core/home-core'

export const dynamic = 'force-dynamic'

/**
 * AVA's home.
 *
 * Not a dashboard and not a list of projects. AVA is present, she states what
 * is waiting in one line, and conversation is one press away. The information
 * below supports the conversation rather than competing with it.
 */
export default async function Page() {
  let landscape
  let failure: string | null = null
  try {
    const ctx = await getContext()
    landscape = await readLandscape(ctx)
  } catch {
    failure = 'The local database is unavailable. Run `npm run db:migrate` and reload.'
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'

  return (
    <>
      {failure && <div className="error" role="alert">{failure}</div>}

      <div className="stage">
        <HomeCore
          attentionCount={landscape?.attentionCount ?? 0}
          degraded={(landscape?.degradedWorkstreams.length ?? 0) > 0}
        />
        <p className="greeting">{greeting}</p>

        {landscape === undefined ? null : landscape.workstreamCount === 0 ? (
          <p className="landscape">
            Nothing is set up yet. Create a workstream, or run{' '}
            <span className="mono">npm run db:seed -- --proactive</span>.
          </p>
        ) : (
          <p className="landscape">
            {landscape.attentionCount === 0
              ? <>Nothing needs your attention right now.</>
              : <><strong>{landscape.attentionCount}</strong> {landscape.attentionCount === 1 ? 'thing needs' : 'things need'} your attention.</>}
            {landscape.changeCount > 0 && <> <strong>{landscape.changeCount}</strong> {landscape.changeCount === 1 ? 'change' : 'changes'} since your last checkpoint.</>}
            {landscape.openLoopCount > 0 && <> <strong>{landscape.openLoopCount}</strong> open {landscape.openLoopCount === 1 ? 'loop' : 'loops'}.</>}
          </p>
        )}

        {landscape !== undefined && landscape.degradedWorkstreams.length > 0 && (
          <p className="meta" style={{ marginTop: 10 }}>
            Context is incomplete in {landscape.degradedWorkstreams.join(', ')} — I will say so
            when it affects an answer.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 6 }}>
        <a href="/live"><button type="button" className="primary">Talk to AVA</button></a>
        <a href="/today"><button type="button">Today</button></a>
        <a href="/ask"><button type="button">Ask in writing</button></a>
      </div>

      {landscape !== undefined && landscape.workstreamCount > 0 && (
        <>
          <h2>Across your work</h2>
          <div className="card">
            <p className="meta" style={{ margin: 0 }}>
              {landscape.workstreamCount} {landscape.workstreamCount === 1 ? 'workstream' : 'workstreams'}.
              Each keeps its own evidence: I report across them, and I do not mix them.{' '}
              <a href="/workstreams">Open workstreams</a> · <a href="/today">See Today</a>
            </p>
          </div>
        </>
      )}
    </>
  )
}
