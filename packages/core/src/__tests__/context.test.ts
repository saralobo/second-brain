import { describe, expect, it } from 'vitest'
import { aggregateHealth, classifyQuery, gatesFor, parseGroundedAnswer, validateGrounding } from '../index'
import type { ContextPacket, HealthDimension, RetrievalResult } from '../index'

function dim(
  id: HealthDimension['id'], verdict: HealthDimension['verdict'], material = true,
): HealthDimension {
  return { id, verdict, detail: `${id}=${verdict}`, material }
}

describe('query classification', () => {
  it('recognises the six supported question shapes', () => {
    expect(classifyQuery('What do you know about Project X?').kind).toBe('state')
    expect(classifyQuery('What changed in Project X?').kind).toBe('change')
    expect(classifyQuery('What decisions did I make about X?').kind).toBe('decision')
    expect(classifyQuery('What is still unresolved?').kind).toBe('unresolved')
    expect(classifyQuery('Show me the evidence for that.').kind).toBe('evidence')
    expect(classifyQuery('What are you unsure about?').kind).toBe('uncertainty')
  })

  it('falls back to unknown instead of guessing', () => {
    const q = classifyQuery('zqx frobnicate')
    expect(q.kind).toBe('unknown')
    expect(q.reason).toContain('no supported question shape')
  })

  it('strips the words that describe the question from the search terms', () => {
    // "changed" is the request type, not the subject. Searching for it would
    // match nothing and produce a false INSUFFICIENT.
    const q = classifyQuery('What changed about the billing schedule?')
    expect(q.terms).toContain('billing')
    expect(q.terms).toContain('schedule')
    expect(q.terms).not.toContain('changed')
  })

  it('detects a question about the past', () => {
    expect(classifyQuery('What was the previous decision?').wantsHistory).toBe(true)
    expect(classifyQuery('What is the current decision?').wantsHistory).toBe(false)
  })
})

describe('context health aggregation', () => {
  it('is healthy when every material dimension is ok', () => {
    const r = aggregateHealth([dim('expected_sources_available', 'ok'), dim('source_freshness', 'ok')])
    expect(r.state).toBe('HEALTHY')
    expect(r.gaps).toHaveLength(0)
  })

  it('takes the worst material dimension', () => {
    const r = aggregateHealth([
      dim('expected_sources_available', 'degraded'),
      dim('permission_blocked_coverage', 'insufficient'),
    ])
    expect(r.state).toBe('INSUFFICIENT')
    expect(r.decidedBy).toBe('permission_blocked_coverage')
    expect(r.gaps).toHaveLength(2)
  })

  it('ignores immaterial dimensions in the aggregate but still reports them', () => {
    const r = aggregateHealth([
      dim('expected_sources_available', 'ok'),
      dim('source_freshness', 'insufficient', false),
    ])
    expect(r.state).toBe('HEALTHY')
    expect(r.gaps).toHaveLength(0)
    expect(r.dimensions).toHaveLength(2)
  })

  it('does not treat not_applicable as healthy evidence', () => {
    const r = aggregateHealth([dim('temporal_coverage', 'not_applicable')])
    expect(r.state).toBe('HEALTHY')
    // It contributes nothing either way — and it is still visible.
    expect(r.dimensions[0]!.verdict).toBe('not_applicable')
  })
})

describe('downstream gates', () => {
  it('lets a healthy context do everything', () => {
    expect(gatesFor('HEALTHY')).toEqual({
      mayAssert: true, mayPromote: true, mayPrepare: true, mustShowGaps: false, mustAbstain: false,
    })
  })

  it('blocks preparation and promotion when degraded, without blocking the answer', () => {
    const g = gatesFor('DEGRADED')
    expect(g.mayAssert).toBe(true)
    expect(g.mayPrepare).toBe(false)
    expect(g.mayPromote).toBe(false)
    expect(g.mustShowGaps).toBe(true)
  })

  it('forces abstention when insufficient', () => {
    const g = gatesFor('INSUFFICIENT')
    expect(g.mustAbstain).toBe(true)
    expect(g.mayAssert).toBe(false)
  })
})

describe('grounded answer parsing', () => {
  it('accepts the contract shape', () => {
    const v = parseGroundedAnswer({
      answer: 'yes', evidence_ids: ['A'], uncertainties: [], abstained: false,
    })
    expect(v).toEqual({ answer: 'yes', evidenceIds: ['A'], uncertainties: [], abstained: false })
  })

  it('rejects a missing or malformed field rather than defaulting it', () => {
    expect(parseGroundedAnswer({ answer: 'x', evidence_ids: ['A'], uncertainties: [] })).toBeNull()
    expect(parseGroundedAnswer({ answer: '', evidence_ids: [], uncertainties: [], abstained: false })).toBeNull()
    expect(parseGroundedAnswer({ answer: 'x', evidence_ids: 'A', uncertainties: [], abstained: false })).toBeNull()
    expect(parseGroundedAnswer(null)).toBeNull()
  })
})

const ID_A = '01AAAAAAAAAAAAAAAAAAAAAAAA'
const ID_B = '01BBBBBBBBBBBBBBBBBBBBBBBB'
const ID_C = '01CCCCCCCCCCCCCCCCCCCCCCCC'

function packetWith(eligible: string[], retrieved: string[]): ContextPacket {
  return {
    id: 'P', question: 'q',
    query: { kind: 'state', terms: [], wantsHistory: false, reason: 'test' },
    workstreamId: 'W', builtAt: new Date(),
    retrieved: retrieved.map((id) => ({ evidenceId: id } as RetrievalResult)),
    currentState: [], supersededState: [], changes: [], conflicts: [], gaps: [],
    declaredCognition: [], supersededCognition: [], stabilizedKnowledge: [],
    behavioralHypotheses: [],
    health: { state: 'HEALTHY', dimensions: [], gaps: [], decidedBy: null },
    exclusions: [],
    providerEligibleEvidenceIds: eligible,
  }
}

describe('grounding validation', () => {
  it('accepts an answer citing evidence that was in the packet', () => {
    const v = validateGrounding(
      { answer: 'a', evidenceIds: [ID_A], uncertainties: [], abstained: false },
      packetWith([ID_A], [ID_A]))
    expect(v.valid).toBe(true)
    expect(v.acceptedEvidenceIds).toEqual([ID_A])
  })

  it('rejects a citation that was never retrieved', () => {
    const v = validateGrounding(
      { answer: 'a', evidenceIds: [ID_B], uncertainties: [], abstained: false },
      packetWith([ID_A], [ID_A]))
    expect(v.valid).toBe(false)
    expect(v.failures[0]!.kind).toBe('unknown_evidence_id')
  })

  it('rejects a citation of evidence that was withheld from the provider', () => {
    const v = validateGrounding(
      { answer: 'a', evidenceIds: [ID_C], uncertainties: [], abstained: false },
      packetWith([ID_A], [ID_A, ID_C]))
    expect(v.valid).toBe(false)
    expect(v.failures.map((f) => f.kind)).toContain('evidence_not_in_packet')
  })

  it('rejects an assertion with no evidence at all', () => {
    const v = validateGrounding(
      { answer: 'the deadline is March', evidenceIds: [], uncertainties: [], abstained: false },
      packetWith([ID_A], [ID_A]))
    expect(v.valid).toBe(false)
    expect(v.failures[0]!.kind).toBe('assertion_without_evidence')
  })

  it('allows an abstention to cite nothing', () => {
    const v = validateGrounding(
      { answer: 'I cannot answer that', evidenceIds: [], uncertainties: ['no source'], abstained: true },
      packetWith([], []))
    expect(v.valid).toBe(true)
  })

  it('catches a citation marker in the prose that was never declared', () => {
    const v = validateGrounding(
      { answer: `we decided X [${ID_B}]`, evidenceIds: [ID_A], uncertainties: [], abstained: false },
      packetWith([ID_A], [ID_A]))
    expect(v.valid).toBe(false)
    expect(v.failures.map((f) => f.kind)).toContain('fabricated_citation_marker')
  })

  it('does not treat a structurally valid response as grounded', () => {
    // The shape is perfect. The content cites nothing that exists.
    const parsed = parseGroundedAnswer({
      answer: 'The migration finished last week.',
      evidence_ids: [ID_B], uncertainties: [], abstained: false,
    })
    expect(parsed).not.toBeNull()
    expect(validateGrounding(parsed!, packetWith([ID_A], [ID_A])).valid).toBe(false)
  })
})
