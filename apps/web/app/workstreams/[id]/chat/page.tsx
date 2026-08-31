import { getContext } from '@ava/app'
import type { ChatMessage } from '@ava/db'
import { ChatForm } from './chat-form'

export const dynamic = 'force-dynamic'

function HealthTag({ state }: { state: string | null }) {
  if (!state) return null
  const cls = state === 'HEALTHY' ? 'tag strong' : state === 'DEGRADED' ? 'tag change' : 'tag superseded'
  return <span className={cls}>context {state.toLowerCase()}</span>
}

async function Turn({ m }: { m: ChatMessage }) {
  const ctx = await getContext()
  const dr = m.decisionRecordId ? await ctx.decisionRecords.findById(m.decisionRecordId) : null

  if (m.role === 'user') {
    return (
      <li className="card" style={{ background: 'transparent' }}>
        <div className="meta">you asked</div>
        <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>
      </li>
    )
  }

  const references = dr
    ? await ctx.evidence.findByIds(dr.answerEvidenceIds)
    : []

  return (
    <li className="card">
      <div>
        <span className="tag">AVA</span>
        {m.abstained && <span className="tag superseded">abstained</span>}
        <HealthTag state={m.contextHealth} />
        {dr?.executionMode === 'mock' && <span className="tag">mock mode — no external model</span>}
      </div>

      <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>

      {dr && dr.uncertainties.length > 0 && (
        <div className="notice" style={{ marginTop: 8 }}>
          <strong>Not certain about:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {dr.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}

      {references.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="meta">
            {references.length} piece{references.length > 1 ? 's' : ''} of evidence behind this
          </summary>
          <ul className="plain" style={{ marginTop: 8 }}>
            {references.map((e) => (
              <li key={e.id} className="meta" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <div>
                  <span className="tag">{e.captureType}</span>
                  <span className="tag">origin: {e.contentOrigin}</span>
                  <span className="tag strong">{e.strength}</span>
                </div>
                <div style={{ marginTop: 4 }}>{e.title ?? e.content.slice(0, 120)}</div>
                <div className="mono">{e.id} · observed {e.observedAt.toISOString().slice(0, 16)}Z</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {m.decisionRecordId ? (
        <div style={{ marginTop: 10 }}>
          <a className="meta" href={`/why/${m.decisionRecordId}`}>Why is AVA saying this? →</a>
        </div>
      ) : (
        <div className="meta" style={{ marginTop: 10 }}>
          No decision record for this turn, so it cannot be explained.
        </div>
      )}
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

  const conversation = await ctx.conversations.ensureLatest(id)
  const messages = await ctx.conversations.messages(conversation.id)

  return (
    <>
      <h1>Chat — {ws.name}</h1>
      <p className="meta">
        Answers use only evidence captured into this workstream. When the evidence does not
        support an answer, AVA says so instead of filling the gap.{' '}
        <a href={`/workstreams/${id}`}>Back to the workstream</a>
      </p>

      <h2>Conversation</h2>
      {messages.length === 0 ? (
        <div className="empty">
          Nothing asked yet. Try <em>What changed in this project?</em>, <em>What decisions did I
          make?</em>, or <em>What is still unresolved?</em>
        </div>
      ) : (
        <ul className="plain">
          {messages.map((m) => <Turn key={m.id} m={m} />)}
        </ul>
      )}

      <h2>Ask</h2>
      <ChatForm workstreamId={id} conversationId={conversation.id} />
    </>
  )
}
