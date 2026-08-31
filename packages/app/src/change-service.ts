import {
  detectChange, projectCurrentState, propagateImpact, newRelationship,
  INITIAL_STATUS, canTransition, isStateObjectType, weakestOf, withCandidateDependencies,
} from '@ava/core'
import type {
  ChangeRecord, CurrentStateView, ImpactedObject, StateObjectType,
  StateObjectVersion, ValidatedCapture,
} from '@ava/core'
import type { Evidence } from '@ava/db'
import type { AppContext } from './context'

export interface ChangeOutcome {
  objectId: string
  version: StateObjectVersion
  change: ChangeRecord | null
  impacted: ImpactedObject[]
}

/**
 * Turns an accepted capture into state, then detects what changed.
 *
 * Deterministic end to end: no model participates in this path. That is not a
 * simplification for Batch 1 — it is baseline §10, where semantic
 * interpretation is the fifth stage and only runs when the earlier four cannot
 * settle the question.
 */
export async function applyCapture(
  ctx: AppContext,
  capture: ValidatedCapture,
  evidence: Evidence,
): Promise<ChangeOutcome | null> {
  const isCorrection = capture.type === 'correction'
  const targetId = capture.supersedesStateObjectId

  if (isCorrection && targetId) {
    return supersedeExisting(ctx, capture, evidence, targetId)
  }

  if (!isStateObjectType(capture.type)) return null
  return createNew(ctx, capture, evidence, capture.type)
}

async function createNew(
  ctx: AppContext, capture: ValidatedCapture, evidence: Evidence, type: StateObjectType,
): Promise<ChangeOutcome> {
  const objectId = await ctx.state.createObject(type, capture.workstreamId)
  const version = await ctx.state.appendVersion({
    objectId, type,
    workstreamId: capture.workstreamId,
    version: 1,
    status: INITIAL_STATUS[type],
    title: capture.title ?? summarise(capture.content),
    fields: capture.fields,
    evidenceIds: [evidence.id],
    strength: evidence.strength,
    sensitivity: capture.sensitivity,
    observedAt: capture.observedAt,
    effectiveAt: capture.effectiveAt,
    effectiveAtInferred: capture.effectiveAtInferred,
  })

  return finish(ctx, null, version, evidence, capture)
}

/**
 * A correction never overwrites. It writes a new version, points the previous
 * one at it, and leaves the old version fully reachable.
 */
async function supersedeExisting(
  ctx: AppContext, capture: ValidatedCapture, evidence: Evidence, objectId: string,
): Promise<ChangeOutcome | null> {
  const previous = await ctx.state.latestVersion(objectId)
  if (previous === null) return null

  const successor = await ctx.state.appendVersion({
    objectId,
    type: previous.type,
    workstreamId: previous.workstreamId,
    version: previous.version + 1,
    status: nextStatusFor(previous.type, previous.status),
    title: capture.title ?? summarise(capture.content),
    fields: { ...previous.fields, ...capture.fields },
    evidenceIds: [...previous.evidenceIds, evidence.id],
    strength: evidence.strength,
    sensitivity: capture.sensitivity,
    observedAt: capture.observedAt,
    effectiveAt: capture.effectiveAt,
    effectiveAtInferred: capture.effectiveAtInferred,
  })

  await ctx.state.markSuperseded(previous.id, successor.id)
  const linked = await ctx.state.findVersionById(previous.id)

  return finish(ctx, linked ?? previous, successor, evidence, capture)
}

/** The status a superseded object moves to, per lifecycle. */
function nextStatusFor(type: StateObjectType, current: string): string {
  const superseded: Partial<Record<StateObjectType, string>> = {
    decision: 'superseded',
    artifact: 'superseded',
    goal: 'superseded',
  }
  return superseded[type] ?? current
}

async function finish(
  ctx: AppContext,
  before: StateObjectVersion | null,
  after: StateObjectVersion,
  evidence: Evidence,
  capture: ValidatedCapture,
): Promise<ChangeOutcome> {
  // The moment the change became detectable is when its evidence arrived.
  await ctx.telemetry.record({
    eventType: 'change_detectable_at', occurredAt: evidence.observedAt,
    subjectType: 'state_object', subjectId: after.objectId,
    workstreamId: after.workstreamId, evidenceStrength: evidence.strength,
  })
  await ctx.telemetry.record({
    eventType: 'change_detection_triggered', occurredAt: new Date(),
    subjectType: 'state_object', subjectId: after.objectId, workstreamId: after.workstreamId,
  })

  let change = detectChange(before, after, [evidence.id], [evidence.strength], {
    contextHealth: null,
  })

  let impacted: ImpactedObject[] = []
  if (change !== null) {
    const relationships = await ctx.state.relationships()
    impacted = propagateImpact(change, relationships)
    change = withCandidateDependencies(change, impacted)
    await ctx.changes.append(change)

    await ctx.telemetry.record({
      eventType: 'change_detected', occurredAt: new Date(),
      subjectType: 'change_record', subjectId: change.id, workstreamId: change.workstreamId,
      evidenceStrength: change.strength,
      payload: {
        changeType: change.changeType,
        detector: change.detector,
        impactedCount: impacted.length,
      },
    })

    // Impact is recorded as its own change on each affected object: a
    // consequence is not the same event as the delta that caused it.
    for (const target of impacted) {
      await recordDependencyImpact(ctx, change, target, evidence)
    }
  }

  // A capture may declare that this object depends on another.
  const dependsOn = capture.fields.dependsOn
  if (typeof dependsOn === 'string' && dependsOn !== '') {
    await ctx.state.addRelationship(
      newRelationship(after.objectId, after.type, dependsOn, 'unknown', 'depends_on', [evidence.id]),
    )
  }

  return { objectId: after.objectId, version: after, change, impacted }
}

async function recordDependencyImpact(
  ctx: AppContext, source: ChangeRecord, target: ImpactedObject, evidence: Evidence,
): Promise<void> {
  const latest = await ctx.state.latestVersion(target.objectId)
  if (latest === null) return
  const impactChange: ChangeRecord = {
    ...source,
    id: `${source.id}-imp-${target.objectId}`,
    objectId: target.objectId,
    objectType: latest.type,
    changeType: 'dependency_impacted',
    beforeVersionRef: latest.id,
    afterVersionRef: latest.id,
    changedFields: [],
    candidateDependencies: [source.objectId],
    evidenceIds: [evidence.id],
    detector: 'stage3_rules',
  }
  await ctx.changes.append(impactChange)

  // GS-02, completing the scenario Slice 2 opened. An ARTIFACT that declares a
  // dependency on something just superseded or invalidated moves to
  // `outdated`.
  //
  // The transition is narrow on purpose: only artifacts, only at depth 1, only
  // along a dependency the user declared, and only when the artifact has not
  // been revised since. `outdated` says "this was written against something
  // that has moved" — it does not say the work is wrong, and the version that
  // existed before stays fully readable.
  if (
    latest.type === 'artifact'
    && target.reason === 'potentially_outdated'
    && target.depth === 1
    && latest.observedAt.getTime() <= source.observedAt.getTime()
    && canTransition('artifact', latest.status, 'outdated')
  ) {
    await ctx.state.appendVersion({
      objectId: latest.objectId,
      type: latest.type,
      workstreamId: latest.workstreamId,
      version: latest.version + 1,
      status: 'outdated',
      title: latest.title,
      fields: latest.fields,
      evidenceIds: [...latest.evidenceIds, evidence.id],
      strength: weakestOf([latest.strength, source.strength]),
      sensitivity: latest.sensitivity,
      observedAt: source.observedAt,
      effectiveAt: latest.effectiveAt,
      effectiveAtInferred: latest.effectiveAtInferred,
    })
  }
}

function summarise(content: string): string {
  const firstLine = content.split('\n')[0] ?? content
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine
}

/** Rebuilds the Current State projection for a workstream. */
export async function currentState(
  ctx: AppContext, workstreamId: string, at: Date = new Date(),
): Promise<CurrentStateView> {
  const versions = await ctx.state.allVersions(workstreamId)
  await ctx.telemetry.record({
    eventType: 'state_projection_triggered', occurredAt: new Date(),
    subjectType: 'workstream', subjectId: workstreamId, workstreamId,
    payload: { versionCount: versions.length },
  })
  return projectCurrentState({ workstreamId, versions, at })
}

/** Projection without telemetry, for the reconstruction test. */
export async function currentStateQuiet(
  ctx: AppContext, workstreamId: string, at: Date = new Date(),
): Promise<CurrentStateView> {
  const versions = await ctx.state.allVersions(workstreamId)
  return projectCurrentState({ workstreamId, versions, at })
}
