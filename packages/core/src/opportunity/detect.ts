import { propagateImpact } from '../impact/propagate'
import { weakestOf } from '../primitives/evidence-strength'
import type { EvidenceStrength } from '../primitives/evidence-strength'
import type { ChangeRecord } from '../change/types'
import type { Relationship, StateObjectVersion } from '../state/types'
import type { AffectedObject, OpportunityClass } from './types'

/**
 * The five detection rules (spec §11).
 *
 * Every rule here is deterministic over Current State, ChangeRecords and
 * declared relationships. No model participates in deciding whether an
 * opportunity EXISTS — a model may later phrase it, never conjure it.
 *
 * Change is the operational trigger. These rules do not sweep the corpus
 * looking for insights; they start from a delta and follow declared relations
 * one or two steps. There is no graph database and no graph reasoning.
 */
export const RULE_VERSION = '1.0.0'

/** How far ahead a commitment or risk window counts as "approaching". */
export const UPCOMING_WINDOW_DAYS = 7
const DAY_MS = 86_400_000

export interface DetectedCondition {
  opportunityClass: OpportunityClass
  ruleId: string
  ruleVersion: string
  workstreamId: string
  subjectObjectId: string
  subjectType: string
  triggerChangeIds: string[]
  originEvidenceIds: string[]
  affectedObjects: AffectedObject[]
  headline: string
  detail: string
  minimalAction: string | null
  strength: EvidenceStrength
  window: { from: Date | null; until: Date | null } | null
  /** Whether a concrete next step exists. Feeds `actionability`. */
  actionable: boolean
}

export interface DetectionInput {
  workstreamId: string
  now: Date
  /** Latest version per object, as projected by Current State. */
  current: readonly StateObjectVersion[]
  changes: readonly ChangeRecord[]
  relationships: readonly Relationship[]
  /** Start of the checkpoint window, when one is open. */
  since: Date | null
}

export function detectOpportunities(input: DetectionInput): DetectedCondition[] {
  return [
    ...detectUnpropagatedDecision(input),
    ...detectInvalidatedWork(input),
    ...detectUpcomingCommitment(input),
    ...detectUnresolvedQuestion(input),
    ...detectClosingRisk(input),
  ]
}

// ---------------------------------------------------------------------------
// 1. Unpropagated decision
// ---------------------------------------------------------------------------

/**
 * A decision was superseded, and something that explicitly depends on it still
 * reflects the old one.
 *
 * "Explicitly" is load-bearing: the dependency must have been declared. AVA
 * does not guess that two things are related and then tell the user their work
 * is stale on the strength of that guess.
 */
export function detectUnpropagatedDecision(input: DetectionInput): DetectedCondition[] {
  const out: DetectedCondition[] = []
  const byId = indexCurrent(input.current)

  for (const change of relevantChanges(input, 'superseded')) {
    const subject = byId.get(change.objectId)
    if (subject === undefined || subject.type !== 'decision') continue

    const impacted = dependentsOf(change, input.relationships, byId)
      .filter((d) => !hasCaughtUp(d.version, change))
    if (impacted.length === 0) continue

    const names = impacted.map((d) => d.version.title)
    out.push({
      opportunityClass: 'unpropagated_decision',
      ruleId: 'unpropagated_decision/superseded_with_stale_dependent',
      ruleVersion: RULE_VERSION,
      workstreamId: input.workstreamId,
      subjectObjectId: change.objectId,
      subjectType: subject.type,
      triggerChangeIds: [change.id],
      originEvidenceIds: unique([...change.evidenceIds, ...subject.evidenceIds]),
      affectedObjects: impacted.map((d) => d.affected),
      headline: `${names[0]} may need review because the decision it depends on changed.`,
      detail:
        `"${subject.title}" was superseded on ${dateOnly(change.observedAt)}. ` +
        `${plural(names.length, 'item')} that explicitly depend${names.length === 1 ? 's' : ''} on it ` +
        `${names.length === 1 ? 'has' : 'have'} not been updated since: ${names.join('; ')}. ` +
        'AVA cannot tell whether the dependent work is actually wrong — only that it was written against the earlier decision.',
      minimalAction: `Check ${names[0]} against the current decision and update it or confirm it still holds.`,
      strength: weakestOf([change.strength, subject.strength]),
      window: null,
      actionable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// 2. Invalidated work
// ---------------------------------------------------------------------------

/**
 * A change invalidated something, and dependent work may no longer hold.
 *
 * The language stays at "potentially": the relation tells us the dependency
 * existed, not that the dependent artifact is definitively invalid. Asserting
 * the stronger claim would be a fact AVA does not have.
 */
export function detectInvalidatedWork(input: DetectionInput): DetectedCondition[] {
  const out: DetectedCondition[] = []
  const byId = indexCurrent(input.current)

  for (const change of relevantChanges(input, 'invalidated')) {
    const subject = byId.get(change.objectId)
    if (subject === undefined) continue
    const impacted = dependentsOf(change, input.relationships, byId)
    if (impacted.length === 0) continue

    const names = impacted.map((d) => d.version.title)
    out.push({
      opportunityClass: 'invalidated_work',
      ruleId: 'invalidated_work/invalidated_with_dependent',
      ruleVersion: RULE_VERSION,
      workstreamId: input.workstreamId,
      subjectObjectId: change.objectId,
      subjectType: subject.type,
      triggerChangeIds: [change.id],
      originEvidenceIds: unique([...change.evidenceIds, ...subject.evidenceIds]),
      affectedObjects: impacted.map((d) => d.affected),
      headline: `${names[0]} may be affected because "${subject.title}" was invalidated.`,
      detail:
        `"${subject.title}" was marked invalidated on ${dateOnly(change.observedAt)}. ` +
        `${plural(names.length, 'dependent item')}: ${names.join('; ')}. ` +
        'This is a potential impact along a declared dependency, not a finding that the work is wrong.',
      minimalAction: `Review ${names[0]} to see whether it still stands.`,
      strength: weakestOf([change.strength, subject.strength]),
      window: null,
      actionable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// 3. Upcoming commitment
// ---------------------------------------------------------------------------

/**
 * A commitment falls due soon AND there is something concrete to prepare.
 *
 * The second condition is the whole rule. A date by itself is not urgency; if
 * nothing supporting the commitment is unfinished, there is no preparation to
 * suggest and no opportunity — only a calendar entry the user can already see.
 */
export function detectUpcomingCommitment(input: DetectionInput): DetectedCondition[] {
  const out: DetectedCondition[] = []
  const byId = indexCurrent(input.current)
  const horizon = new Date(input.now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)

  for (const version of input.current) {
    if (version.type !== 'commitment' || version.status !== 'open') continue
    const dueAt = dateField(version, 'dueAt')
    if (dueAt === null) continue
    if (dueAt.getTime() < input.now.getTime() || dueAt.getTime() > horizon.getTime()) continue

    const unfinished = supportingWork(version.objectId, input.relationships, byId)
      .filter((s) => s.version.type === 'artifact'
        ? s.version.status === 'draft' || s.version.status === 'outdated'
        : s.version.status === 'open' || s.version.status === 'identified')
    if (unfinished.length === 0) continue

    const names = unfinished.map((s) => s.version.title)
    out.push({
      opportunityClass: 'upcoming_commitment',
      ruleId: 'upcoming_commitment/due_with_unfinished_support',
      ruleVersion: RULE_VERSION,
      workstreamId: input.workstreamId,
      subjectObjectId: version.objectId,
      subjectType: version.type,
      triggerChangeIds: changesTouching(input, version.objectId).map((c) => c.id),
      originEvidenceIds: unique([...version.evidenceIds, ...unfinished.flatMap((s) => s.version.evidenceIds)]),
      affectedObjects: unfinished.map((s) => s.affected),
      headline: `"${version.title}" is due ${relativeDay(input.now, dueAt)} and supporting work is unfinished.`,
      detail:
        `The commitment falls due on ${dateOnly(dueAt)}. ` +
        `${plural(names.length, 'supporting item')} still open: ${names.join('; ')}.`,
      minimalAction: `Finish or triage ${names[0]} before ${dateOnly(dueAt)}.`,
      strength: weakestOf([version.strength, ...unfinished.map((s) => s.version.strength)]),
      window: { from: null, until: dueAt },
      actionable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// 4. Relevant unresolved question
// ---------------------------------------------------------------------------

/**
 * An open question that has BECOME relevant — because a change touched
 * something it relates to, or because a commitment it blocks is approaching.
 *
 * Every open question is not a notification. Turning the backlog into a feed
 * is the fastest way to make a proactive system worth ignoring.
 */
export function detectUnresolvedQuestion(input: DetectionInput): DetectedCondition[] {
  const out: DetectedCondition[] = []
  const byId = indexCurrent(input.current)
  const horizon = new Date(input.now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)

  for (const version of input.current) {
    if (version.type !== 'question') continue
    if (version.status !== 'open' && version.status !== 'reopened') continue

    const related = relatedObjects(version.objectId, input.relationships, byId)
    const triggering = related.filter((r) =>
      changesTouching(input, r.version.objectId).length > 0)
    const pressing = related.filter((r) => {
      if (r.version.type !== 'commitment' || r.version.status !== 'open') return false
      const due = dateField(r.version, 'dueAt')
      return due !== null && due.getTime() >= input.now.getTime() && due.getTime() <= horizon.getTime()
    })

    const firstPressing = pressing[0] ?? null
    const firstTriggering = triggering[0] ?? null
    if (firstPressing === null && firstTriggering === null) continue

    const why = firstPressing !== null
      ? `a commitment it blocks — "${firstPressing.version.title}" — falls due soon`
      : `something it relates to changed: "${firstTriggering!.version.title}"`

    out.push({
      opportunityClass: 'unresolved_question',
      ruleId: firstPressing !== null
        ? 'unresolved_question/blocks_approaching_commitment'
        : 'unresolved_question/related_object_changed',
      ruleVersion: RULE_VERSION,
      workstreamId: input.workstreamId,
      subjectObjectId: version.objectId,
      subjectType: version.type,
      triggerChangeIds: unique(triggering.flatMap((r) =>
        changesTouching(input, r.version.objectId).map((c) => c.id))),
      originEvidenceIds: unique([...version.evidenceIds,
        ...[...triggering, ...pressing].flatMap((r) => r.version.evidenceIds)]),
      affectedObjects: dedupeAffected([...pressing, ...triggering].map((r) => r.affected)),
      headline: `"${version.title}" is still open and has become relevant.`,
      detail: `The question has no answer recorded, and ${why}. AVA has not invented an answer for it.`,
      minimalAction: `Decide whether "${version.title}" needs an answer now or can stay open.`,
      strength: weakestOf([version.strength,
        ...[...pressing, ...triggering].map((r) => r.version.strength)]),
      window: firstPressing !== null
        ? { from: null, until: dateField(firstPressing.version, 'dueAt') } : null,
      actionable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// 5. Closing risk
// ---------------------------------------------------------------------------

/**
 * A risk whose mitigation window is closing.
 *
 * Not every risk is promoted, and not immediately: a risk with no stated
 * window has no closing point, and one whose window is far off is not yet a
 * reason to interrupt.
 */
export function detectClosingRisk(input: DetectionInput): DetectedCondition[] {
  const out: DetectedCondition[] = []
  const horizon = new Date(input.now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)

  for (const version of input.current) {
    if (version.type !== 'risk') continue
    if (version.status !== 'identified' && version.status !== 'materialized') continue
    const until = dateField(version, 'mitigationUntil')
    if (until === null) continue
    if (until.getTime() < input.now.getTime() || until.getTime() > horizon.getTime()) continue

    out.push({
      opportunityClass: 'closing_risk',
      ruleId: 'closing_risk/mitigation_window_approaching',
      ruleVersion: RULE_VERSION,
      workstreamId: input.workstreamId,
      subjectObjectId: version.objectId,
      subjectType: version.type,
      triggerChangeIds: changesTouching(input, version.objectId).map((c) => c.id),
      originEvidenceIds: [...version.evidenceIds],
      affectedObjects: [{
        objectId: version.objectId, objectType: version.type,
        relation: 'subject', viaKind: null, depth: 0,
      }],
      headline: `The window to act on "${version.title}" closes ${relativeDay(input.now, until)}.`,
      detail:
        `This risk is still ${version.status} and its recorded mitigation window ends on ${dateOnly(until)}. ` +
        'AVA is reporting the window, not predicting that the risk will occur.',
      minimalAction: `Decide before ${dateOnly(until)} whether to mitigate "${version.title}" or accept it.`,
      strength: version.strength,
      window: { from: null, until },
      actionable: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function indexCurrent(current: readonly StateObjectVersion[]): Map<string, StateObjectVersion> {
  return new Map(current.map((v) => [v.objectId, v]))
}

/** Changes of a given type inside the checkpoint window. */
function relevantChanges(input: DetectionInput, type: ChangeRecord['changeType']): ChangeRecord[] {
  return input.changes.filter((c) =>
    c.changeType === type
    && c.status !== 'rejected'
    && (input.since === null || c.observedAt.getTime() >= input.since.getTime()))
}

function changesTouching(input: DetectionInput, objectId: string): ChangeRecord[] {
  return input.changes.filter((c) =>
    c.objectId === objectId
    && c.status !== 'rejected'
    && (input.since === null || c.observedAt.getTime() >= input.since.getTime()))
}

interface Dependent {
  version: StateObjectVersion
  affected: AffectedObject
}

/** Objects that declared a dependency on the changed one. */
function dependentsOf(
  change: ChangeRecord,
  relationships: readonly Relationship[],
  byId: Map<string, StateObjectVersion>,
): Dependent[] {
  const out: Dependent[] = []
  for (const impacted of propagateImpact(change, relationships)) {
    const version = byId.get(impacted.objectId)
    if (version === undefined) continue
    out.push({
      version,
      affected: {
        objectId: impacted.objectId,
        objectType: version.type,
        relation: impacted.reason,
        viaKind: impacted.viaKind,
        depth: impacted.depth,
      },
    })
  }
  return out
}

/** Work declared as supporting a commitment, in either direction. */
function supportingWork(
  objectId: string,
  relationships: readonly Relationship[],
  byId: Map<string, StateObjectVersion>,
): Dependent[] {
  return relatedObjects(objectId, relationships, byId)
    .filter((r) => r.affected.viaKind === 'depends_on' || r.affected.viaKind === 'produces'
      || r.affected.viaKind === 'part_of')
}

function relatedObjects(
  objectId: string,
  relationships: readonly Relationship[],
  byId: Map<string, StateObjectVersion>,
): Dependent[] {
  const out: Dependent[] = []
  const seen = new Set<string>()
  for (const rel of relationships) {
    const otherId = rel.fromId === objectId ? rel.toId : rel.toId === objectId ? rel.fromId : null
    if (otherId === null || seen.has(otherId)) continue
    const version = byId.get(otherId)
    if (version === undefined) continue
    seen.add(otherId)
    out.push({
      version,
      affected: {
        objectId: otherId, objectType: version.type,
        relation: 'potentially_impacted', viaKind: rel.kind, depth: 1,
      },
    })
  }
  return out
}

/**
 * Whether the dependent has already been revised since the change.
 *
 * If it has, the decision propagated and there is nothing to raise. Comparing
 * observation times is deliberately conservative: a dependent updated at the
 * same instant counts as caught up rather than being flagged.
 */
function hasCaughtUp(version: StateObjectVersion, change: ChangeRecord): boolean {
  if (version.status === 'superseded' || version.status === 'current') {
    if (version.observedAt.getTime() >= change.observedAt.getTime()) return true
  }
  return version.observedAt.getTime() > change.observedAt.getTime()
}

function dateField(version: StateObjectVersion, key: string): Date | null {
  const raw = version.fields[key]
  if (raw instanceof Date) return raw
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The same object reached along two relations is still one object. */
function dedupeAffected(items: readonly AffectedObject[]): AffectedObject[] {
  const byId = new Map<string, AffectedObject>()
  for (const item of items) if (!byId.has(item.objectId)) byId.set(item.objectId, item)
  return [...byId.values()]
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function relativeDay(now: Date, then: Date): string {
  const days = Math.round((then.getTime() - now.getTime()) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
