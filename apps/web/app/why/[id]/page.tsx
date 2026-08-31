import { getContext } from '@ava/app'

export const dynamic = 'force-dynamic'

/**
 * The Why surface (S3-T12).
 *
 * No model is on this path — it reads the DecisionRecord and the ledger.
 * It shows evidence and provenance, never the model's private reasoning:
 * chain-of-thought is a narrative about an answer, not a justification for it,
 * and showing it would invite trust that the evidence does not support.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  const dr = await ctx.decisionRecords.findById(id)

  if (!dr) {
    return (
      <>
        <h1>No such decision record</h1>
        <p className="meta"><a href="/">Back to workstreams</a></p>
      </>
    )
  }

  const used = await ctx.evidence.findByIds(dr.answerEvidenceIds)
  const health = dr.packet?.health
  const run = dr.modelRunId ? await ctx.modelRuns.findById(dr.modelRunId) : null
  const supersededIds = new Set(
    (dr.packet?.retrieved ?? [])
      .filter((r) => r.supersededByObjectVersion !== null)
      .map((r) => r.evidenceId),
  )

  return (
    <>
      <h1>Why AVA said this</h1>
      <p className="meta">
        {dr.workstreamId && <a href={`/workstreams/${dr.workstreamId}/chat`}>Back to the chat</a>}
      </p>

      <h2>The question</h2>
      <div className="card">
        <p style={{ margin: 0 }}>{dr.request}</p>
        <div className="meta" style={{ marginTop: 6 }}>
          <span className="tag">{dr.queryKind}</span>
          <span className={dr.abstained ? 'tag superseded' : 'tag strong'}>
            {dr.abstained ? 'abstained' : 'answered'}
          </span>
          <span className="tag">{dr.executionMode} mode</span>
        </div>
      </div>

      <h2>The answer</h2>
      <div className="card">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{dr.answer}</p>
        {dr.abstentionReason && (
          <p className="meta" style={{ marginTop: 8 }}>Reason: {dr.abstentionReason}</p>
        )}
      </div>

      <h2>Context health</h2>
      <div className="card">
        <div>
          <span className={health?.state === 'HEALTHY' ? 'tag strong' : 'tag change'}>
            {dr.contextHealthState}
          </span>
          {health?.decidedBy && <span className="tag">decided by {health.decidedBy}</span>}
        </div>
        <ul className="plain" style={{ marginTop: 8 }}>
          {(health?.dimensions ?? []).map((d) => (
            <li key={d.id} className="meta" style={{ padding: '4px 0' }}>
              <span className="mono">{d.verdict.padEnd(15)}</span> {d.id}
              {d.material ? '' : ' (not material to this question)'} — {d.detail}
            </li>
          ))}
        </ul>
      </div>

      <h2>Evidence used</h2>
      {used.length === 0 ? (
        <div className="empty">No evidence was used. That is why AVA did not assert anything.</div>
      ) : (
        <ul className="plain">
          {used.map((e) => (
            <li key={e.id} className="card">
              <div>
                <span className="tag">{e.captureType}</span>
                <span className="tag">origin: {e.contentOrigin}</span>
                <span className="tag strong">{e.strength}</span>
                <span className={supersededIds.has(e.id) ? 'tag superseded' : 'tag'}>
                  {supersededIds.has(e.id) ? 'superseded' : 'current'}
                </span>
              </div>
              {e.title && <h3 style={{ marginTop: 8 }}>{e.title}</h3>}
              <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{e.content}</p>
              <div className="meta mono">
                {e.id} · source {e.sourceRecordId} · observed {e.observedAt.toISOString()}
                {e.effectiveAt && ` · effective ${e.effectiveAt.toISOString()}`}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>What was retrieved but not used</h2>
      {dr.excluded.length === 0 ? (
        <div className="empty">Nothing was excluded.</div>
      ) : (
        <ul className="plain">
          {dr.excluded.map((x) => (
            <li key={x.evidenceId} className="card">
              <span className="tag superseded">{x.reason}</span>
              <span className="mono">{x.evidenceId}</span>
              <div className="meta" style={{ marginTop: 4 }}>{x.detail}</div>
            </li>
          ))}
        </ul>
      )}

      <h2>How it was produced</h2>
      <div className="card meta">
        <div>prompt: {dr.promptId}/{dr.promptVersion}</div>
        <div>provider: {dr.provider ?? 'none — answered locally'}</div>
        <div>model: {dr.model ?? '—'}</div>
        <div>grounding validation: {dr.groundingValid === null ? 'not run' : dr.groundingValid ? 'passed' : 'FAILED — answer discarded'}</div>
        {dr.groundingFailures.length > 0 && (
          <ul style={{ margin: '6px 0 0 18px' }}>
            {dr.groundingFailures.map((f, i) => <li key={i}>{f.kind}: {f.detail}</li>)}
          </ul>
        )}
        {run && (
          <div style={{ marginTop: 6 }}>
            model run {run.id} · {run.status}
            {run.latency_ms !== null && ` · ${run.latency_ms}ms`}
            {run.actual_cost_usd !== null && ` · $${run.actual_cost_usd}`}
          </div>
        )}
        <div style={{ marginTop: 6 }}>decided at {dr.decidedAt.toISOString()}</div>
      </div>

      <p className="meta" style={{ marginTop: 18 }}>
        This page shows evidence and the recorded decision. It does not show model reasoning:
        a model&apos;s account of its own answer is not evidence for it.
      </p>
    </>
  )
}
