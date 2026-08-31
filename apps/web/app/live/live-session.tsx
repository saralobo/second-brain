'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AvaCore, CoreStateLabel } from '../_core/ava-core'
import type { CoreState } from '../_core/ava-core'
import { commitAction, turnAction } from '../turn-actions'
import { createListener, createSpeaker, speechRecognitionAvailable } from './speech'
import type { Listener, Speaker } from './speech'
import type { PendingWrite, TurnOutcome } from '@ava/app'

const CONSENT_KEY = 'ava.live.consent.v1'

interface Turn {
  who: 'you' | 'ava'
  text: string
  interim?: boolean
  interrupted?: boolean
  decisionRecordId?: string | null
  evidenceCount?: number
  health?: string
}

/**
 * The Live session.
 *
 * Listening → processing → speaking → listening, with the boundaries made as
 * thin as the transport allows. AVA returns to listening the moment she stops
 * speaking, so continuing the conversation costs nothing: the second question
 * needs no click.
 *
 * What this is NOT, stated plainly: full-duplex barge-in. The user interrupts
 * by acting — clicking the Core or pressing Escape — not by talking over her.
 * The microphone is closed while AVA speaks, which is what stops her own voice
 * from being transcribed as input.
 */
export function LiveSession({ workstreams }: { workstreams: { id: string; name: string }[] }) {
  // Defaults to NOT consented, so the disclosure is server-rendered and cannot
  // be missed if JavaScript is slow or disabled. Stored consent upgrades it.
  const [consented, setConsented] = useState(false)
  const [active, setActive] = useState(false)
  const [state, setState] = useState<CoreState>('idle')
  const [amplitude, setAmplitude] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [interim, setInterim] = useState('')
  const [scope, setScope] = useState('')
  const [pending, setPending] = useState<PendingWrite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  const listenerRef = useRef<Listener | null>(null)
  const speakerRef = useRef<Speaker | null>(null)
  const lastDrRef = useRef<string | null>(null)
  const pendingRef = useRef<PendingWrite | null>(null)
  const scopeRef = useRef('')
  const busyRef = useRef(false)

  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => { scopeRef.current = scope }, [scope])

  useEffect(() => {
    setSupported(speechRecognitionAvailable())
    speakerRef.current = createSpeaker()
    try {
      if (window.localStorage.getItem(CONSENT_KEY) === 'yes') setConsented(true)
    } catch { /* no storage: stay un-consented, which is the safe direction */ }
  }, [])

  const say = useCallback(async (text: string): Promise<void> => {
    const speaker = speakerRef.current
    if (speaker === null || !speaker.available) return
    setState('speaking')
    await speaker.speak(text, setAmplitude)
  }, [])

  /** Yes / no, spoken. Only ever consulted while a write is awaiting confirmation. */
  const affirmative = (t: string): boolean => /^\s*(yes|yeah|yep|confirm|confirmed|do it|go ahead)\b/i.test(t)
  const negative = (t: string): boolean => /^\s*(no|nope|cancel|stop|don'?t|never mind)\b/i.test(t)

  const handleOutcome = useCallback(async (outcome: TurnOutcome): Promise<void> => {
    if (outcome.kind === 'answer') {
      lastDrRef.current = outcome.decisionRecordId
      setTurns((t) => [...t, {
        who: 'ava', text: outcome.text, decisionRecordId: outcome.decisionRecordId,
        evidenceCount: outcome.evidenceCount, health: outcome.contextHealth,
      }])
      setPending(null)
    } else if (outcome.kind === 'confirm' || outcome.kind === 'needs_time') {
      setPending(outcome.pending)
      setTurns((t) => [...t, { who: 'ava', text: outcome.text }])
    } else if (outcome.kind === 'why') {
      setPending(null)
      setTurns((t) => [...t, { who: 'ava', text: outcome.text, decisionRecordId: outcome.decisionRecordId }])
    } else {
      setPending(null)
      setTurns((t) => [...t, { who: 'ava', text: outcome.text }])
    }
    await say(outcome.text)
  }, [say])

  const submit = useCallback(async (sentence: string): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setTurns((t) => [...t, { who: 'you', text: sentence }])
    setInterim('')
    setState('processing')
    setAmplitude(0)
    try {
      const waiting = pendingRef.current

      // While a write is awaiting confirmation, "yes" and "no" mean exactly
      // that. Anything else is treated as a new turn and the pending write is
      // dropped rather than silently confirmed.
      if (waiting !== null && affirmative(sentence)) {
        await handleOutcome(await commitAction(waiting))
        return
      }
      if (waiting !== null && negative(sentence)) {
        setPending(null)
        await handleOutcome({ kind: 'clarify', text: 'Cancelled. Nothing was recorded.' })
        return
      }
      // Answering "when did that happen?" completes a pending write.
      if (waiting !== null && waiting.observedAt === null && waiting.utterance.impliesPast) {
        await handleOutcome(await turnAction({
          text: waiting.utterance.payload,
          workstreamId: waiting.workstreamId,
          lastDecisionRecordId: lastDrRef.current,
          observedAt: resolveSpokenDate(sentence),
        }))
        return
      }

      await handleOutcome(await turnAction({
        text: sentence,
        workstreamId: scopeRef.current === '' ? null : scopeRef.current,
        lastDecisionRecordId: lastDrRef.current,
        observedAt: null,
      }))
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Something failed while answering.')
      return
    } finally {
      busyRef.current = false
    }
    // Straight back to listening: continuing the conversation costs no click.
    setState('listening')
    listenerRef.current?.start()
  }, [handleOutcome])

  const start = useCallback((): void => {
    if (!supported) return
    setError(null)
    setActive(true)
    setState('listening')
    const listener = createListener({
      onInterim: setInterim,
      onFinal: (text) => {
        listenerRef.current?.stop()
        void submit(text)
      },
      onEnergy: setAmplitude,
      onError: (message) => { setError(message); setState('error'); setActive(false) },
      onEnd: () => { /* restarted explicitly after each turn */ },
    })
    listenerRef.current = listener
    listener?.start()
  }, [submit, supported])

  const stop = useCallback((): void => {
    listenerRef.current?.stop()
    speakerRef.current?.cancel()
    listenerRef.current = null
    setActive(false)
    setState('idle')
    setAmplitude(0)
    setInterim('')
  }, [])

  /**
   * Interruption. Not acoustic barge-in — the user acts, and AVA stops
   * immediately. The partial answer stays in the transcript marked
   * interrupted, because a partly delivered answer is not a delivered one.
   */
  const interrupt = useCallback((): void => {
    speakerRef.current?.cancel()
    setAmplitude(0)
    setTurns((t) => {
      const copy = [...t]
      for (let i = copy.length - 1; i >= 0; i--) {
        const turn = copy[i]
        if (turn !== undefined && turn.who === 'ava') { copy[i] = { ...turn, interrupted: true }; break }
      }
      return copy
    })
    setState('listening')
    listenerRef.current?.start()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && active) {
        if (state === 'speaking') interrupt()
        else stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, state, interrupt, stop])

  useEffect(() => () => {
    listenerRef.current?.stop()
    speakerRef.current?.cancel()
  }, [])

  // ---- Consent gate (ADR-24) --------------------------------------------
  if (!consented) {
    return (
      <>
        <h1>Live</h1>
        <div className="card" style={{ marginTop: 18 }}>
          <h3>Before we talk</h3>
          <p className="meta" style={{ marginTop: 8 }}>
            Speech recognition is done by your browser. <strong>In most browsers the audio is
            sent to the browser vendor to be transcribed</strong> — that part is not local, and I
            cannot change it. Everything else stays on this machine: my answers, your evidence,
            your memory, and my voice, which uses the voices installed on this computer and makes
            no network request.
          </p>
          <p className="meta">
            While I am listening, anything audible in the room is captured — including other
            people. I cannot tell who is speaking, and I will not claim to.
          </p>
          <p className="meta">
            You can withdraw this at any time by clearing it below.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => {
              try { window.localStorage.setItem(CONSENT_KEY, 'yes') } catch { /* ignore */ }
              setConsented(true)
            }}>I understand — enable Live</button>
            <a href="/ask" className="meta">Use writing instead</a>
          </div>
        </div>
        <div style={{ marginTop: 16, maxWidth: 520 }}>
          <label htmlFor="live-scope-preview">Scope, once we start</label>
          <select id="live-scope-preview" value={scope}
            onChange={(e) => setScope(e.target.value)}>
            <option value="">Global — attention across everything, and what I know about you</option>
            {workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </>
    )
  }

  const micOn = active && state === 'listening'

  return (
    <>
      <div className="live-stage">
        <AvaCore
          state={state}
          amplitude={amplitude}
          size={300}
          onActivate={active ? (state === 'speaking' ? interrupt : stop) : start}
          activateLabel={active ? (state === 'speaking' ? 'Interrupt AVA' : 'End the session') : 'Start talking to AVA'}
        />
        <CoreStateLabel state={state} />

        <div className="mic-indicator" data-on={micOn ? 'true' : 'false'}>
          <span className="mic-dot" aria-hidden="true" />
          {micOn ? 'Microphone on' : 'Microphone off'}
        </div>

        {!supported && (
          <div className="notice" style={{ marginTop: 18, maxWidth: 620 }}>
            This browser has no speech recognition. <a href="/ask">Ask in writing</a> instead —
            same answers, same evidence.
          </div>
        )}

        {error !== null && (
          <div className="error" style={{ marginTop: 18, maxWidth: 620 }} role="alert">
            {error}
          </div>
        )}

        <div className="actions" style={{ justifyContent: 'center' }}>
          {!active
            ? <button type="button" className="primary" onClick={start} disabled={!supported}>
                Start listening
              </button>
            : <>
                {state === 'speaking' && (
                  <button type="button" onClick={interrupt}>Interrupt</button>
                )}
                <button type="button" onClick={stop}>End session</button>
              </>}
        </div>

        <div style={{ marginTop: 16, width: '100%', maxWidth: 520 }}>
          <label htmlFor="live-scope">Scope</label>
          <select id="live-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Global — attention across everything, and what I know about you</option>
            {workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {pending !== null && (
        <div className="confirm-box" style={{ maxWidth: 720, margin: '18px auto 0' }}>
          <p style={{ margin: 0 }}>{pending.confirmation}</p>
          <p className="meta" style={{ marginTop: 6 }}>Say &ldquo;yes&rdquo;, or confirm here.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { void submit('yes') }}>
              Confirm
            </button>
            <button type="button" onClick={() => { void submit('no') }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="transcript" style={{ margin: '26px auto 0' }}>
        {turns.length === 0 && !active && (
          <div className="empty">
            Press the core and ask me what needs your attention.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.who === 'ava' ? 'ava' : ''} ${t.interrupted ? 'interrupted' : ''}`}>
            <span className="who">{t.who === 'ava' ? 'AVA' : 'You'}</span>
            <p>{t.text}</p>
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
                <a href={`/why/${t.decisionRecordId}`} target="_blank" rel="noreferrer">Why</a>
              </div>
            )}
          </div>
        ))}
        {interim !== '' && (
          <div className="turn interim">
            <span className="who">You</span>
            <p>{interim}</p>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Turns a spoken date into an ISO day.
 *
 * Deliberately narrow. It resolves only what it can resolve unambiguously and
 * returns null otherwise, which sends the question back to the user rather
 * than inventing a timestamp — the whole prospective timeline depends on
 * `observedAt` being real.
 */
function resolveSpokenDate(text: string): string | null {
  const t = text.toLowerCase()
  const day = 86_400_000
  const iso = (offset: number): string => new Date(Date.now() - offset).toISOString()
  if (/\byesterday\b/.test(t)) return iso(day)
  if (/\bthis morning\b|\btoday\b/.test(t)) return iso(0)
  if (/\blast week\b/.test(t)) return iso(7 * day)
  const days = /\b(\d+)\s+days? ago\b/.exec(t)
  if (days !== null) return iso(Number(days[1]) * day)
  return null
}
