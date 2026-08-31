import { getContext, memorySurface } from '@ava/app'
import { describeScope } from '@ava/core'
import type { BehavioralHypothesis, DeclaredCognition, MemoryRecord } from '@ava/core'
import { CognitionActions, DeclareForm, HypothesisActions } from './memory-forms'

export const dynamic = 'force-dynamic'

/**
 * What AVA knows (spec §2.5).
 *
 * Five visually separate sections. The separation IS the product: a single
 * "Memory" list would present a guess and a sentence the user wrote as the
 * same kind of object, and she would have no way to tell which of her stated
 * preferences she never actually stated.
 */
function when(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

async function DeclarationCard({ c, editable }: { c: DeclaredCognition; editable: boolean }) {
  const ctx = await getContext()
  const evidence = await ctx.evidence.findByIds(c.evidenceIds)
  const history = await ctx.cognition.history(c.rootId)

  return (
    <li className={editable ? 'card section-declared' : 'card section-superseded'}>
      <div>
        <span className={editable ? 'authority high' : 'authority none'}>
          {editable ? (c.origin === 'confirmed' ? 'confirmed by you' : 'declared by you') : c.status}
        </span>
      </div>
      <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{c.content}</p>
      <div style={{ margin: '6px 0' }}>
        <span className="tag">{c.cognitionType.replace(/_/g, ' ')}</span>
        <span className="tag">v{c.version}</span>
        {c.supersededBy && <span className="tag superseded">replaced</span>}
      </div>
      <div className="meta">applies to — {describeScope(c.scope)}</div>
      <div className="meta">declared {when(c.declaredAt)}</div>

      <details style={{ marginTop: 8 }}>
        <summary className="meta">Why AVA has this</summary>
        <div className="meta" style={{ marginTop: 6 }}>
          You said it. The wording is in the ledger:
          <ul className="plain" style={{ marginTop: 6 }}>
            {evidence.map((e) => (
              <li key={e.id} style={{ padding: '4px 0' }}>
                <span className="mono">{e.id}</span> · {e.contentOrigin} · observed {when(e.observedAt)}
                <div style={{ whiteSpace: 'pre-wrap' }}>{e.content}</div>
              </li>
            ))}
          </ul>
          {history.length > 1 && (
            <>
              <div style={{ marginTop: 8 }}>Version history — nothing was deleted:</div>
              <ul className="plain">
                {history.map((h) => (
                  <li key={h.id} style={{ padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                    <strong>v{h.version}</strong> ({h.status}, {h.origin}) — {h.content}
                    <div className="mono">{when(h.declaredAt)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      {editable && <CognitionActions id={c.id} content={c.content} />}
    </li>
  )
}

async function KnowledgeCard({ m }: { m: MemoryRecord }) {
  const ctx = await getContext()
  const evidence = await ctx.evidence.findByIds(m.derivedFromEvidenceIds)
  return (
    <li className="card section-evidence">
      <div><span className="authority mid">evidence-backed</span></div>
      <p style={{ margin: '6px 0' }}>{m.title}</p>
      <div>
        <span className="tag strong">{m.strength}</span>
        <span className="tag">{m.memoryClass.replace(/_/g, ' ')}</span>
        {m.promotedAt && <span className="tag">promoted {when(m.promotedAt)}</span>}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="meta">Why AVA has this — {evidence.length} source(s)</summary>
        <ul className="plain" style={{ marginTop: 6 }}>
          {evidence.map((e) => (
            <li key={e.id} className="meta" style={{ padding: '4px 0' }}>
              <span className="mono">{e.id}</span> · origin {e.contentOrigin} · {when(e.observedAt)}
              <div>{e.content}</div>
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

async function HypothesisCard({ h }: { h: BehavioralHypothesis }) {
  const ctx = await getContext()
  const evidence = await ctx.evidence.findByIds(h.evidenceIds)
  const counter = await ctx.evidence.findByIds(h.counterEvidenceIds)

  return (
    <li className="card section-hypothesis">
      <div><span className="authority low">a guess — you never told me this</span></div>
      <p style={{ margin: '6px 0' }}>I have a hypothesis that {h.falsifiableDescription}</p>
      <div>
        <span className="tag change">{h.status}</span>
        <span className="tag">shadow mode — governs nothing</span>
        <span className="tag strong">{h.strength}</span>
      </div>
      <div className="meta">observed in — {h.context}</div>
      <div className="meta">applies to — {describeScope(h.scope)}</div>
      <div className="meta">
        alternatives that were available — {h.alternativesAvailable.join(', ') || 'none recorded'}
      </div>
      {h.possibleConfounder && <div className="meta">possible confounder — {h.possibleConfounder}</div>}

      <details style={{ marginTop: 8 }}>
        <summary className="meta">Why AVA has this</summary>
        <div className="meta" style={{ marginTop: 6 }}>
          AVA noticed a pattern. It is not something you said, it does not affect what AVA does,
          and it never becomes a principle on its own.
          <ul className="plain" style={{ marginTop: 6 }}>
            {evidence.map((e) => (
              <li key={e.id} style={{ padding: '4px 0' }}>
                <span className="mono">{e.id}</span> — {e.content}
              </li>
            ))}
          </ul>
          {counter.length > 0 && (
            <>
              <div style={{ marginTop: 6 }}>Counter-evidence:</div>
              <ul className="plain">
                {counter.map((e) => (
                  <li key={e.id} style={{ padding: '4px 0' }}>
                    <span className="mono">{e.id}</span> — {e.content}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      {h.status !== 'contradicted' && h.status !== 'confirmed' && (
        <HypothesisActions id={h.id} description={h.falsifiableDescription} />
      )}
      {h.rejectedReason && <div className="meta" style={{ marginTop: 8 }}>You rejected this: {h.rejectedReason}</div>}
    </li>
  )
}

export default async function Page() {
  const ctx = await getContext()
  const surface = await memorySurface(ctx, null)

  return (
    <>
      <h1>What AVA knows</h1>
      <p className="meta">
        Grouped by where it came from and how much weight it carries. Things you told AVA are not
        the same as things AVA guessed, and they are never shown as though they were.
      </p>

      <h2>Declared by you</h2>
      <p className="section-hint">
        Highest authority. AVA may state these as your own words, inside the scope you gave them.
      </p>
      {surface.declared.length === 0 ? (
        <div className="empty">
          You have not told AVA anything yet. Nothing here is inferred — this section fills only
          when you say something.
        </div>
      ) : (
        <ul className="plain">
          {surface.declared.map((c) => <DeclarationCard key={c.id} c={c} editable />)}
        </ul>
      )}

      <h2>Tell AVA something</h2>
      <DeclareForm />

      <h2>Evidence-backed knowledge</h2>
      <p className="section-hint">
        Supported by the record, not by anything you said about yourself.
      </p>
      {surface.evidenceBacked.length === 0 ? (
        <div className="empty">Nothing has met the promotion rules yet.</div>
      ) : (
        <ul className="plain">
          {surface.evidenceBacked.map((m) => <KnowledgeCard key={m.id} m={m} />)}
        </ul>
      )}

      <h2>Behavioral hypotheses</h2>
      <p className="section-hint">
        AVA&apos;s own guesses, in shadow mode. They govern nothing, they never outrank what you
        declared, and they are shown here so you can knock them down.
      </p>
      {surface.hypotheses.length === 0 ? (
        <div className="empty">AVA is not guessing anything about you right now.</div>
      ) : (
        <ul className="plain">
          {surface.hypotheses.map((h) => <HypothesisCard key={h.id} h={h} />)}
        </ul>
      )}

      <h2>Uncertain</h2>
      <p className="section-hint">
        Recorded, but not strong enough to be stated as settled.
      </p>
      {surface.uncertain.length === 0 ? (
        <div className="empty">Nothing is sitting in an uncertain state.</div>
      ) : (
        <ul className="plain">
          {surface.uncertain.map((m) => (
            <li key={m.id} className="card section-uncertain">
              <div><span className="authority none">uncertain — not enough to assert</span></div>
              <p style={{ margin: '6px 0' }}>{m.title}</p>
              <span className="tag strong">{m.strength}</span>
              <div className="meta mono" style={{ marginTop: 6 }}>
                evidence {m.derivedFromEvidenceIds.join(', ')}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Superseded</h2>
      <p className="section-hint">
        What you used to think. Kept readable, never presented as current.
      </p>
      {surface.superseded.length === 0 ? (
        <div className="empty">Nothing has been replaced yet.</div>
      ) : (
        <ul className="plain">
          {surface.superseded.map((c) => (
            <DeclarationCard key={c.id} c={c} editable={false} />
          ))}
        </ul>
      )}
    </>
  )
}
