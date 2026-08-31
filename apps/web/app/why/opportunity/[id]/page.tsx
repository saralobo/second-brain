import { getContext, interventionHistory } from '@ava/app'
import { VALUE_VECTOR_FACTORS } from '@ava/core'
import { ActionForm, FeedbackForm, OutcomeForm } from '../../../feedback-forms'

export const dynamic = 'force-dynamic'

/**
 * Why, for an opportunity (S5-T12, brief §21).
 *
 * The whole chain is inspectable: Evidence → Change → Impact → Opportunity →
 * Value Vector → gates → three policy verdicts. No model reasoning appears
 * here, because none was used to decide the opportunity exists, and a
 * narrative about a decision is not a justification for it.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  const o = await ctx.opportunities.findById(id)
  if (!o) return <><h1>No such opportunity</h1><p className="meta"><a href="/">Back</a></p></>

  const evidence = await ctx.evidence.findByIds(o.originEvidenceIds)
  const changes = await Promise.all(o.triggerChangeIds.map((c) => ctx.changes.listByObject(c)))
  const artifacts = await ctx.prepared.listForOpportunity(o.id)
  const cognition = await ctx.cognition.listActive(o.workstreamId)
  const usedCognitionIds = new Set(o.valueVector.permissionScope.derivedFrom)

  const policies = [o.investigate, o.show, o.prepare]
  const history = await interventionHistory(ctx, o.id)
  const t = history?.timeline ?? null
  const stamp = (d: Date | null): string =>
    d === null ? 'not recorded' : d.toISOString().slice(0, 16).replace('T', ' ')

  return (
    <>
      <h1>Why AVA raised this</h1>
      <p className="meta">
        <a href={`/workstreams/${o.workstreamId}/today`}>Back to Today</a>
      </p>

      <h2>The opportunity</h2>
      <div className="card">
        <p style={{ margin: 0 }}><strong>{o.headline}</strong></p>
        <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{o.detail}</p>
        <div className="meta" style={{ marginTop: 8 }}>
          <span className="tag">{o.opportunityClass.replace(/_/g, ' ')}</span>
          <span className="tag">{o.status}</span>
          <span className="tag">{o.strength}</span>
          <span className="tag">context {o.contextHealth}</span>
          <span className="tag">v{o.version}</span>
        </div>
        <p className="meta" style={{ marginTop: 8 }}>
          Rule: <span className="mono">{o.ruleId}</span> ({o.ruleVersion}) ·
          Policy version <span className="mono">{o.show.version}</span>
        </p>
      </div>

      <h2>Change → Impact → Opportunity</h2>
      <div className="card">
        <p className="meta" style={{ margin: 0 }}>Triggering changes</p>
        <ul className="plain">
          {o.triggerChangeIds.length === 0 && <li className="meta">no change triggered this</li>}
          {changes.flat().map((c) => (
            <li key={c.id} className="meta mono">{c.changeType} · {c.objectType} · {c.id}</li>
          ))}
        </ul>
        <p className="meta" style={{ marginTop: 10 }}>Objects reached along declared relations</p>
        <ul className="plain">
          {o.affectedObjects.map((a) => (
            <li key={a.objectId} className="meta">
              {a.objectType} <span className="mono">{a.objectId}</span> —
              {' '}{a.relation.replace(/_/g, ' ')} via {a.viaKind ?? 'direct'}, depth {a.depth}
            </li>
          ))}
        </ul>
      </div>

      <h2>Evidence</h2>
      <div className="card section-evidence">
        {evidence.length === 0 && <p className="meta" style={{ margin: 0 }}>No evidence resolved.</p>}
        <ul className="plain">
          {evidence.map((e) => (
            <li key={e.id}>
              <div className="meta">
                <span className="tag">{e.contentOrigin}</span>
                <span className="tag">{e.strength}</span>
                <span className="mono">{e.observedAt.toISOString().slice(0, 10)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{e.content}</div>
            </li>
          ))}
        </ul>
      </div>

      <h2>Value Vector</h2>
      <p className="meta">
        Thirteen factors, each with where it came from. There is no total: a single
        number would let one factor quietly pay for another.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr><th>Factor</th><th>Value</th><th>Origin</th><th>Basis</th></tr>
          </thead>
          <tbody>
            {VALUE_VECTOR_FACTORS.map((k) => {
              const f = o.valueVector[k]
              return (
                <tr key={k}>
                  <td className="mono">{k}</td>
                  <td><span className="tag">{String(f.value)}</span></td>
                  <td className="meta">{f.origin}</td>
                  <td className="meta">{f.basis}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2>Quality gates</h2>
      <div className="card">
        <ul className="plain">
          {o.gates.results.map((g) => (
            <li key={g.id} className="meta">
              <span className={g.passed ? 'tag strong' : 'tag superseded'}>
                {g.passed ? 'pass' : 'blocked'}
              </span>{' '}
              <span className="mono">{g.id}</span> — {g.reason}
            </li>
          ))}
        </ul>
      </div>

      <h2>The three policies</h2>
      <p className="meta">
        They read the same vector and decide independently. The Show Policy is not given
        preparation status and has no parameter through which it could receive one.
      </p>
      {policies.map((p) => (
        <div key={p.policy} className="card">
          <h3 style={{ margin: 0 }}>{p.policy}</h3>
          <div className="meta" style={{ marginTop: 4 }}>
            <span className={p.verdict === 'PASS' ? 'tag strong' : 'tag superseded'}>{p.verdict}</span>
            <span className="tag">policy {p.version}</span>
          </div>
          <ul className="plain" style={{ marginTop: 6 }}>
            {p.reasons.map((r) => <li key={r} className="meta">{r}</li>)}
          </ul>
          <p className="meta">Factors read: {p.factorsRead.join(', ')}</p>
        </div>
      ))}

      <h2>Declared cognition</h2>
      <div className="card section-declared">
        {usedCognitionIds.size === 0 && (
          <p className="meta" style={{ margin: 0 }}>No declaration applied to this context.</p>
        )}
        {cognition.filter((c) => usedCognitionIds.has(c.id)).map((c) => (
          <p key={c.id} style={{ margin: 0 }}>
            <span className="tag">{c.cognitionType.replace(/_/g, ' ')}</span> {c.content}
          </p>
        ))}
      </div>

      <h2>Behavioural hypotheses</h2>
      <div className="card section-hypothesis">
        <p className="meta" style={{ margin: 0 }}>
          {o.shadowHypothesisIds.length === 0
            ? 'None were relevant to this context.'
            : `${o.shadowHypothesisIds.length} hypothesis(es) exist for this workstream. `}
          They were carried alongside for inspection only. No policy read them, and none
          of them authorised anything.
        </p>
      </div>

      <h2>What AVA could see at generation time</h2>
      <div className="card">
        <p className="meta" style={{ margin: 0 }}>
          Generated {o.generation.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} ·
          {' '}{o.generation.knownEvidenceIds.length} evidence item(s) known ·
          {' '}{o.generation.knownStateVersionIds.length} state version(s) known
        </p>
        <p className="meta" style={{ marginTop: 6 }}>
          This snapshot is written once and never rewritten. Evidence that arrived afterwards
          is deliberately absent: AVA did not have it, and a record that pretended otherwise
          would make every later measurement of anticipation meaningless.
        </p>
      </div>

      <h2>What you said</h2>
      <div className="card">
        {history === null || !history.feedback.hasAny ? (
          <p className="meta" style={{ margin: 0 }}>
            No feedback recorded. That is a valid state — it is not a negative verdict, and AVA
            does not read anything into it.
          </p>
        ) : (
          <>
            <div className="meta" style={{ marginTop: 0 }}>
              <span className="tag">
                correctness: {history.feedback.epistemic ?? 'not answered'}
              </span>
              <span className="tag">
                usefulness: {history.feedback.delivery ?? 'not answered'}
              </span>
              {history.feedback.artifact && (
                <span className="tag">artifact: {history.feedback.artifact.replace(/_/g, ' ')}</span>
              )}
              <span className="mono">{stamp(history.feedback.givenAt)}</span>
            </div>
            {history.feedback.reason && (
              <p style={{ margin: '6px 0 0' }}>{history.feedback.reason}</p>
            )}
            <p className="meta" style={{ marginTop: 8 }}>
              The two verdicts are independent. Correct and already known is a real combination,
              and AVA keeps them apart rather than averaging them into a rating.
            </p>
            {history.feedback.history.length > 1 && (
              <details style={{ marginTop: 8 }}>
                <summary className="meta">
                  {history.feedback.history.length} entries, including corrections
                </summary>
                <ul className="plain" style={{ marginTop: 6 }}>
                  {history.feedback.history.map((f) => (
                    <li key={f.id} className="meta">
                      <span className="mono">{stamp(f.givenAt)}</span>{' '}
                      {f.epistemic ?? '—'} / {f.delivery ?? '—'}
                      {f.artifact ? ` / ${f.artifact.replace(/_/g, ' ')}` : ''}
                      {f.supersededByFeedbackId && ' · later corrected'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <details style={{ marginTop: 10 }}>
          <summary className="meta">
            {history?.feedback.hasAny ? 'Correct what you said' : 'Record what you think'}
          </summary>
          <FeedbackForm
            targetId={o.id}
            workstreamId={o.workstreamId}
            withArtifact={artifacts.length > 0}
            correctsFeedbackId={
              history?.feedback.sourceIds.delivery ?? history?.feedback.sourceIds.epistemic ?? null
            }
          />
        </details>
      </div>

      <h2>What you did</h2>
      <div className="card">
        {history === null || history.actions.length === 0 ? (
          <p className="meta" style={{ margin: 0 }}>
            No action recorded. AVA has no way to observe what you do outside it, so nothing is
            assumed either way.
          </p>
        ) : (
          <ul className="plain">
            {history.actions.map((a) => (
              <li key={a.id} className="meta">
                <span className="mono">{stamp(a.actedAt)}</span>{' '}
                <span className="tag">{a.kind.replace(/_/g, ' ')}</span>
                {a.description && ` — ${a.description}`}
              </li>
            ))}
          </ul>
        )}
        <ActionForm opportunityId={o.id} workstreamId={o.workstreamId} />
      </div>

      <h2>How it ended</h2>
      <div className="card">
        {history === null || history.outcome === null ? (
          <p className="meta" style={{ margin: 0 }}>
            No outcome recorded. Silence is not resolution, and AVA will not write one in for you.
          </p>
        ) : (
          <>
            <div className="meta">
              <span className="tag">{history.outcome.state}</span>
              <span className="tag">{history.outcome.resolvedBy.replace(/_/g, ' ')}</span>
              <span className="mono">{stamp(history.outcome.recordedAt)}</span>
            </div>
            {history.outcome.note && <p style={{ margin: '6px 0 0' }}>{history.outcome.note}</p>}
            {history.outcomeHistory.length > 1 && (
              <details style={{ marginTop: 8 }}>
                <summary className="meta">{history.outcomeHistory.length} outcome entries</summary>
                <ul className="plain" style={{ marginTop: 6 }}>
                  {history.outcomeHistory.map((oc) => (
                    <li key={oc.id} className="meta">
                      <span className="mono">{stamp(oc.recordedAt)}</span>{' '}
                      <span className="tag">{oc.state}</span>
                      {oc.supersededByOutcomeId && ' · later revised'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <OutcomeForm opportunityId={o.id} workstreamId={o.workstreamId} />
      </div>

      <h2>Timeline</h2>
      <div className="card">
        <table>
          <tbody>
            {t !== null && ([
              ['evidence arrived', t.evidenceArrivedAt],
              ['change became detectable', t.changeDetectableAt],
              ['change detected', t.changeDetectedAt],
              ['opportunity generated', t.opportunityGeneratedAt],
              ['opportunity shown', t.opportunityShownAt],
              ['feedback given', t.feedbackAt],
              ['action taken', t.userActionAt],
              ['outcome recorded', t.outcomeAt],
            ] as const).map(([name, value]) => (
              <tr key={name}>
                <td className="meta">{name}</td>
                <td className="mono">{stamp(value)}</td>
              </tr>
            ))}
            <tr>
              <td className="meta">you saw it</td>
              <td className="meta">
                not recorded — AVA has no way to know when you read something, and delivering is
                not reading
              </td>
            </tr>
          </tbody>
        </table>
        <p className="meta" style={{ marginTop: 8 }}>
          Missing timestamps are left missing. Filling one in afterwards would destroy the only
          thing this timeline is for.
        </p>
      </div>

      {artifacts.length > 0 && (
        <>
          <h2>Prepared</h2>
          {artifacts.map((a) => (
            <div key={a.id} className="card">
              <h3 style={{ margin: 0 }}>{a.title}</h3>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{a.body}</pre>
              <p className="meta" style={{ marginTop: 6 }}>
                {a.executionMode} mode · cost {(a.actualCostUsd ?? 0).toFixed(6)} USD ·
                {' '}system-origin, so it can never become evidence for this opportunity.
              </p>
            </div>
          ))}
        </>
      )}
    </>
  )
}
