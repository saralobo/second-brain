import { buildGlobalBriefing, getContext } from '@ava/app'

export const dynamic = 'force-dynamic'

/**
 * Global Today — composed across workstreams by aggregation.
 *
 * Each workstream computed its own briefing behind its own boundary; this
 * concatenates the results. No evidence crossed, there is no global score, and
 * every item carries its own Context Health because health is per task and
 * there is no global value.
 *
 * Rendering this page DELIVERS the briefing, so it is what stamps `shown_at`.
 */
export default async function Page() {
  const ctx = await getContext()
  const briefing = await buildGlobalBriefing(ctx, { deliver: true })

  const degraded = briefing.workstreams.filter((w) => w.contextHealth !== 'HEALTHY')

  return (
    <>
      <h1>Today</h1>
      <p className="meta">
        Across {briefing.workstreams.length}{' '}
        {briefing.workstreams.length === 1 ? 'workstream' : 'workstreams'}. Every item names where
        it came from — I report across your projects, I do not reason across them.
      </p>

      {degraded.length > 0 && (
        <div className="notice" role="status">
          <strong>Context is incomplete in {degraded.map((w) => w.name).join(', ')}.</strong>
          <ul className="plain" style={{ margin: '6px 0 0' }}>
            {degraded.flatMap((w) => w.gaps.map((g) => (
              <li key={`${w.id}-${g}`} className="meta">{w.name}: {g}</li>
            )))}
          </ul>
        </div>
      )}

      {briefing.workstreams.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <strong>No workstreams yet.</strong>
          <p style={{ margin: '6px 0 0' }}>
            <a href="/workstreams">Create one</a> and I will start watching it.
          </p>
        </div>
      )}

      {briefing.blocks.map((block) => (
        <section key={block.id}>
          <h2>{block.title}</h2>
          {block.items.length === 0 && <div className="empty">{block.emptyMessage}</div>}
          {block.items.map((item) => (
            <div key={item.id} className="card">
              <div className="meta" style={{ marginBottom: 6 }}>
                <a className="tag ws" href={`/workstreams/${item.workstreamId}/today`}>
                  {item.workstreamName}
                </a>
                <span className="tag">{item.strength}</span>
                {item.contextHealth !== 'HEALTHY' && (
                  <span className="tag change">context {item.contextHealth}</span>
                )}
              </div>
              <h3 style={{ margin: 0 }}>{item.headline}</h3>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{item.detail}</p>
              {item.note && <p className="meta" style={{ marginTop: 6 }}>{item.note}</p>}
              {item.whyHref && (
                <div className="meta" style={{ marginTop: 8 }}>
                  <a href={item.whyHref}>Why</a>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {briefing.droppedByCap > 0 && (
        <p className="meta">
          {briefing.droppedByCap} item(s) left out — a briefing holds at most 10, across
          everything.
        </p>
      )}
    </>
  )
}
