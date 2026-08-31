import type { ContextHealthState, ContextPacket } from '@ava/core'

/**
 * A DecisionRecord stores a Context Packet, and the proactive path does not
 * build one: opportunity generation reads structured state and declared
 * relations, not retrieved prose.
 *
 * Rather than fabricate retrieval results that never happened, this records an
 * explicitly empty packet whose evidence references are the ones actually
 * used. An audit sees "no retrieval occurred", which is the truth.
 */
export function proactivePacket(input: {
  id: string
  question: string
  health: ContextHealthState
  at: Date
}): ContextPacket {
  return {
    id: input.id,
    question: input.question,
    query: { kind: 'change', terms: [], asOf: input.at, reason: 'proactive generation, not a question' },
    health: { state: input.health, dimensions: [], gaps: [], decidedBy: null },
    retrieved: [], currentState: [], supersededState: [], changes: [],
    conflicts: [], gaps: [], exclusions: [],
    declaredCognition: [], supersededCognition: [], stabilizedKnowledge: [],
    behavioralHypotheses: [],
    providerEligibleEvidenceIds: [],
    builtAt: input.at,
  } as unknown as ContextPacket
}
