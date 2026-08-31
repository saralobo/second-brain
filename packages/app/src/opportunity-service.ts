import {
  POLICY_VERSION, RULE_VERSION, applicableDeclarations, assembleOpportunity,
  detectOpportunities, identityKeyFor, isMateriallyChanged,
} from '@ava/core'
import type {
  DeclaredCognition, DetectedCondition, OpportunityCandidate, StateObjectVersion,
} from '@ava/core'
import { OPPORTUNITY_GENERATION_DIMENSIONS, assessHealth } from '@ava/retrieval'
import type { StoredOpportunity } from '@ava/db'
import type { AppContext } from './context'
import { currentStateQuiet } from './change-service'
import { proactivePacket } from './proactive-packet'

/**
 * Opportunity generation (S5-T04…T09).
 *
 * The path is fixed: Change → Impact → candidate → gates → policies. Nothing
 * here sweeps the corpus looking for something interesting to say. A delta is
 * the trigger, declared relations carry it one or two steps, and that is all.
 *
 * No model participates. Milestone 4 works with the provider switched off.
 */
const TASK = 'opportunity_generation'

export interface GenerationResult {
  checkpointId: string | null
  generated: StoredOpportunity[]
  /** Conditions that matched an existing live opportunity. */
  deduplicated: { identityKey: string; existingId: string }[]
  contextHealth: string
  healthId: string
}

export async function generateOpportunities(
  ctx: AppContext, workstreamId: string, now: Date = new Date(),
): Promise<GenerationResult> {
  const checkpoint = await ctx.checkpoints.current(workstreamId)
  const lastClosed = await ctx.checkpoints.lastClosed(workstreamId)
  const since = lastClosed?.closedAt ?? null

  const view = await currentStateQuiet(ctx, workstreamId, now)
  const current = view.entries.map((e) => e.current)
  const changes = await ctx.changes.listByWorkstream(workstreamId, 200)
  const relationships = await ctx.state.relationships()

  // Everything AVA can see right now, captured before anything is decided.
  // This snapshot is what the anti-retroactivity invariant is written from.
  const knownEvidence = await ctx.evidence.listKnownAt(workstreamId, now)
  const knownEvidenceIds = knownEvidence.map((e) => e.id)
  const knownStateVersionIds = current.map((v) => v.id)
  const latestEvidenceObservedAt = knownEvidence.reduce<Date | null>(
    (max, e) => (max === null || e.observedAt > max ? e.observedAt : max), null)

  const health = assessHealth({
    queryKind: 'state',
    materialOverride: OPPORTUNITY_GENERATION_DIMENSIONS,
    signals: await ctx.retrieval.healthSignals(workstreamId),
    retrieved: [],
    withheldCount: 0,
    withheldMaterial: false,
    declaredCognitionCount: 0,
    hypothesisCount: 0,
    now,
  })
  const healthId = await ctx.contextHealth.record(TASK, workstreamId, health)

  const declarations = await ctx.cognition.listActive(workstreamId)
  const hypotheses = await ctx.hypotheses.list(workstreamId)
  const goalIds = current.filter((v) => v.type === 'goal' && v.status === 'active')
    .map((v) => v.objectId)

  const conditions = detectOpportunities({
    workstreamId, now, current, changes, relationships, since,
  })

  const generated: StoredOpportunity[] = []
  const deduplicated: { identityKey: string; existingId: string }[] = []

  for (const condition of conditions) {
    const identityKey = identityKeyFor({
      opportunityClass: condition.opportunityClass,
      workstreamId,
      subjectObjectId: condition.subjectObjectId,
      affectedObjectIds: condition.affectedObjects.map((a) => a.objectId),
    })
    const existing = await ctx.opportunities.activeByIdentity(identityKey)

    let version = 1
    let supersedes: string | null = null
    if (existing !== null) {
      const moved = isMateriallyChanged(existing, {
        triggerChangeIds: condition.triggerChangeIds,
        affectedObjects: condition.affectedObjects,
        strength: condition.strength,
      })
      if (!moved.changed) {
        // The same live condition. One opportunity, not one per checkpoint.
        deduplicated.push({ identityKey, existingId: existing.id })
        continue
      }
      version = existing.version + 1
      supersedes = existing.id
    }

    const candidate = await assembleFor(ctx, {
      condition, now, health: health.state, declarations, hypotheses, goalIds,
      checkpointId: checkpoint?.id ?? null,
      knownEvidenceIds, knownStateVersionIds, latestEvidenceObservedAt,
      identityKey, version, supersedes, current,
    })

    if (supersedes !== null) {
      await ctx.opportunities.markStatus(supersedes, 'superseded', now,
        'a new version of this condition replaced it')
    }

    const shadowIds = relevantHypothesisIds(hypotheses, workstreamId)
    await ctx.opportunities.save({
      candidate,
      ruleId: condition.ruleId,
      ruleVersion: condition.ruleVersion,
      policyVersion: POLICY_VERSION,
      shadowHypothesisIds: shadowIds,
      suppressedReason: candidate.status === 'suppressed'
        ? candidate.gates.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.reason}`).join(' · ')
        : null,
    })

    await recordGenerationDecision(ctx, candidate, condition, healthId)

    await ctx.telemetry.record({
      eventType: 'opportunity_generated', occurredAt: now,
      subjectType: 'opportunity', subjectId: candidate.id, workstreamId,
      contextHealth: candidate.contextHealth, evidenceStrength: candidate.strength,
      payload: {
        opportunityClass: candidate.opportunityClass,
        ruleId: condition.ruleId,
        version: candidate.version,
        triggerChangeIds: candidate.triggerChangeIds,
      },
    })
    if (candidate.status === 'eligible') {
      await ctx.telemetry.record({
        eventType: 'opportunity_eligible', occurredAt: now,
        subjectType: 'opportunity', subjectId: candidate.id, workstreamId,
        payload: { showReasons: candidate.show.reasons },
      })
    }
    if (candidate.status === 'suppressed' || candidate.show.verdict !== 'PASS') {
      await ctx.telemetry.record({
        eventType: 'opportunity_suppressed', occurredAt: now,
        subjectType: 'opportunity', subjectId: candidate.id, workstreamId,
        payload: { verdict: candidate.show.verdict, reasons: candidate.show.reasons },
      })
    }

    const stored = await ctx.opportunities.findById(candidate.id)
    if (stored !== null) generated.push(stored)
  }

  return { checkpointId: checkpoint?.id ?? null, generated, deduplicated,
    contextHealth: health.state, healthId }
}

interface AssembleArgs {
  condition: DetectedCondition
  now: Date
  health: 'HEALTHY' | 'DEGRADED' | 'INSUFFICIENT'
  declarations: readonly DeclaredCognition[]
  hypotheses: readonly { id: string; workstreamId: string | null }[]
  goalIds: readonly string[]
  checkpointId: string | null
  knownEvidenceIds: readonly string[]
  knownStateVersionIds: readonly string[]
  latestEvidenceObservedAt: Date | null
  identityKey: string
  version: number
  supersedes: string | null
  current: readonly StateObjectVersion[]
}

async function assembleFor(ctx: AppContext, args: AssembleArgs): Promise<OpportunityCandidate> {
  const c = args.condition

  // Effective sensitivity, resolved from annotations rather than from the
  // capture-time value: a later reclassification must be able to pull an item
  // out of proactive surfacing.
  const sensitivities = await ctx.evidence.effectiveSensitivities(c.originEvidenceIds)
  const sensitivity = [...sensitivities.values()].includes('restricted') ? 'restricted'
    : [...sensitivities.values()].includes('sensitive') ? 'sensitive' : 'normal'

  const found = await ctx.evidence.findByIds(c.originEvidenceIds)
  const evidenceExists = found.length === c.originEvidenceIds.length && found.length > 0

  // Only declarations whose scope actually matches this situation apply.
  const applicable = applicableDeclarations(args.declarations, {
    workstreamId: c.workstreamId,
    activity: 'proactive_surfacing',
    artifactType: c.subjectType,
    at: args.now,
  }).map((a) => a.declaration)

  const everShown = await ctx.opportunities.everShown(args.identityKey)

  const candidate = assembleOpportunity({
    condition: c,
    now: args.now,
    contextHealth: args.health,
    sensitivity,
    evidenceExists,
    applicableDeclarations: applicable,
    shadowHypothesisIds: relevantHypothesisIds(args.hypotheses, c.workstreamId),
    previouslyShown: everShown,
    materiallyChangedSinceShown: args.version > 1,
    relatedGoalIds: args.goalIds,
    // No model is used to generate an opportunity, so no external spend is
    // authorised at this stage. Preparation asks the budget separately.
    budgetAllowed: false,
    budgetReason: 'no preparation budget was requested during generation',
    structuredOutputValid: true,
    checkpointId: args.checkpointId,
    knownEvidenceIds: args.knownEvidenceIds,
    knownStateVersionIds: args.knownStateVersionIds,
    latestEvidenceObservedAt: args.latestEvidenceObservedAt,
    version: args.version,
    supersedesOpportunityId: args.supersedes,
  })
  return { ...candidate, identityKey: args.identityKey }
}

/** Hypotheses carried alongside for display. No policy reads this list. */
function relevantHypothesisIds(
  hypotheses: readonly { id: string; workstreamId: string | null }[], workstreamId: string,
): string[] {
  return hypotheses.filter((h) => h.workstreamId === null || h.workstreamId === workstreamId)
    .map((h) => h.id)
}

/**
 * The generation DecisionRecord.
 *
 * It records only reasons that actually participated — the rule that fired,
 * the gates that ran, the verdicts the three policies returned. Nothing is
 * narrated afterwards to make the decision look better than it was.
 */
async function recordGenerationDecision(
  ctx: AppContext, candidate: OpportunityCandidate, condition: DetectedCondition, healthId: string,
): Promise<string> {
  return ctx.decisionRecords.append({
    kind: 'opportunity_generation',
    workstreamId: candidate.workstreamId,
    request: `${condition.ruleId} over changes since the last checkpoint`,
    queryKind: 'change',
    retrievalResultIds: candidate.originEvidenceIds,
    packet: proactivePacket({
      id: candidate.id, question: candidate.headline,
      health: candidate.contextHealth, at: candidate.generation.generatedAt,
    }),
    excluded: [],
    contextHealthId: healthId,
    contextHealthState: candidate.contextHealth,
    provider: null, model: null, promptId: null, promptVersion: null, modelRunId: null,
    executionMode: 'local_only',
    groundingValid: candidate.gates.results.find((g) => g.id === 'grounding')?.passed ?? null,
    groundingFailures: candidate.gates.results.filter((g) => !g.passed)
      .map((g) => ({ kind: g.id, detail: g.reason })),
    answer: candidate.headline,
    answerEvidenceIds: candidate.originEvidenceIds,
    uncertainties: [
      ...candidate.investigate.reasons.map((r) => `investigate: ${r}`),
      ...candidate.show.reasons.map((r) => `show: ${r}`),
      ...candidate.prepare.reasons.map((r) => `prepare: ${r}`),
    ],
    abstained: candidate.status === 'suppressed',
    abstentionReason: candidate.status === 'suppressed'
      ? `gates blocked: ${candidate.gates.blockedBy.join(', ')}` : null,
    fallbackUsed: false,
    errorDetail: null,
    declaredCognitionIds: candidate.valueVector.permissionScope.derivedFrom,
    hypothesisIds: [],
    knowledgeIds: [],
    cognitiveAuthority: candidate.valueVector.permissionScope.derivedFrom.length > 0
      ? 'declaration' : 'none',
    scopeMatch: {
      ruleId: condition.ruleId,
      ruleVersion: condition.ruleVersion,
      policyVersion: candidate.show.version,
      opportunityId: candidate.id,
      investigate: candidate.investigate.verdict,
      show: candidate.show.verdict,
      prepare: candidate.prepare.verdict,
    },
  })
}

/** Opens a checkpoint window. */
export async function openCheckpoint(ctx: AppContext, workstreamId: string, now = new Date()) {
  const existing = await ctx.checkpoints.current(workstreamId)
  if (existing !== null) return existing
  const cp = await ctx.checkpoints.open(workstreamId, now)
  await ctx.telemetry.record({
    eventType: 'checkpoint_opened', occurredAt: now,
    subjectType: 'checkpoint', subjectId: cp.id, workstreamId,
  })
  return cp
}

/**
 * Closes a checkpoint. This is what gives "since the last checkpoint" a
 * definition, and it is manual on purpose (spec §2.1).
 */
export async function closeCheckpoint(
  ctx: AppContext, workstreamId: string, note: string | null = null, now = new Date(),
) {
  const cp = await ctx.checkpoints.current(workstreamId)
  if (cp === null) return null
  await ctx.checkpoints.close(cp.id, now, note)
  await ctx.telemetry.record({
    eventType: 'checkpoint_closed', occurredAt: now,
    subjectType: 'checkpoint', subjectId: cp.id, workstreamId,
  })
  await ctx.checkpoints.open(workstreamId, now)
  return cp
}
