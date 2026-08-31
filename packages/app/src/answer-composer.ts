import type { ContextPacket, GroundedAnswer } from '@ava/core'

/**
 * Deterministic answer composition for MOCK mode.
 *
 * This is NOT a model and does not pretend to be one. It assembles a reply
 * from the Context Packet itself so the whole pipeline — packet, boundary,
 * grounding validation, DecisionRecord, UI — can run offline, in CI, and in
 * the golden scenarios without an API key.
 *
 * Two consequences are recorded everywhere it is used: the execution mode is
 * `mock`, and its output is never evidence about provider quality.
 */
export function composeMockAnswer(packet: ContextPacket): GroundedAnswer {
  const eligible = new Set(packet.providerEligibleEvidenceIds)
  const items = packet.retrieved.filter((r) => eligible.has(r.evidenceId))

  if (items.length === 0) {
    return {
      answer: 'I do not have enough evidence to answer this reliably.',
      evidenceIds: [],
      uncertainties: [...packet.gaps],
      abstained: true,
    }
  }

  const current = items.filter((r) => r.supersededByObjectVersion === null)
  const superseded = items.filter((r) => r.supersededByObjectVersion !== null)
  const lines: string[] = []

  switch (packet.query.kind) {
    case 'change': {
      if (packet.changes.length === 0) {
        lines.push('No change has been recorded in this project yet.')
      } else {
        lines.push('Recorded changes, most recent first:')
        for (const c of packet.changes.slice(0, 6)) {
          lines.push(`- ${c.changeType} on object ${c.objectId}, observed ${iso(c.observedAt)}` +
            (c.changedFields.length > 0 ? ` (fields: ${c.changedFields.join(', ')})` : ''))
        }
      }
      break
    }
    case 'decision': {
      const decisions = packet.currentState.filter((s) => s.type === 'decision')
      const past = packet.supersededState.filter((s) => s.type === 'decision')
      if (decisions.length === 0 && past.length === 0) {
        lines.push('No decision has been recorded in this project.')
        break
      }
      if (packet.query.wantsHistory && past.length > 0) {
        lines.push('Earlier decisions, since replaced:')
        for (const d of past) lines.push(`- ${d.title} (v${d.version}, replaced)`)
      }
      if (decisions.length > 0) {
        lines.push('Current decisions:')
        for (const d of decisions) lines.push(`- ${d.title} (v${d.version})`)
      }
      if (!packet.query.wantsHistory && past.length > 0) {
        lines.push(`Replaced along the way: ${past.map((d) => d.title).join('; ')}`)
      }
      break
    }
    case 'unresolved': {
      const open = packet.currentState.filter(
        (s) => s.type === 'question' && (s.status === 'open' || s.status === 'reopened'),
      )
      if (open.length === 0) lines.push('No question is currently recorded as open.')
      else {
        lines.push('Still unresolved:')
        for (const q of open) lines.push(`- ${q.title} (${q.status})`)
      }
      break
    }
    case 'uncertainty': {
      lines.push(packet.gaps.length === 0 && packet.conflicts.length === 0
        ? 'I have no unresolved conflict or named gap for this project.'
        : 'What I am unsure about:')
      break
    }
    default: {
      lines.push('Based on the evidence I hold:')
      for (const r of current.slice(0, 5)) {
        lines.push(`- ${r.title ?? r.captureType}: ${firstLine(r.excerpt)} [${r.evidenceId}]`)
      }
      if (superseded.length > 0) {
        lines.push(`Superseded, kept for history: ${superseded.map((r) => r.evidenceId).join(', ')}`)
      }
    }
  }

  const uncertainties = [...packet.conflicts, ...packet.gaps]

  return {
    answer: lines.join('\n'),
    // Cites everything the composition actually drew on, and nothing else.
    evidenceIds: items.map((r) => r.evidenceId),
    uncertainties,
    abstained: false,
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

function firstLine(s: string): string {
  const line = s.split('\n')[0] ?? s
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}
