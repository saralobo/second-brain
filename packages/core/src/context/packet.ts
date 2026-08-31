import type { ContextHealthResult } from './health'
import type { ClassifiedQuery } from './query'
import type { ContentOrigin, Sensitivity } from '../primitives/origin'
import type { EvidenceStrength } from '../primitives/evidence-strength'

/**
 * One retrieval hit, carrying everything an auditor needs (plan §5 of the
 * Slice 3 brief).
 *
 * `score` is a lexical rank. It is NOT a probability that the item is true,
 * and nothing downstream may treat it as one — which is why `strength` and
 * `score` are separate fields that never combine.
 */
export interface RetrievalResult {
  evidenceId: string
  sourceRecordId: string
  workstreamId: string | null
  title: string | null
  /** Trimmed for display and for the packet. The original stays reachable. */
  excerpt: string
  captureType: string
  observedAt: Date
  effectiveAt: Date | null
  contentOrigin: ContentOrigin
  strength: EvidenceStrength
  /** Effective sensitivity, resolved through annotations (F-01). */
  sensitivity: Sensitivity
  /** Whether the state this evidence supports is still current. */
  supersededByObjectVersion: string | null
  score: number
  reason: string
}

/**
 * A declaration carried into the packet.
 *
 * Kept in its OWN list rather than mixed into `retrieved`. A declaration and a
 * piece of work evidence are different kinds of claim with different
 * authority, and a provider that receives them in one undifferentiated block
 * cannot tell "you told me this" from "I noticed this".
 */
export interface PacketCognitionEntry {
  cognitionId: string
  content: string
  cognitionType: string
  scopeDescription: string
  /** Why this declaration applies here — the scope-match reason. */
  matchReason: string
  specificity: number
  declaredAt: Date
  origin: string
  evidenceIds: readonly string[]
  authority: 'DECLARED' | 'CONFIRMED'
}

/** Stabilized semantic knowledge: promoted, still pointing at its evidence. */
export interface PacketKnowledgeEntry {
  memoryRecordId: string
  title: string
  strength: EvidenceStrength
  derivedFromEvidenceIds: readonly string[]
  promotedAt: Date | null
}

/**
 * A hypothesis carried into the packet — as a guess, explicitly labelled.
 *
 * Present so AVA can answer "what are you only guessing about me?" honestly.
 * It never grounds a claim about what the user prefers.
 */
export interface PacketHypothesisEntry {
  hypothesisId: string
  falsifiableDescription: string
  context: string
  scopeDescription: string
  status: string
  alternativesAvailable: readonly string[]
  evidenceIds: readonly string[]
  counterEvidenceIds: readonly string[]
  authority: 'HYPOTHESIS'
}

/** Why an item that was retrieved did not reach the provider. */
export type ExclusionReason =
  | 'restricted_sensitivity'
  | 'system_origin'
  | 'out_of_scope_workstream'
  | 'below_selection_limit'
  | 'superseded_and_not_requested'
  | 'scope_does_not_match'

export interface Exclusion {
  evidenceId: string
  reason: ExclusionReason
  /** Never reveals the withheld content. */
  detail: string
}

export interface PacketStateEntry {
  objectId: string
  type: string
  title: string
  status: string
  version: number
  observedAt: Date
  strength: EvidenceStrength
  evidenceIds: readonly string[]
  /**
   * True when this version has a successor.
   *
   * Deliberately derived from the supersession POINTER, not from the string
   * `status`. In the Slice 2 lifecycle a correction writes a successor whose
   * own status reads `superseded` — meaning "this object's earlier decision
   * was superseded". Reading the status here would mark the live version as
   * out of date and invert exactly the distinction this slice must protect.
   */
  superseded: boolean
}

export interface PacketChangeEntry {
  changeId: string
  objectId: string
  changeType: string
  observedAt: Date
  changedFields: readonly string[]
  evidenceIds: readonly string[]
  strength: EvidenceStrength
  contradictionFlag: boolean
}

/**
 * The Context Packet (spec §13.4).
 *
 * An explicit, inspectable object — never a concatenated prompt string. The
 * distinction matters: a string cannot be audited for what was excluded, and
 * exclusions are the part most likely to be wrong.
 */
export interface ContextPacket {
  id: string
  question: string
  query: ClassifiedQuery
  workstreamId: string
  builtAt: Date

  retrieved: readonly RetrievalResult[]
  currentState: readonly PacketStateEntry[]
  /** Earlier versions, kept reachable so "what was it before?" is answerable. */
  supersededState: readonly PacketStateEntry[]
  changes: readonly PacketChangeEntry[]
  /** Contradictions and conflicting evidence, carried rather than resolved. */
  conflicts: readonly string[]
  /** Known gaps, in the packet's own words. */
  gaps: readonly string[]

  /** What the user explicitly told AVA, applicable to this context. */
  declaredCognition: readonly PacketCognitionEntry[]
  /** Declarations that used to apply and have since been replaced. */
  supersededCognition: readonly PacketCognitionEntry[]
  /** Promoted semantic knowledge, kept separate from raw evidence. */
  stabilizedKnowledge: readonly PacketKnowledgeEntry[]
  /** Observed patterns. Labelled as guesses, never as preferences. */
  behavioralHypotheses: readonly PacketHypothesisEntry[]

  health: ContextHealthResult
  exclusions: readonly Exclusion[]

  /**
   * The ONLY evidence ids permitted to cross the provider boundary.
   * A subset of `retrieved`: local knowledge is broader than what may be sent.
   */
  providerEligibleEvidenceIds: readonly string[]
}
