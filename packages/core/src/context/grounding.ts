import type { ContextPacket } from './packet'

/**
 * The grounded answer contract (Slice 3 brief §10).
 *
 * The model may return exactly this shape and nothing more. Extra fields are
 * dropped rather than trusted.
 */
export interface GroundedAnswer {
  answer: string
  evidenceIds: string[]
  uncertainties: string[]
  abstained: boolean
}

/** Parses an untyped provider response. Returns null when the shape is wrong. */
export function parseGroundedAnswer(v: unknown): GroundedAnswer | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>

  if (typeof o.answer !== 'string' || o.answer.trim() === '') return null
  if (typeof o.abstained !== 'boolean') return null
  if (!isStringArray(o.evidence_ids ?? o.evidenceIds)) return null
  if (!isStringArray(o.uncertainties)) return null

  return {
    answer: o.answer.trim(),
    evidenceIds: [...((o.evidence_ids ?? o.evidenceIds) as string[])],
    uncertainties: [...(o.uncertainties as string[])],
    abstained: o.abstained,
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export type GroundingFailure =
  | 'unknown_evidence_id'
  | 'evidence_not_in_packet'
  | 'assertion_without_evidence'
  | 'abstention_inconsistent'
  | 'fabricated_citation_marker'

export interface GroundingVerdict {
  valid: boolean
  failures: readonly { kind: GroundingFailure; detail: string }[]
  /** Ids that survived validation and may be shown as references. */
  acceptedEvidenceIds: readonly string[]
}

/**
 * Local grounding validation (Slice 3 brief §11).
 *
 * Runs AFTER generation and independently of it. A structurally valid
 * response is not a grounded one: schema conformance says the shape is right,
 * not that the content is supported. Everything checked here is checked
 * against the packet we built, never against the model's own account.
 */
export function validateGrounding(
  answer: GroundedAnswer,
  packet: ContextPacket,
): GroundingVerdict {
  const failures: { kind: GroundingFailure; detail: string }[] = []
  const eligible = new Set(packet.providerEligibleEvidenceIds)
  const known = new Set(packet.retrieved.map((r) => r.evidenceId))

  const accepted: string[] = []
  for (const id of answer.evidenceIds) {
    if (!known.has(id)) {
      // The id does not exist in anything AVA retrieved: invented.
      failures.push({ kind: 'unknown_evidence_id', detail: `cited ${id}, which was never retrieved` })
      continue
    }
    if (!eligible.has(id)) {
      failures.push({
        kind: 'evidence_not_in_packet',
        detail: `cited ${id}, which was retrieved but withheld from the provider`,
      })
      continue
    }
    accepted.push(id)
  }

  if (answer.abstained) {
    // An abstention that also asserts something is not an abstention.
    if (answer.evidenceIds.length > 0 && accepted.length === 0 && failures.length === 0) {
      failures.push({ kind: 'abstention_inconsistent', detail: 'abstained while citing evidence' })
    }
  } else if (accepted.length === 0) {
    // A non-abstaining answer with no valid citation is exactly the failure
    // mode this whole slice exists to prevent.
    failures.push({
      kind: 'assertion_without_evidence',
      detail: 'answer asserts something but cites no evidence present in the Context Packet',
    })
  }

  // Bracketed ids in the prose that were never declared: a citation the model
  // wrote but did not stand behind.
  for (const m of answer.answer.matchAll(/\[([0-9A-HJKMNP-TV-Z]{26})\]/g)) {
    const id = m[1]!
    if (!answer.evidenceIds.includes(id)) {
      failures.push({
        kind: 'fabricated_citation_marker',
        detail: `prose cites ${id}, which is absent from evidence_ids`,
      })
    }
  }

  return { valid: failures.length === 0, failures, acceptedEvidenceIds: accepted }
}
