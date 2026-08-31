import { ulid } from '../primitives/id'
import { weakestOf } from '../primitives/evidence-strength'
import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { StateObjectVersion } from '../state/types'
import { DETECTOR_VERSION } from './types'
import type { ChangeRecord, ChangeType, Detector } from './types'

export interface DetectOptions {
  /** Object ids that a high-impact rule marks as sensitive to abstention. */
  highImpactObjectIds?: ReadonlySet<string>
  contextHealth?: string | null
}

interface Detection {
  changeType: ChangeType
  detector: Detector
  changedFields: string[]
}

/** Stage 1 — identity: is this the first version we have seen? */
function stage1(before: StateObjectVersion | null): Detection | null {
  if (before === null) {
    return { changeType: 'created', detector: 'stage1_identity', changedFields: [] }
  }
  return null
}

/** Stage 3 — object-specific rules, applied before generic field comparison. */
function stage3(before: StateObjectVersion, after: StateObjectVersion): Detection | null {
  // A version that points away from itself has been replaced.
  if (before.supersededBy !== null && before.supersededBy === after.id) {
    return { changeType: 'superseded', detector: 'stage3_rules', changedFields: ['supersededBy'] }
  }
  if (before.status !== after.status) {
    const terminalRemoval: Record<string, string[]> = {
      decision: ['invalidated'],
      artifact: ['outdated'],
    }
    if ((terminalRemoval[after.type] ?? []).includes(after.status)) {
      return { changeType: 'invalidated', detector: 'stage3_rules', changedFields: ['status'] }
    }
    if (after.status === 'cancelled' || after.status === 'abandoned') {
      return { changeType: 'removed', detector: 'stage3_rules', changedFields: ['status'] }
    }
    return { changeType: 'status_changed', detector: 'stage3_rules', changedFields: ['status'] }
  }
  return null
}

function structuredFieldDiff(
  before: StateObjectVersion,
  after: StateObjectVersion,
): string[] {
  const changed: string[] = []
  if (before.title !== after.title) changed.push('title')
  const keys = new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])
  for (const k of keys) {
    if (JSON.stringify(before.fields[k]) !== JSON.stringify(after.fields[k])) changed.push(`fields.${k}`)
  }
  if (before.strength !== after.strength) changed.push('strength')
  return changed.sort()
}

/** Stage 2 — structured field comparison. */
function stage2(before: StateObjectVersion, after: StateObjectVersion): Detection | null {
  const changed = structuredFieldDiff(before, after)
  const structural = changed.filter((c) => c !== 'title')
  if (structural.length > 0) {
    return { changeType: 'modified', detector: 'stage2_structured', changedFields: changed }
  }
  return null
}

/** Stage 4 — lexical diff, only for what structured comparison could not settle. */
function stage4(before: StateObjectVersion, after: StateObjectVersion): Detection | null {
  if (before.title !== after.title) {
    return { changeType: 'modified', detector: 'stage4_lexical', changedFields: ['title'] }
  }
  return null
}

/**
 * Deterministic change detection, stages 1 → 4, then abstention.
 *
 * No LLM participates. Stage 5 (semantic interpretation) is deliberately not
 * implemented in Batch 1: the provider gate is open and the whole Milestone 1
 * loop must work without a model.
 */
export function detectChange(
  before: StateObjectVersion | null,
  after: StateObjectVersion,
  evidenceIds: readonly string[],
  strengths: readonly EvidenceStrength[],
  options: DetectOptions = {},
): ChangeRecord | null {
  const detection =
    stage1(before) ??
    (before ? (stage3(before, after) ?? stage2(before, after) ?? stage4(before, after)) : null)

  if (detection === null) return null

  const strength = weakestOf(strengths.length > 0 ? strengths : [after.strength])

  // Stage 6 — high impact plus weak evidence: the system does not decide.
  const highImpact = options.highImpactObjectIds?.has(after.objectId) ?? false
  const abstain = highImpact && strength === 'SPECULATIVE'

  return {
    id: ulid(),
    objectId: after.objectId,
    objectType: after.type,
    workstreamId: after.workstreamId,
    changeType: abstain ? 'unknown_change' : detection.changeType,
    beforeVersionRef: before?.id ?? null,
    afterVersionRef: after.id,
    changedFields: detection.changedFields,
    observedAt: after.observedAt,
    effectiveAt: after.effectiveAt,
    effectiveAtInferred: after.effectiveAtInferred,
    evidenceIds: [...evidenceIds],
    strength,
    candidateDependencies: [],
    contradictionFlag: false,
    contextHealthAtDetection: options.contextHealth ?? null,
    detector: abstain ? 'stage6_abstained' : detection.detector,
    detectorVersion: DETECTOR_VERSION,
    // Deterministic detections are accepted. Only stage 5 would be a candidate,
    // and stage 5 does not exist in Batch 1.
    status: abstain ? 'candidate' : 'accepted',
  }
}
