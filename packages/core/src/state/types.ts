import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { Sensitivity } from '../primitives/origin'

/** State object kinds present in Slice 2 (baseline §13). */
export type StateObjectType = 'decision' | 'commitment' | 'question' | 'risk' | 'artifact' | 'goal'

export const STATE_OBJECT_TYPES: readonly StateObjectType[] = [
  'decision', 'commitment', 'question', 'risk', 'artifact', 'goal',
] as const

/** Lifecycles per type (spec §3.5). */
export const LIFECYCLES: Record<StateObjectType, readonly string[]> = {
  decision: ['proposed', 'made', 'superseded', 'invalidated'],
  commitment: ['open', 'met', 'missed', 'cancelled'],
  question: ['open', 'answered', 'abandoned', 'reopened'],
  risk: ['identified', 'mitigated', 'materialized', 'closed'],
  artifact: ['draft', 'current', 'outdated', 'superseded'],
  goal: ['active', 'achieved', 'abandoned', 'superseded'],
}

export const INITIAL_STATUS: Record<StateObjectType, string> = {
  decision: 'made',
  commitment: 'open',
  question: 'open',
  risk: 'identified',
  artifact: 'draft',
  goal: 'active',
}

/** Allowed transitions. Anything absent is rejected. */
const TRANSITIONS: Record<StateObjectType, Record<string, readonly string[]>> = {
  decision: {
    proposed: ['made', 'invalidated'],
    made: ['superseded', 'invalidated'],
    superseded: [],
    invalidated: [],
  },
  commitment: {
    open: ['met', 'missed', 'cancelled'],
    met: [], missed: [], cancelled: [],
  },
  question: {
    open: ['answered', 'abandoned'],
    answered: ['reopened'],
    reopened: ['answered', 'abandoned'],
    abandoned: ['reopened'],
  },
  risk: {
    identified: ['mitigated', 'materialized', 'closed'],
    mitigated: ['materialized', 'closed'],
    materialized: ['closed'],
    closed: [],
  },
  artifact: {
    draft: ['current', 'outdated', 'superseded'],
    current: ['outdated', 'superseded'],
    outdated: ['current', 'superseded'],
    superseded: [],
  },
  goal: {
    active: ['achieved', 'abandoned', 'superseded'],
    achieved: [], abandoned: [], superseded: [],
  },
}

export function isStateObjectType(v: unknown): v is StateObjectType {
  return typeof v === 'string' && (STATE_OBJECT_TYPES as readonly string[]).includes(v)
}

export function isValidStatus(type: StateObjectType, status: string): boolean {
  return LIFECYCLES[type].includes(status)
}

export function canTransition(type: StateObjectType, from: string, to: string): boolean {
  if (!isValidStatus(type, from) || !isValidStatus(type, to)) return false
  return (TRANSITIONS[type][from] ?? []).includes(to)
}

/**
 * One immutable version of a state object. A change never edits a version;
 * it writes a new one and marks the previous `supersededBy`.
 */
export interface StateObjectVersion {
  id: string
  objectId: string
  type: StateObjectType
  workstreamId: string
  version: number
  status: string
  title: string
  fields: Record<string, unknown>
  evidenceIds: string[]
  strength: EvidenceStrength
  sensitivity: Sensitivity
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  supersededBy: string | null
}

/** Relationship kinds (spec §10). A flat table — deliberately not a graph. */
export type RelationshipKind =
  | 'depends_on' | 'part_of' | 'decided_in' | 'produces' | 'updates'
  | 'responsible_for' | 'affects' | 'supersedes' | 'contradiction_candidate'

export const RELATIONSHIP_KINDS: readonly RelationshipKind[] = [
  'depends_on', 'part_of', 'decided_in', 'produces', 'updates',
  'responsible_for', 'affects', 'supersedes', 'contradiction_candidate',
] as const

export interface Relationship {
  id: string
  fromId: string
  fromType: string
  toId: string
  toType: string
  kind: RelationshipKind
  evidenceIds: string[]
}
