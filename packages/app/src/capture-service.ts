import { ulid, EMPTY_LINEAGE, STATE_PRODUCING_TYPES } from '@ava/core'
import type { EvidenceStrength, StateObjectType, ValidatedCapture } from '@ava/core'
import { INITIAL_STATUS } from '@ava/core'
import { accept, parse, receive, isParseFailure } from '@ava/ingestion'
import type { FieldIssue } from '@ava/core'
import type { Evidence } from '@ava/db'
import type { AppContext } from './context'
import { applyCapture } from './change-service'
import type { ChangeOutcome } from './change-service'

export interface CaptureRequest {
  workstreamId: string
  type: string
  content: string
  title?: string | null
  effectiveAt?: string | null
  supersedesStateObjectId?: string | null
  fields?: Record<string, unknown>
}

export type CaptureOutcome =
  | { ok: true; evidence: Evidence; change: ChangeOutcome | null; notes: string[] }
  | { ok: false; issues: FieldIssue[]; rawInputId: string }

/**
 * Evidence strength for a manual capture.
 *
 * A first-hand statement by the user about her own work, in the scope she
 * declares it, is direct evidence from an authoritative source — ESTABLISHED
 * under baseline §29. This is a rule per class, not a per-item judgement, and
 * it deliberately does not vary with how confident the text sounds.
 */
function strengthFor(capture: ValidatedCapture): EvidenceStrength {
  return capture.contentOrigin === 'user' ? 'ESTABLISHED' : 'SUPPORTED'
}

/**
 * The single capture path: raw -> parse -> validate -> accept -> ledger.
 *
 * Manual input goes through the full quarantine pipeline exactly as a future
 * connector would. That is what makes the boundary testable from day one.
 */
export async function capture(ctx: AppContext, req: CaptureRequest): Promise<CaptureOutcome> {
  const receivedAt = new Date()

  // Plane 1 — untrusted.
  const raw = receive(req.content, req.type, req.workstreamId, receivedAt)
  const rawInputId = ulid(receivedAt.getTime())

  await ctx.telemetry.record({
    eventType: 'capture_initiated',
    occurredAt: receivedAt,
    subjectType: 'raw_input',
    subjectId: rawInputId,
    workstreamId: req.workstreamId,
    payload: { declaredType: req.type },
  })

  // Plane 2 — parse / normalise.
  const parsed = parse(raw, {
    title: req.title ?? null,
    effectiveAt: req.effectiveAt ?? null,
    supersedesStateObjectId: req.supersedesStateObjectId ?? null,
    fields: req.fields ?? {},
  })

  if (isParseFailure(parsed)) {
    await recordRawInput(ctx, rawInputId, raw.rawContent, req, 'rejected', [
      { field: 'content', message: parsed.reason },
    ])
    await ctx.telemetry.record({
      eventType: 'evidence_rejected', occurredAt: new Date(),
      subjectType: 'raw_input', subjectId: rawInputId, workstreamId: req.workstreamId,
      payload: { reason: 'parse_failure' },
    })
    return { ok: false, issues: [{ field: 'content', message: parsed.reason }], rawInputId }
  }

  // Plane 3 — accept.
  const result = accept(parsed, receivedAt)
  if (!result.accepted) {
    // Rejected input is preserved, not discarded.
    await recordRawInput(ctx, rawInputId, raw.rawContent, req, 'rejected', result.issues)
    await ctx.telemetry.record({
      eventType: 'evidence_rejected', occurredAt: new Date(),
      subjectType: 'raw_input', subjectId: rawInputId, workstreamId: req.workstreamId,
      payload: { issueCount: result.issues.length },
    })
    return { ok: false, issues: result.issues, rawInputId }
  }

  const source = await ctx.sources.ensureManualCapture()
  const evidence = await ctx.evidence.append({
    content: result.capture.content,
    contentOrigin: result.capture.contentOrigin,
    sourceRecordId: source.id,
    workstreamId: result.capture.workstreamId,
    captureType: result.capture.type,
    title: result.capture.title,
    observedAt: result.capture.observedAt,
    effectiveAt: result.capture.effectiveAt,
    effectiveAtInferred: result.capture.effectiveAtInferred,
    strength: strengthFor(result.capture),
    sensitivity: result.capture.sensitivity,
    lineage: { ...EMPTY_LINEAGE, producedBy: 'manual_capture' },
    fields: result.capture.fields,
  })

  await recordRawInput(ctx, rawInputId, raw.rawContent, req, 'accepted', [], evidence.id)

  await ctx.telemetry.record({
    eventType: 'evidence_arrived', occurredAt: evidence.observedAt,
    subjectType: 'evidence', subjectId: evidence.id, workstreamId: evidence.workstreamId,
    evidenceStrength: evidence.strength,
    payload: { captureType: evidence.captureType, contentOrigin: evidence.contentOrigin },
  })
  await ctx.telemetry.record({
    eventType: 'evidence_accepted', occurredAt: new Date(),
    subjectType: 'evidence', subjectId: evidence.id, workstreamId: evidence.workstreamId,
  })

  // Capture types that carry state drive the state and change pipeline.
  const change = STATE_PRODUCING_TYPES.includes(result.capture.type) ||
    result.capture.type === 'correction'
    ? await applyCapture(ctx, result.capture, evidence)
    : null

  return { ok: true, evidence, change, notes: result.notes }
}

async function recordRawInput(
  ctx: AppContext, id: string, rawContent: string, req: CaptureRequest,
  stage: 'accepted' | 'rejected', issues: FieldIssue[], evidenceId?: string,
): Promise<void> {
  await ctx.db.query(
    `INSERT INTO raw_input (id, raw_content, declared_type, workstream_id, stage, issues, evidence_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, rawContent, req.type, req.workstreamId, stage, JSON.stringify(issues), evidenceId ?? null],
  )
}

/** Initial status for a state object created from a capture type. */
export function initialStatusFor(type: StateObjectType): string {
  return INITIAL_STATUS[type]
}
