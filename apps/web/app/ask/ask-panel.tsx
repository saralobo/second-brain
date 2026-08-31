'use client'

import { useState } from 'react'
import { AvaCore, CoreStateLabel } from '../_core/ava-core'
import type { CoreState } from '../_core/ava-core'
import { commitAction, turnAction } from '../turn-actions'
import type { PendingWrite, TurnOutcome } from '@ava/app'

interface Turn {
  who: 'you' | 'ava'
  text: string
  decisionRecordId?: string | null
  evidenceCount?: number
  health?: string
}

/**
 * The written conversation. Same pipeline as Live, same confirmation rules,
 * same refusals — only the transport differs.
 */
export function AskPanel({ workstreams }: { workstreams: { id: string; name: string }[] }) {
  const [scope, setScope] = useState<string>('')
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [pending, setPending] = useState<PendingWrite | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastDr, setLastDr] = useState<string | null>(null)

  const state: CoreState = busy ? 'processing' : 'idle'

  const receive = (outcome: TurnOutcome): void => {
    if (outcome.kind === 'answer') {
      setLastDr(outcome.decisionRecordId)
      setTurns((t) => [...t, {
        who: 'ava', text: outcome.text, decisionRecordId: outcome.decisionRecordId,
        evidenceCount: outcome.evidenceCount, health: outcome.contextHealth,
      }])
      return
    }
    if (outcome.kind === 'confirm' || outcome.kind === 'needs_time') {
      setPending(outcome.pending)
    } else {
      setPending(null)
    }
    setTurns((t) => [...t, { who: 'ava', text: outcome.text }])
  }

  const send = async (value: string, observedAt: string | null = null): Promise<void> => {
    const sentence = value.trim()
    if (sentence === '' || busy) return
    setTurns((t) => [...t, { who: 'you', text: sentence }])
    setText('')
    setBusy(true)
    try {
      receive(await turnAction({
        text: sentence,
        workstreamId: scope === '' ? null : scope,
        lastDecisionRecordId: lastDr,
        observedAt,
      }))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (): Promise<void> => {
    if (pending === null) return
    setBusy(true)
    try {
      const outcome = await commitAction(pending)
      setPending(null)
      setTurns((t) => [...t, { who: 'ava', text: outcome.text }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
        <AvaCore state={state} size={92} />
        <div style={{ flex: 1 }}>
          <label htmlFor="scope">Scope</label>
          <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Global — what I know about you, and what needs attention</option>
            {workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <CoreStateLabel state={state} />
        </div>
      </div>

      <div className="transcript" style={{ marginTop: 0 }}>
        {turns.length === 0 && (
          <div className="empty">
            Ask me what needs your attention, what changed, or what I know about how you work.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.who === 'ava' ? 'ava' : ''}`}>
            <span className="who">{t.who === 'ava' ? 'AVA' : 'You'}</span>
            <p style={{ whiteSpace: 'pre-wrap' }}>{t.text}</p>
            {t.who === 'ava' && t.decisionRecordId && (
              <div className="meta" style={{ marginTop: 6 }}>
                {t.evidenceCount !== undefined && (
                  <span className="tag">
                    {t.evidenceCount} {t.evidenceCount === 1 ? 'source' : 'sources'}
                  </span>
                )}
                {t.health !== undefined && t.health !== 'HEALTHY' && (
                  <span className="tag change">context {t.health}</span>
                )}
                <a href={`/why/${t.decisionRecordId}`}>Why</a>
              </div>
            )}
          </div>
        ))}
      </div>

      {pending !== null && (
        <div className="confirm-box">
          <p style={{ margin: 0 }}>{pending.confirmation}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={confirm} disabled={busy}>
              Confirm
            </button>
            <button type="button" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); void send(text) }}
        style={{ marginTop: 18 }}
      >
        <label htmlFor="ask-input">Say something to AVA</label>
        <input
          id="ask-input" name="text" value={text} autoComplete="off"
          onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder="What needs my attention today?"
        />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || text.trim() === ''}>
            Send
          </button>
          <a href="/live" className="meta">or talk to her</a>
        </div>
      </form>
    </>
  )
}
