import type { ContentOrigin } from '../primitives/origin'

/**
 * Admissibility rules for forming a Behavioral Hypothesis (S4-T07, S4-T08).
 *
 * Pure and deterministic. A hypothesis that fails any of these is not formed
 * at all — it is not formed and flagged, because a stored hypothesis is
 * already visible to the user as something the system supposes about them.
 */
export type HypothesisRejection =
  | 'no_alternatives'
  | 'third_party_subject'
  | 'system_origin_evidence'
  | 'never_infer_subject'
  | 'trait_claim'
  | 'insufficient_evidence'

export interface HypothesisProposal {
  falsifiableDescription: string
  context: string
  /** Origins of the evidence behind the proposal. */
  evidenceOrigins: readonly ContentOrigin[]
  /** What else was genuinely available when the choice was made. */
  alternativesAvailable: readonly string[]
  /** Subjects the user asked never to be inferred about. */
  neverInferSubjects: readonly string[]
  /** True when the observed behaviour is about someone other than the user. */
  aboutThirdParty: boolean
}

export interface AdmissibilityResult {
  admissible: boolean
  rejections: readonly { kind: HypothesisRejection; detail: string }[]
}

/**
 * Phrasings that turn a situated observation into a personality claim.
 *
 * "In observed situations where X, Y happened often" is admissible.
 * "The user's principle is Y" is not. The difference is the boundary between
 * describing a situation and asserting an essence, and spec §15.2 requires it
 * to live in the schema rather than in the author's good intentions.
 */
const TRAIT_CLAIM = /\b(?:always|never|is the kind of person|personality|as a rule|by nature|generally prefers|has a principle|her principle|his principle|their principle)\b/i

/** A hypothesis must describe where and when it was observed. */
const SITUATED = /\b(?:in|when|during|while|after|observed|across)\b/i

export const MIN_HYPOTHESIS_EVIDENCE = 2

export function assessHypothesis(proposal: HypothesisProposal): AdmissibilityResult {
  const rejections: { kind: HypothesisRejection; detail: string }[] = []

  // Choosing the least bad available option is not a positive preference
  // (baseline §23). Without alternatives, no choice was actually observed.
  if (proposal.alternativesAvailable.length === 0) {
    rejections.push({
      kind: 'no_alternatives',
      detail: 'no alternatives were available, so no preference can be inferred from the choice',
    })
  }

  // AVA models the user's cognition, not other people's. Building a
  // behavioural profile of a third party is out of scope and out of bounds.
  if (proposal.aboutThirdParty) {
    rejections.push({
      kind: 'third_party_subject',
      detail: 'the observed behaviour is about someone else; AVA does not profile third parties',
    })
  }

  const usable = proposal.evidenceOrigins.filter((o) => o !== 'system')
  if (usable.length !== proposal.evidenceOrigins.length) {
    rejections.push({
      kind: 'system_origin_evidence',
      detail: 'AVA-generated content cannot support a hypothesis about the user',
    })
  }
  if (usable.length < MIN_HYPOTHESIS_EVIDENCE) {
    rejections.push({
      kind: 'insufficient_evidence',
      detail: `${usable.length} usable observation(s); ${MIN_HYPOTHESIS_EVIDENCE} required`,
    })
  }

  const haystack = `${proposal.falsifiableDescription} ${proposal.context}`.toLowerCase()
  for (const subject of proposal.neverInferSubjects) {
    const needle = subject.trim().toLowerCase()
    if (needle !== '' && haystack.includes(needle)) {
      rejections.push({
        kind: 'never_infer_subject',
        detail: 'the user asked AVA never to infer anything about this subject',
      })
      break
    }
  }

  if (TRAIT_CLAIM.test(proposal.falsifiableDescription)) {
    rejections.push({
      kind: 'trait_claim',
      detail: 'phrased as a trait rather than a situated observation',
    })
  }
  if (!SITUATED.test(proposal.falsifiableDescription)) {
    rejections.push({
      kind: 'trait_claim',
      detail: 'does not state the situation in which the behaviour was observed',
    })
  }

  return { admissible: rejections.length === 0, rejections }
}
