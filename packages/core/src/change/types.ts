import type { EvidenceStrength } from '../primitives/evidence-strength'

/** The nine change types (baseline §10). Not negotiable, not extended. */
export type ChangeType =
  | 'created' | 'modified' | 'removed' | 'status_changed' | 'superseded'
  | 'invalidated' | 'dependency_impacted' | 'not_propagated' | 'unknown_change'

export const CHANGE_TYPES: readonly ChangeType[] = [
  'created', 'modified', 'removed', 'status_changed', 'superseded',
  'invalidated', 'dependency_impacted', 'not_propagated', 'unknown_change',
] as const

/**
 * Detection cascade (baseline §10). Deterministic stages run first and settle
 * almost everything; the LLM stage is fifth and is NOT implemented in Batch 1.
 */
export type Detector =
  | 'stage1_identity'      // ids, hashes, versions
  | 'stage2_structured'    // structured field comparison
  | 'stage3_rules'         // object-specific rules
  | 'stage4_lexical'       // lexical diff
  | 'stage5_semantic'      // LLM — NOT AVAILABLE IN BATCH 1
  | 'stage6_abstained'     // high impact + low evidence: hand to review

export const DETECTOR_VERSION = '1.0.0'

export interface ChangeRecord {
  id: string
  objectId: string
  objectType: string
  workstreamId: string
  changeType: ChangeType
  /** References to versions — never copies of content. */
  beforeVersionRef: string | null
  afterVersionRef: string | null
  changedFields: string[]
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  evidenceIds: string[]
  strength: EvidenceStrength
  candidateDependencies: string[]
  contradictionFlag: boolean
  contextHealthAtDetection: string | null
  detector: Detector
  detectorVersion: string
  /** LLM-detected change would enter as `candidate` and change nothing. */
  status: 'candidate' | 'accepted' | 'rejected'
}
