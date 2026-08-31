'use client'

import { useActionState } from 'react'
import { askAction } from '../../../chat-actions'

/**
 * The composer.
 *
 * Streaming is deliberately absent (see the Slice 3 checkpoint, D-05 revisit):
 * the answer is buffered, validated against the Context Packet, and only then
 * rendered. A token stream would put unvalidated text on screen that a reader
 * cannot distinguish from a grounded claim — and by the time validation
 * rejects it, it has already been read.
 */
export function ChatForm({ workstreamId, conversationId }: {
  workstreamId: string
  conversationId: string
}) {
  const [, action, pending] = useActionState(askAction, null)

  return (
    <form action={action} className="card">
      <input type="hidden" name="workstreamId" value={workstreamId} />
      <input type="hidden" name="conversationId" value={conversationId} />

      <label htmlFor="q">Ask about this workstream</label>
      <textarea
        id="q" name="question" required disabled={pending}
        style={{ minHeight: 76 }}
        placeholder="What changed in this project?"
      />
      <button type="submit" disabled={pending}>
        {pending ? 'Retrieving evidence…' : 'Ask'}
      </button>
      {pending && (
        <p className="meta" role="status" style={{ marginTop: 10 }}>
          Retrieving, checking context health, and validating the answer against the evidence
          before showing anything.
        </p>
      )}
    </form>
  )
}
