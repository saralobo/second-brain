import { EMPTY_LINEAGE, isGlobalScope, resolveCognitionConflict } from '@ava/core'
import type {
  BehavioralHypothesis, CognitionContext, CognitionScope, CognitionType,
  DeclaredCognition, Sensitivity,
} from '@ava/core'
import type { Evidence } from '@ava/db'
import type { AppContext } from './context'

/**
 * Declared Cognition use cases — the five user actions of spec §2.5:
 * declare, confirm, correct, contextualize, supersede (and revoke/reject).
 *
 * One rule governs every function here: nothing AVA observed can enter this
 * table. A declaration is created only by an explicit declaration, an explicit
 * confirmation, or an explicit correction — and each of the three carries the
 * user's own words into the ledger first, so the declaration always has
 * evidence behind it rather than being a claim AVA made about the user.
 */
export interface DeclareRequest {
  content: string
  cognitionType: CognitionType
  scope?: CognitionScope
  audience?: string | null
  workstreamId?: string | null
  sensitivity?: Sensitivity
  declaredAt?: Date
  effectiveAt?: Date | null
}

export interface CognitionOutcome {
  cognition: DeclaredCognition
  evidence: Evidence
  /** Present for a correction: the version that has just been replaced. */
  superseded: DeclaredCognition | null
}

/**
 * Writes the user's words to the ledger.
 *
 * Declared Cognition is a projection over evidence, never a second store of
 * truth. If the two ever disagree, the ledger wins — which is only possible
 * because the words live there first.
 */
async function recordDeclarationEvidence(
  ctx: AppContext,
  content: string,
  cognitionType: CognitionType,
  workstreamId: string | null,
  declaredAt: Date,
  sensitivity: Sensitivity,
): Promise<Evidence> {
  const source = await ctx.sources.ensureManualCapture()
  return ctx.evidence.append({
    content,
    contentOrigin: 'user',
    sourceRecordId: source.id,
    workstreamId,
    captureType: cognitionType === 'principle' ? 'principle' : 'preference',
    title: null,
    observedAt: declaredAt,
    effectiveAt: null,
    effectiveAtInferred: false,
    // A first-hand statement by the user about her own criteria is direct
    // evidence from an authoritative source, inside the scope she declared.
    strength: 'ESTABLISHED',
    sensitivity,
    lineage: { ...EMPTY_LINEAGE, producedBy: 'declared_cognition' },
    fields: { cognitionType },
  })
}

/**
 * Projects a declaration from evidence that is ALREADY in the ledger.
 *
 * This is the single write path for a new declaration, used both by the
 * capture pipeline (where a `preference` or `principle` capture has already
 * produced evidence) and by `declareCognition`. Keeping one path is what stops
 * the two representations from drifting apart: Declared Cognition is always a
 * projection over ledger rows, never a parallel store of what the user said.
 */
export async function declareFromEvidence(
  ctx: AppContext,
  evidence: Evidence,
  req: {
    cognitionType: CognitionType
    scope?: CognitionScope
    audience?: string | null
    effectiveAt?: Date | null
  },
): Promise<DeclaredCognition> {
  const cognition = await ctx.cognition.declare({
    content: evidence.content,
    cognitionType: req.cognitionType,
    scope: req.scope ?? {},
    audience: req.audience ?? null,
    declaredAt: evidence.observedAt,
    effectiveAt: req.effectiveAt ?? evidence.effectiveAt,
    origin: 'declared',
    evidenceIds: [evidence.id],
    workstreamId: evidence.workstreamId,
    sensitivity: evidence.sensitivity,
  })

  await ctx.memory.upsert({
    memoryClass: 'declared_cognition',
    refId: cognition.id,
    refType: 'declared_cognition',
    title: evidence.content,
    derivedFromEvidenceIds: [evidence.id],
    strength: 'ESTABLISHED',
    workstreamId: evidence.workstreamId,
  })

  await ctx.telemetry.record({
    eventType: 'cognition_declared', occurredAt: evidence.observedAt,
    subjectType: 'declared_cognition', subjectId: cognition.id,
    workstreamId: evidence.workstreamId, evidenceStrength: 'ESTABLISHED',
    payload: {
      cognitionType: req.cognitionType,
      scoped: !isGlobalScope(req.scope ?? {}),
    },
  })

  return cognition
}

/** Action: DECLARE. */
export async function declareCognition(
  ctx: AppContext, req: DeclareRequest,
): Promise<CognitionOutcome> {
  const declaredAt = req.declaredAt ?? new Date()
  const sensitivity = req.sensitivity ?? 'normal'

  const evidence = await recordDeclarationEvidence(
    ctx, req.content, req.cognitionType, req.workstreamId ?? null, declaredAt, sensitivity)

  const cognition = await declareFromEvidence(ctx, evidence, {
    cognitionType: req.cognitionType,
    scope: req.scope,
    audience: req.audience,
    effectiveAt: req.effectiveAt,
  })

  return { cognition, evidence, superseded: null }
}

export interface CorrectionRequest {
  /** The declaration being corrected. Its chain gains a new version. */
  cognitionId: string
  content: string
  scope?: CognitionScope
  cognitionType?: CognitionType
  declaredAt?: Date
  /** `contextualize` narrows scope; `correct` replaces the statement. */
  kind?: 'correct' | 'contextualize'
}

/**
 * Actions: CORRECT and CONTEXTUALIZE.
 *
 * A correction never overwrites. It writes new evidence, appends a new version
 * to the chain, marks the previous version superseded, and rebuilds every
 * derived view that leaned on the old wording. The old version stays fully
 * readable — that is what makes "what did AVA know then?" answerable.
 */
export async function correctCognition(
  ctx: AppContext, req: CorrectionRequest,
): Promise<CognitionOutcome> {
  const previous = await ctx.cognition.findById(req.cognitionId)
  if (!previous) throw new Error(`unknown declaration ${req.cognitionId}`)

  const latest = await ctx.cognition.latestVersion(previous.rootId)
  if (!latest) throw new Error('declaration chain is broken')

  // Correcting an older version would fork the chain into two "current"
  // positions and neither could be trusted. Redirecting silently to the
  // latest one would be worse still: the user would think she had corrected
  // the sentence she was looking at. So this refuses, and names the current
  // version so she can act on the right one.
  if (previous.id !== latest.id) {
    throw new Error(
      `declaration ${previous.id} has already been replaced by ${latest.id};` +
      ' correct the current version instead',
    )
  }
  if (latest.status !== 'active') {
    throw new Error('this declaration is no longer active; it cannot be corrected')
  }

  const declaredAt = req.declaredAt ?? new Date()
  const kind = req.kind ?? 'correct'

  const evidence = await recordDeclarationEvidence(
    ctx, req.content, req.cognitionType ?? latest.cognitionType,
    latest.workstreamId, declaredAt, latest.sensitivity)

  const successor = await ctx.cognition.declare({
    content: req.content,
    cognitionType: req.cognitionType ?? latest.cognitionType,
    scope: req.scope ?? latest.scope,
    audience: latest.audience,
    declaredAt,
    effectiveAt: null,
    origin: 'corrected',
    // The chain keeps every statement that produced it, so the current
    // version can still be traced to the words that started it.
    evidenceIds: [...latest.evidenceIds, evidence.id],
    workstreamId: latest.workstreamId,
    sensitivity: latest.sensitivity,
    rootId: latest.rootId,
    version: latest.version + 1,
  })

  await ctx.cognition.markSuperseded(latest.id, successor.id)

  await ctx.memory.upsert({
    memoryClass: 'declared_cognition',
    refId: successor.id,
    refType: 'declared_cognition',
    title: req.content,
    derivedFromEvidenceIds: [...successor.evidenceIds],
    strength: 'ESTABLISHED',
    workstreamId: latest.workstreamId,
  })

  // Views built on the old wording are invalidated and rebuilt, never served.
  const stale = await ctx.memory.markViewsStale([...latest.evidenceIds])

  await ctx.telemetry.record({
    eventType: kind === 'contextualize' ? 'cognition_contextualized' : 'cognition_corrected',
    occurredAt: declaredAt,
    subjectType: 'declared_cognition', subjectId: successor.id,
    workstreamId: latest.workstreamId, evidenceStrength: 'ESTABLISHED',
    payload: { supersededId: latest.id, version: successor.version, viewsInvalidated: stale },
  })
  await ctx.telemetry.record({
    eventType: 'cognition_superseded', occurredAt: new Date(),
    subjectType: 'declared_cognition', subjectId: latest.id,
    workstreamId: latest.workstreamId,
    payload: { supersededBy: successor.id },
  })

  const replaced = await ctx.cognition.findById(latest.id)
  return { cognition: successor, evidence, superseded: replaced }
}

/**
 * Action: CONFIRM.
 *
 * Confirming a hypothesis creates a DECLARATION from it. The hypothesis is
 * not promoted — it is marked `confirmed` and keeps the audit trail, while the
 * new declaration carries the authority. That ordering is the whole point:
 * authority comes from the user saying so, never from the system's own
 * accumulated confidence in its guess.
 */
export async function confirmHypothesis(
  ctx: AppContext,
  hypothesisId: string,
  req: { content: string; cognitionType: CognitionType; scope?: CognitionScope; declaredAt?: Date },
): Promise<CognitionOutcome> {
  const hypothesis = await ctx.hypotheses.findById(hypothesisId)
  if (!hypothesis) throw new Error(`unknown hypothesis ${hypothesisId}`)

  const declaredAt = req.declaredAt ?? new Date()
  const evidence = await recordDeclarationEvidence(
    ctx, req.content, req.cognitionType, hypothesis.workstreamId, declaredAt, hypothesis.sensitivity)

  const cognition = await ctx.cognition.declare({
    content: req.content,
    cognitionType: req.cognitionType,
    scope: req.scope ?? hypothesis.scope,
    declaredAt,
    origin: 'confirmed',
    evidenceIds: [evidence.id],
    confirmsHypothesisId: hypothesis.id,
    workstreamId: hypothesis.workstreamId,
    sensitivity: hypothesis.sensitivity,
  })

  await ctx.hypotheses.markConfirmed(hypothesis.id, cognition.id)

  await ctx.memory.upsert({
    memoryClass: 'declared_cognition',
    refId: cognition.id,
    refType: 'declared_cognition',
    title: req.content,
    derivedFromEvidenceIds: [evidence.id],
    strength: 'ESTABLISHED',
    workstreamId: hypothesis.workstreamId,
  })

  await ctx.telemetry.record({
    eventType: 'cognition_confirmed', occurredAt: declaredAt,
    subjectType: 'declared_cognition', subjectId: cognition.id,
    workstreamId: hypothesis.workstreamId, evidenceStrength: 'ESTABLISHED',
    payload: { fromHypothesis: hypothesis.id },
  })

  return { cognition, evidence, superseded: null }
}

/** Action: SUPERSEDE without replacement — the declaration stops applying. */
export async function revokeCognition(
  ctx: AppContext, cognitionId: string, reason: string,
): Promise<void> {
  const existing = await ctx.cognition.findById(cognitionId)
  if (!existing) throw new Error(`unknown declaration ${cognitionId}`)

  await ctx.cognition.revoke(cognitionId)
  await ctx.memory.markViewsStale([...existing.evidenceIds])

  await ctx.telemetry.record({
    eventType: 'cognition_revoked', occurredAt: new Date(),
    subjectType: 'declared_cognition', subjectId: cognitionId,
    workstreamId: existing.workstreamId,
    payload: { reason },
  })
}

/** Action: REJECT — the user says an observed pattern is wrong about them. */
export async function rejectHypothesis(
  ctx: AppContext, hypothesisId: string, reason: string,
): Promise<void> {
  const h = await ctx.hypotheses.findById(hypothesisId)
  if (!h) throw new Error(`unknown hypothesis ${hypothesisId}`)

  await ctx.hypotheses.reject(hypothesisId, reason)
  await ctx.telemetry.record({
    eventType: 'hypothesis_rejected', occurredAt: new Date(),
    subjectType: 'behavioral_hypothesis', subjectId: hypothesisId,
    workstreamId: h.workstreamId,
    payload: { reason },
  })
}

/**
 * Records a conflict between an observed pattern and an explicit declaration.
 *
 * The declaration always stands. Recording the disagreement is what lets the
 * system ASK later, which spec §15.1 makes the only legitimate route to
 * changing declared knowledge.
 */
export async function reconcileCognition(
  ctx: AppContext,
  ctxQuery: CognitionContext,
  workstreamId: string | null,
): Promise<{ declarations: DeclaredCognition[]; hypotheses: BehavioralHypothesis[]; conflicts: number }> {
  const [declarations, hypotheses] = await Promise.all([
    ctx.cognition.listActive(workstreamId),
    ctx.hypotheses.list(workstreamId),
  ])

  const resolution = resolveCognitionConflict(declarations, hypotheses, ctxQuery)
  for (const c of resolution.conflicts) {
    await ctx.hypotheses.recordConflict(c.hypothesisId, c.declarationId, c.detail)
    await ctx.telemetry.record({
      eventType: 'hypothesis_conflict_recorded', occurredAt: new Date(),
      subjectType: 'behavioral_hypothesis', subjectId: c.hypothesisId,
      workstreamId,
      payload: { declarationId: c.declarationId },
    })
  }
  return { declarations, hypotheses, conflicts: resolution.conflicts.length }
}
