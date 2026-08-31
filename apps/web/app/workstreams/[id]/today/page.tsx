import { buildBriefing, getContext } from '@ava/app'
import { CheckpointForm, PrepareForm } from './today-forms'

export const dynamic = 'force-dynamic'

/**
 * Home / Today (S5-T12).
 *
 * Five blocks, at most three items each and ten in total. Every empty state is
 * a real answer rather than an error — an honest "nothing needs your attention
 * right now" is worth more than a block padded to look busy.
 *
 * Rendering this page DELIVERS the briefing, so it is what stamps `shown_at`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  const ws = await ctx.workstreams.findById(id)
  if (!ws) return <><h1>No such workstream</h1><p className="meta"><a href="/">Back</a></p></>

  const briefing = await buildBriefing(ctx, id, { deliver: true })
  const prepared = new Set(
    (await ctx.prepared.listAvailable(id)).map((a) => a.opportunityId),
  )

  return (
    <>
      <h1>Today · {ws.name}</h1>
      <p className="meta">
        {briefing.since === null
          ? 'No checkpoint has been closed yet, so "since then" has no boundary.'
          : `Since the checkpoint closed on ${briefing.since.toISOString().slice(0, 16).replace('T', ' ')}.`}
        {' · '}
        <a href={`/workstreams/${id}/chat`}>Chat</a>
      </p>

      {briefing.contextHealth !== 'HEALTHY' && (
        <div className="notice" role="status">
          <strong>Context is {briefing.contextHealth}.</strong>
          <ul className="plain" style={{ margin: '6px 0 0' }}>
            {briefing.gaps.map((g) => <li key={g} className="meta">{g}</li>)}
          </ul>
          {briefing.contextHealth === 'INSUFFICIENT' && (
            <p className="meta" style={{ margin: '6px 0 0' }}>
              AVA will not raise anything proactively while context is this thin.
            </p>
          )}
        </div>
      )}

      {briefing.blocks.map((block) => (
        <section key={block.id}>
          <h2>{block.title}</h2>
          {block.items.length === 0 && <div className="empty">{block.emptyMessage}</div>}
          {block.items.map((item) => (
            <div key={item.id} className="card">
              <h3 style={{ margin: 0 }}>{item.headline}</h3>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{item.detail}</p>
              <div className="meta" style={{ marginTop: 8 }}>
                <span className="tag">{item.strength}</span>
                {item.whyHref && <> · <a href={item.whyHref}>Why</a></>}
              </div>
              {item.note && <p className="meta" style={{ marginTop: 6 }}>{item.note}</p>}
              {item.opportunityId && block.id !== 'prepared_for_you'
                && !prepared.has(item.opportunityId) && (
                <PrepareForm opportunityId={item.opportunityId} workstreamId={id} />
              )}
            </div>
          ))}
          {block.heldBack.length > 0 && (
            <details>
              <summary className="meta">{block.heldBack.length} not shown here</summary>
              <ul className="plain" style={{ marginTop: 6 }}>
                {block.heldBack.map((h) => (
                  <li key={h.headline} className="meta">{h.headline} — {h.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}

      {briefing.droppedByCap > 0 && (
        <p className="meta">
          {briefing.droppedByCap} item(s) were left out because a briefing holds at most 10.
        </p>
      )}

      <h2>Checkpoint</h2>
      <p className="meta">
        Closing a checkpoint is what gives &ldquo;since the last checkpoint&rdquo; an exact meaning.
        AVA does not close one for you.
      </p>
      <CheckpointForm workstreamId={id} />
    </>
  )
}
