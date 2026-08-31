'use client'

import { useActionState } from 'react'
import {
  ARTIFACT_VERDICTS, DELIVERY_VERDICTS, EPISTEMIC_VERDICTS, OUTCOME_STATES, USER_ACTION_KINDS,
} from '@ava/core'
import { actionAction, feedbackAction, outcomeAction } from './feedback-actions'

const label = (v: string): string => v.replace(/_/g, ' ')

/**
 * Two questions, asked separately because they have different answers.
 *
 * "Was AVA right?" and "did this deserve my attention?" come apart constantly
 * — correct and already known is the ordinary case — so the form keeps them
 * apart rather than asking for one overall rating.
 *
 * Every field defaults to blank. Not answering is a valid state and is
 * recorded as NOT PROVIDED, never as a negative.
 */
export function FeedbackForm({
  targetId, workstreamId, targetType = 'opportunity', withArtifact = false,
  correctsFeedbackId = null,
}: {
  targetId: string
  workstreamId: string
  targetType?: 'opportunity' | 'prepared_artifact' | 'grounded_answer'
  withArtifact?: boolean
  correctsFeedbackId?: string | null
}) {
  const [state, action, pending] = useActionState(feedbackAction, null)
  const id = (s: string) => `${s}-${targetId}`

  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="workstreamId" value={workstreamId} />
      {correctsFeedbackId && (
        <input type="hidden" name="correctsFeedbackId" value={correctsFeedbackId} />
      )}

      <label htmlFor={id('epistemic')}>Was this correct?</label>
      <select id={id('epistemic')} name="epistemic" defaultValue="not_provided">
        <option value="not_provided">— not answered —</option>
        {EPISTEMIC_VERDICTS.map((v) => <option key={v} value={v}>{label(v)}</option>)}
      </select>

      <label htmlFor={id('delivery')}>Was this useful, now?</label>
      <select id={id('delivery')} name="delivery" defaultValue="not_provided">
        <option value="not_provided">— not answered —</option>
        {DELIVERY_VERDICTS.map((v) => <option key={v} value={v}>{label(v)}</option>)}
      </select>

      {withArtifact && (
        <>
          <label htmlFor={id('artifact')}>What happened to what AVA prepared?</label>
          <select id={id('artifact')} name="artifact" defaultValue="not_provided">
            <option value="not_provided">— not answered —</option>
            {ARTIFACT_VERDICTS.map((v) => <option key={v} value={v}>{label(v)}</option>)}
          </select>
        </>
      )}

      <label htmlFor={id('reason')}>Note (optional, stays on this machine)</label>
      <input id={id('reason')} name="reason" />

      <div className="actions">
        <button type="submit" disabled={pending}>
          {correctsFeedbackId ? 'Correct my earlier answer' : 'Record'}
        </button>
      </div>
      <p className="meta" style={{ marginTop: 4 }}>
        The two questions are independent, and answering neither is fine.
      </p>
      {state?.message && <p className="meta">{state.message}</p>}
    </form>
  )
}

/** What the user DID. Separate from what they thought about it. */
export function ActionForm({
  opportunityId, workstreamId,
}: { opportunityId: string; workstreamId: string }) {
  const [state, action, pending] = useActionState(actionAction, null)
  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="workstreamId" value={workstreamId} />
      <label htmlFor={`act-${opportunityId}`}>Did you do something about this?</label>
      <select id={`act-${opportunityId}`} name="kind" defaultValue="reviewed">
        {USER_ACTION_KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
      </select>
      <label htmlFor={`actd-${opportunityId}`}>What, briefly (optional)</label>
      <input id={`actd-${opportunityId}`} name="description" />
      <div className="actions">
        <button type="submit" disabled={pending}>Record what I did</button>
      </div>
      {state?.message && <p className="meta">{state.message}</p>}
    </form>
  )
}

/**
 * Outcome. Four states, and `unresolved` is a real answer rather than a
 * placeholder — AVA never fills it in because time passed.
 */
export function OutcomeForm({
  opportunityId, workstreamId,
}: { opportunityId: string; workstreamId: string }) {
  const [state, action, pending] = useActionState(outcomeAction, null)
  return (
    <form action={action} style={{ marginTop: 10 }}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="workstreamId" value={workstreamId} />
      <label htmlFor={`out-${opportunityId}`}>How did this end?</label>
      <select id={`out-${opportunityId}`} name="state" defaultValue="unresolved">
        {OUTCOME_STATES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      <label htmlFor={`outn-${opportunityId}`}>Note (optional)</label>
      <input id={`outn-${opportunityId}`} name="note" />
      <div className="actions">
        <button type="submit" disabled={pending}>Record the outcome</button>
      </div>
      <p className="meta" style={{ marginTop: 4 }}>
        Leaving this alone records nothing. AVA does not treat silence as an outcome.
      </p>
      {state?.message && <p className="meta">{state.message}</p>}
    </form>
  )
}
