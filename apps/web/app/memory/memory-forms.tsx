'use client'

import { useActionState, useState } from 'react'
import { COGNITION_TYPES } from '@ava/core'
import {
  confirmAction, correctAction, declareAction, rejectAction, supersedeAction,
} from '../memory-actions'

/** Scope inputs, shared by declare and correct. */
function ScopeFields({ prefix }: { prefix: string }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="meta">Scope — where this applies (leave blank for everywhere)</summary>
      <div style={{ marginTop: 8 }}>
        <label htmlFor={`${prefix}-workType`}>Work type</label>
        <input id={`${prefix}-workType`} name="workType" placeholder="craft, strategy…" />
        <label htmlFor={`${prefix}-activity`}>Activity</label>
        <input id={`${prefix}-activity`} name="activity" placeholder="benchmark, review…" />
        <label htmlFor={`${prefix}-decisionCategory`}>Decision category</label>
        <input id={`${prefix}-decisionCategory`} name="decisionCategory" placeholder="architecture, pricing…" />
        <label htmlFor={`${prefix}-artifactType`}>Artifact type</label>
        <input id={`${prefix}-artifactType`} name="artifactType" placeholder="deck, spec…" />
      </div>
    </details>
  )
}

export function DeclareForm() {
  const [, action, pending] = useActionState(declareAction, null)
  return (
    <form action={action} className="card section-declared">
      <label htmlFor="decl-content">Tell AVA something about how you work</label>
      <textarea
        id="decl-content" name="content" required disabled={pending} style={{ minHeight: 70 }}
        placeholder="For technical architecture decisions I prefer detailed reasoning."
      />
      <label htmlFor="decl-type">Kind</label>
      <select id="decl-type" name="cognitionType" defaultValue="contextual_preference">
        {COGNITION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
      </select>
      <ScopeFields prefix="decl" />
      <button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Declare'}</button>
    </form>
  )
}

export function CognitionActions({ id, content }: { id: string; content: string }) {
  const [mode, setMode] = useState<'none' | 'correct' | 'contextualize'>('none')
  const [, correct, correcting] = useActionState(correctAction, null)
  const [, supersede, superseding] = useActionState(supersedeAction, null)

  return (
    <>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setMode(mode === 'correct' ? 'none' : 'correct')}>
          Correct
        </button>
        <button type="button" className="secondary" onClick={() => setMode(mode === 'contextualize' ? 'none' : 'contextualize')}>
          Contextualize
        </button>
        <form action={supersede}>
          <input type="hidden" name="cognitionId" value={id} />
          <button type="submit" className="secondary" disabled={superseding}>Supersede</button>
        </form>
      </div>

      {mode !== 'none' && (
        <form action={correct} style={{ marginTop: 10 }}>
          <input type="hidden" name="cognitionId" value={id} />
          <input type="hidden" name="kind" value={mode} />
          <p className="meta" style={{ margin: 0 }}>
            {mode === 'correct'
              ? 'Replaces what you said. The original stays readable.'
              : 'Narrows where it applies. The original stays readable.'}
          </p>
          <label htmlFor={`fix-${id}`}>New wording</label>
          <textarea id={`fix-${id}`} name="content" required defaultValue={content} style={{ minHeight: 60 }} />
          <ScopeFields prefix={`fix-${id}`} />
          <button type="submit" disabled={correcting}>
            {correcting ? 'Recording…' : mode === 'correct' ? 'Record correction' : 'Record context'}
          </button>
        </form>
      )}
    </>
  )
}

export function HypothesisActions({ id, description }: { id: string; description: string }) {
  const [open, setOpen] = useState(false)
  const [, confirm, confirming] = useActionState(confirmAction, null)
  const [, reject, rejecting] = useActionState(rejectAction, null)

  return (
    <>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setOpen(!open)}>Confirm</button>
        <form action={reject}>
          <input type="hidden" name="hypothesisId" value={id} />
          <button type="submit" className="secondary" disabled={rejecting}>Reject</button>
        </form>
      </div>

      {open && (
        <form action={confirm} style={{ marginTop: 10 }}>
          <input type="hidden" name="hypothesisId" value={id} />
          <p className="meta" style={{ margin: 0 }}>
            Confirming turns this into something <strong>you</strong> declared. Write it in your own
            words — AVA&apos;s guess does not become your statement just because it was close.
          </p>
          <label htmlFor={`conf-${id}`}>In your words</label>
          <textarea id={`conf-${id}`} name="content" required placeholder={description} style={{ minHeight: 60 }} />
          <button type="submit" disabled={confirming}>{confirming ? 'Recording…' : 'Declare this'}</button>
        </form>
      )}
    </>
  )
}
