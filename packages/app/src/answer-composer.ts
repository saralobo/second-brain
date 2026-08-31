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

  // Personal questions are answered from cognition, not from work evidence.
  // They are handled first and separately: answering "what do I prefer" out of
  // the evidence ledger would report behaviour as if it were a statement.
  if (packet.query.kind === 'personal') return composePersonalAnswer(packet)

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

/**
 * The language contract in code (Slice 4 brief §20).
 *
 * A declaration may be reported as something the user said. A hypothesis may
 * only be reported as a guess, and the sentence has to say so — otherwise the
 * user reads AVA's inference in her own voice and has no way to tell which of
 * her stated preferences she never stated.
 */
function composePersonalAnswer(packet: ContextPacket): GroundedAnswer {
  const lines: string[] = []
  const cited: string[] = []

  if (packet.declaredCognition.length > 0) {
    lines.push('What you explicitly told me:')
    for (const c of packet.declaredCognition) {
      lines.push(`- ${c.content} (${c.cognitionType}; applies to ${c.scopeDescription})`)
      cited.push(c.cognitionId)
    }
  }

  if (packet.stabilizedKnowledge.length > 0) {
    lines.push('', 'Supported by evidence, not by anything you stated:')
    for (const k of packet.stabilizedKnowledge) {
      lines.push(`- ${k.title} (${k.strength})`)
      cited.push(k.memoryRecordId)
    }
  }

  if (packet.behavioralHypotheses.length > 0) {
    lines.push('', 'Things I am only guessing about — you have not told me these:')
    for (const h of packet.behavioralHypotheses) {
      lines.push(`- I have a hypothesis that ${h.falsifiableDescription}`)
      lines.push(`  observed in ${h.context}; alternatives available: ${h.alternativesAvailable.join(', ') || 'none recorded'}`)
      cited.push(h.hypothesisId)
    }
  }

  if (packet.supersededCognition.length > 0) {
    lines.push('', 'You have since replaced:')
    for (const c of packet.supersededCognition) {
      lines.push(`- ${c.content} (${c.matchReason})`)
    }
  }

  if (cited.length === 0) {
    return {
      answer: 'You have not told me anything that applies here, and I am not going to guess.',
      evidenceIds: [],
      uncertainties: [...packet.gaps],
      abstained: true,
    }
  }

  return {
    answer: lines.join('\n'),
    evidenceIds: cited,
    uncertainties: [...packet.conflicts, ...packet.gaps],
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
