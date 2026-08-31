import { currentOutcome, outcomeAt, projectFeedback } from '@ava/core'
import type {
  CurrentFeedback, DeclaredCognition, OutcomeRecord, OutcomeState, UserActionRecord,
} from '@ava/core'
import type { AppContext } from '../context'

/**
 * The validation read model (S7-T03).
 *
 * A technical read model, not a dashboard and not an analysis. It answers
 * "could this be measured later?" and never "how did AVA do?". Nothing here
 * aggregates into a verdict, and nothing here is read by a policy — the
 * import direction is one-way, from records to audit.
 *
 * It also carries as little content as it can. Ids, categories, versions and
 * timestamps are enough to reconstruct a timeline; copying evidence text into
 * an analytics table would create a second corpus that no later
 * reclassification could reach.
 */
export const VALIDATION_SCHEMA_VERSION = 'v0.1'

/**
 * How a value can be absent. These are NOT interchangeable, and collapsing
 * them is how an audit starts inventing findings.
 *
 *  `not_observed`  — the event may have happened; AVA has no way to see it.
 *  `not_provided`  — the user was asked and did not answer.
 *  `not_applicable`— the question does not arise for this record.
 *  `unknown`       — recorded explicitly as unknown by whoever reported it.
 *  `unobservable`  — structurally impossible in this version, by decision.
 */
export type Missingness =
  | 'not_observed' | 'not_provided' | 'not_applicable' | 'unknown' | 'unobservable'

export interface Observed<T> {
  value: T | null
  missing: Missingness | null
}

export function observed<T>(value: T): Observed<T> {
  return { value, missing: null }
}

export function absent<T>(reason: Missingness): Observed<T> {
  return { value: null, missing: reason }
}

/** A timestamp, or an explicit statement of why there is none. */
export type ObservedTime = Observed<string>

function timeOrAbsent(d: Date | null, reason: Missingness): ObservedTime {
  return d === null ? absent(reason) : observed(d.toISOString())
}

export interface InterventionRecord {
  opportunityId: string
  identityKey: string
  opportunityClass: string
  workstreamId: string
  status: string
  version: number

  /** Provenance chain, by reference. */
  decisionRecordIds: readonly string[]
  triggerChangeIds: readonly string[]
  originEvidenceIds: readonly string[]
  affectedObjectIds: readonly string[]
  checkpointId: string | null

  /** Versions, so a later rule change cannot be mistaken for this decision. */
  policyVersion: string
  ruleId: string
  ruleVersion: string

  contextHealthAtGeneration: string
  strength: string
  showVerdict: string
  prepareVerdict: string
  investigateVerdict: string
  gatesBlockedBy: readonly string[]

  /** System estimate of novelty AT GENERATION, before any feedback existed. */
  noveltyAtGeneration: string

  epistemic: Observed<string>
  delivery: Observed<string>
  artifactVerdict: Observed<string>
  feedbackEventCount: number

  actions: readonly { kind: string; actedAt: string; timeBasis: string }[]
  outcomeState: Observed<string>
  outcomeHistory: readonly { state: string; recordedAt: string; resolvedBy: string }[]

  timeline: {
    evidenceArrivedAt: ObservedTime
    changeDetectableAt: ObservedTime
    changeDetectedAt: ObservedTime
    opportunityGeneratedAt: ObservedTime
    opportunityShownAt: ObservedTime
    userSeenAt: ObservedTime
    feedbackAt: ObservedTime
    userActionAt: ObservedTime
    outcomeAt: ObservedTime
  }

  preparedArtifacts: readonly {
    id: string; executionMode: string; actualCostUsd: number | null; status: string
  }[]
}

/**
 * Every intervention in a workstream, shown or not.
 *
 * Suppressed and candidate opportunities are INCLUDED. They are the only
 * record of what AVA decided not to say, which is the only material a later
 * investigation of misses can work from.
 */
export async function interventionRecords(
  ctx: AppContext, workstreamId: string,
): Promise<InterventionRecord[]> {
  const opportunities = await ctx.opportunities.listByWorkstream(workstreamId, [], 1000)
  const out: InterventionRecord[] = []

  for (const o of opportunities) {
    const feedbackRows = await ctx.feedback.forOpportunity(o.id)
    const feedback = projectFeedback(feedbackRows)
    const actions = await ctx.userActions.forOpportunity(o.id)
    const outcomes = await ctx.outcomes.historyFor(o.id)
    const artifacts = await ctx.prepared.listForOpportunity(o.id)

    const evidence = await ctx.evidence.findByIds(o.originEvidenceIds)
    const earliest = evidence.reduce<Date | null>(
      (min, e) => (min === null || e.observedAt < min ? e.observedAt : min), null)

    const events = o.impactedFrom === null
      ? [] : await ctx.telemetry.listBySubject(o.impactedFrom)
    const eventAt = (type: string): Date | null => {
      const row = events.find((e) => e.event_type === type)
      return row ? new Date(row.occurred_at) : null
    }
    const action = actions.find((a) => a.kind !== 'unknown') ?? null
    const outcome = currentOutcome(outcomes)

    const drs = await ctx.db.query<{ id: string }>(
      `SELECT id FROM decision_record WHERE scope_match->>'opportunityId' = $1 ORDER BY decided_at`,
      [o.id])

    out.push({
      opportunityId: o.id,
      identityKey: o.identityKey,
      opportunityClass: o.opportunityClass,
      workstreamId: o.workstreamId,
      status: o.status,
      version: o.version,
      decisionRecordIds: drs.rows.map((r) => r.id),
      triggerChangeIds: o.triggerChangeIds,
      originEvidenceIds: o.originEvidenceIds,
      affectedObjectIds: o.affectedObjects.map((a) => a.objectId),
      checkpointId: o.generation.checkpointId,
      policyVersion: o.show.version,
      ruleId: o.ruleId,
      ruleVersion: o.ruleVersion,
      contextHealthAtGeneration: o.contextHealth,
      strength: o.strength,
      showVerdict: o.show.verdict,
      prepareVerdict: o.prepare.verdict,
      investigateVerdict: o.investigate.verdict,
      gatesBlockedBy: o.gates.blockedBy,
      noveltyAtGeneration: String(o.valueVector.novelty.value),
      epistemic: feedback.epistemic === null
        ? absent('not_provided') : observed(feedback.epistemic),
      delivery: feedback.delivery === null
        ? absent('not_provided') : observed(feedback.delivery),
      artifactVerdict: feedback.artifact === null
        ? absent(artifacts.length === 0 ? 'not_applicable' : 'not_provided')
        : observed(feedback.artifact),
      feedbackEventCount: feedbackRows.length,
      actions: actions.map((a) => ({
        kind: a.kind,
        actedAt: a.actedAt.toISOString(),
        // A reported action time is an assertion, not an observation.
        timeBasis: 'reported',
      })),
      outcomeState: outcome === null ? absent('not_observed') : observed(outcome.state),
      outcomeHistory: outcomes.map((oc) => ({
        state: oc.state,
        recordedAt: oc.recordedAt.toISOString(),
        resolvedBy: oc.resolvedBy,
      })),
      timeline: {
        evidenceArrivedAt: timeOrAbsent(earliest, 'not_observed'),
        changeDetectableAt: timeOrAbsent(eventAt('change_detectable_at'), 'not_observed'),
        changeDetectedAt: timeOrAbsent(eventAt('change_detection_triggered'), 'not_observed'),
        opportunityGeneratedAt: observed(o.generation.generatedAt.toISOString()),
        opportunityShownAt: timeOrAbsent(o.shownAt, 'not_observed'),
        // Structurally impossible in this version, by decision, not by neglect.
        userSeenAt: absent('unobservable'),
        feedbackAt: timeOrAbsent(feedback.givenAt, 'not_provided'),
        userActionAt: timeOrAbsent(action?.actedAt ?? null, 'not_observed'),
        outcomeAt: timeOrAbsent(outcome?.recordedAt ?? null, 'not_observed'),
      },
      preparedArtifacts: artifacts.map((a) => ({
        id: a.id, executionMode: a.executionMode,
        actualCostUsd: a.actualCostUsd, status: a.status,
      })),
    })
  }
  return out
}

/**
 * Changes and impacts that produced NO opportunity.
 *
 * This is the closest the V0 gets to observing a miss. It is not a false
 * negative detector — nothing here knows whether the change mattered — but it
 * preserves the population a later investigation would have to look at.
 */
export interface UnraisedChangeRecord {
  changeId: string
  objectId: string
  objectType: string
  changeType: string
  observedAt: string
  strength: string
  candidateDependencyCount: number
  raisedOpportunity: false
}

export async function unraisedChanges(
  ctx: AppContext, workstreamId: string,
): Promise<UnraisedChangeRecord[]> {
  const changes = await ctx.changes.listByWorkstream(workstreamId, 1000)
  const opportunities = await ctx.opportunities.listByWorkstream(workstreamId, [], 1000)
  const raised = new Set(opportunities.flatMap((o) => o.triggerChangeIds))

  return changes
    .filter((c) => !raised.has(c.id))
    .map((c) => ({
      changeId: c.id,
      objectId: c.objectId,
      objectType: c.objectType,
      changeType: c.changeType,
      observedAt: c.observedAt.toISOString(),
      strength: c.strength,
      candidateDependencyCount: c.candidateDependencies.length,
      raisedOpportunity: false as const,
    }))
}

export interface ModelRunRecord {
  id: string
  taskArchetype: string | null
  provider: string | null
  model: string | null
  promptVersion: string | null
  status: string
  inputTokens: Observed<number>
  outputTokens: Observed<number>
  latencyMs: Observed<number>
  estimatedCostUsd: Observed<number>
  actualCostUsd: Observed<number>
  priceTableVersion: string | null
  startedAt: string
}

/**
 * Model runs, with unknown token counts preserved as unknown.
 *
 * A null token count means the provider did not report one. Recording it as
 * zero would make an unmeasured call look free, and a cost-per-intervention
 * figure built on that would be wrong in the safe-looking direction.
 */
export async function modelRunRecords(ctx: AppContext): Promise<ModelRunRecord[]> {
  const res = await ctx.db.query<Record<string, unknown>>(
    'SELECT * FROM model_run ORDER BY request_started_at')
  const num = (v: unknown): Observed<number> =>
    v === null || v === undefined ? absent('not_observed') : observed(Number(v))

  return res.rows.map((r) => ({
    id: String(r.id),
    taskArchetype: r.task_archetype ? String(r.task_archetype) : null,
    provider: r.provider ? String(r.provider) : null,
    model: r.model ? String(r.model) : null,
    promptVersion: r.prompt_version ? String(r.prompt_version) : null,
    status: String(r.status),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    latencyMs: num(r.latency_ms),
    estimatedCostUsd: num(r.estimated_cost_usd),
    actualCostUsd: num(r.actual_cost_usd),
    priceTableVersion: r.price_table_version ? String(r.price_table_version) : null,
    startedAt: new Date(r.request_started_at as string).toISOString(),
  }))
}

/**
 * How a decision was executed. A deterministic intervention that cost nothing
 * and a missing ModelRun caused by an error are entirely different facts, and
 * `execution_mode` is what tells them apart.
 */
export interface ExecutionModeCount {
  executionMode: string
  decisionRecords: number
  withModelRun: number
  withoutModelRun: number
}

export async function executionModes(
  ctx: AppContext, workstreamId: string,
): Promise<ExecutionModeCount[]> {
  const res = await ctx.db.query<{ execution_mode: string; n: string; with_run: string }>(
    `SELECT execution_mode, count(*)::text AS n,
            count(model_run_id)::text AS with_run
     FROM decision_record WHERE workstream_id = $1
     GROUP BY execution_mode ORDER BY execution_mode`,
    [workstreamId],
  )
  return res.rows.map((r) => ({
    executionMode: r.execution_mode,
    decisionRecords: Number(r.n),
    withModelRun: Number(r.with_run),
    withoutModelRun: Number(r.n) - Number(r.with_run),
  }))
}

/** Context Health as it stood when each decision was taken. */
export async function contextHealthRecords(
  ctx: AppContext, workstreamId: string,
): Promise<{ task: string; state: string; decidedBy: string | null; computedAt: string }[]> {
  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT task, state, decided_by, computed_at FROM context_health
     WHERE workstream_id = $1 ORDER BY computed_at`,
    [workstreamId],
  )
  return res.rows.map((r) => ({
    task: String(r.task),
    state: String(r.state),
    decidedBy: r.decided_by ? String(r.decided_by) : null,
    computedAt: new Date(r.computed_at as string).toISOString(),
  }))
}

export interface CognitionCorrectionRecord {
  rootId: string
  versions: readonly {
    id: string; version: number; cognitionType: string; status: string
    origin: string; declaredAt: string; evidenceCount: number
  }[]
}

/** Declaration chains, so "what did AVA hold at t?" is answerable later. */
export async function cognitionCorrections(
  ctx: AppContext,
): Promise<CognitionCorrectionRecord[]> {
  const all = await ctx.cognition.listAll()
  const byRoot = new Map<string, DeclaredCognition[]>()
  for (const c of all) byRoot.set(c.rootId, [...(byRoot.get(c.rootId) ?? []), c])

  return [...byRoot.entries()].map(([rootId, versions]) => ({
    rootId,
    versions: [...versions].sort((a, b) => a.version - b.version).map((c) => ({
      id: c.id, version: c.version, cognitionType: c.cognitionType, status: c.status,
      origin: c.origin, declaredAt: c.declaredAt.toISOString(),
      evidenceCount: c.evidenceIds.length,
      // Deliberately no `content`. The declaration text is the user's own
      // words about herself; an audit needs the shape of the chain, not a
      // second copy of what she said.
    })),
  }))
}

/**
 * What AVA held as declared cognition at a past instant.
 *
 * The question this exists for is "did AVA remember correctly what I had told
 * her AT THAT MOMENT?" — which cannot be answered from the current state.
 */
export async function declaredCognitionAsOf(
  ctx: AppContext, at: Date,
): Promise<DeclaredCognition[]> {
  const all = await ctx.cognition.listAll()
  const visible = all.filter((c) => c.declaredAt.getTime() <= at.getTime())
  const byRoot = new Map<string, DeclaredCognition>()
  for (const c of visible) {
    const current = byRoot.get(c.rootId)
    if (current === undefined || c.version > current.version) byRoot.set(c.rootId, c)
  }
  return [...byRoot.values()]
}

/** The outcome of an opportunity as it stood at a past instant. */
export async function outcomeAsOf(
  ctx: AppContext, opportunityId: string, at: Date,
): Promise<OutcomeRecord | null> {
  return outcomeAt(await ctx.outcomes.historyFor(opportunityId), at)
}

export type { CurrentFeedback, OutcomeState, UserActionRecord }
