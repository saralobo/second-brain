import { ulid } from '@ava/core'
import type { ContextHealthResult, ContextPacket, Exclusion } from '@ava/core'
import type { Database } from '../client'

/**
 * DecisionRecord persistence (S3-T09, spec §14.2).
 *
 * Append-only at the database. A rationale edited after the fact is a
 * fabricated rationale, and this table exists precisely to prevent that.
 */
export type ExecutionMode = 'mock' | 'external' | 'local_only'

export interface DecisionRecordInput {
  kind: string
  workstreamId: string | null
  request: string
  queryKind: string
  retrievalResultIds: readonly string[]
  packet: ContextPacket
  excluded: readonly Exclusion[]
  contextHealthId: string | null
  contextHealthState: string
  provider: string | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  modelRunId: string | null
  executionMode: ExecutionMode
  groundingValid: boolean | null
  groundingFailures: readonly { kind: string; detail: string }[]
  answer: string | null
  answerEvidenceIds: readonly string[]
  uncertainties: readonly string[]
  abstained: boolean
  abstentionReason: string | null
  fallbackUsed: boolean
  errorDetail: string | null
  /** Cognition actually applied (Slice 4 brief §27). */
  declaredCognitionIds?: readonly string[]
  hypothesisIds?: readonly string[]
  knowledgeIds?: readonly string[]
  cognitiveAuthority?: string | null
  scopeMatch?: Record<string, unknown>
}

export interface DecisionRecordRow {
  id: string
  kind: string
  workstreamId: string | null
  request: string
  queryKind: string
  retrievalResultIds: string[]
  packet: SerialisedPacket
  packetEvidenceIds: string[]
  excluded: Exclusion[]
  contextHealthState: string | null
  provider: string | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  modelRunId: string | null
  executionMode: ExecutionMode
  groundingValid: boolean | null
  groundingFailures: { kind: string; detail: string }[]
  answer: string | null
  answerEvidenceIds: string[]
  uncertainties: string[]
  abstained: boolean
  abstentionReason: string | null
  fallbackUsed: boolean
  errorDetail: string | null
  declaredCognitionIds: string[]
  hypothesisIds: string[]
  knowledgeIds: string[]
  cognitiveAuthority: string | null
  scopeMatch: Record<string, unknown>
  decidedAt: Date
}

/**
 * What we keep of the packet: structure and references, never a second copy
 * of evidence content. The ledger already holds the content, and duplicating
 * it here would create a shadow copy that no annotation could reclassify.
 */
export interface SerialisedPacket {
  question: string
  queryKind: string
  health: ContextHealthResult
  retrieved: {
    evidenceId: string
    score: number
    reason: string
    contentOrigin: string
    strength: string
    sensitivity: string
    observedAt: string
    supersededByObjectVersion: string | null
  }[]
  currentState: { objectId: string; title: string; status: string; version: number }[]
  supersededState: { objectId: string; title: string; version: number }[]
  changes: { changeId: string; objectId: string; changeType: string }[]
  conflicts: string[]
  gaps: string[]
  providerEligibleEvidenceIds: string[]
  declaredCognition: {
    cognitionId: string; content: string; cognitionType: string
    scopeDescription: string; matchReason: string; authority: string
  }[]
  behavioralHypotheses: {
    hypothesisId: string; falsifiableDescription: string; context: string; status: string
  }[]
  stabilizedKnowledge: { memoryRecordId: string; title: string; strength: string }[]
}

export function serialisePacket(p: ContextPacket): SerialisedPacket {
  return {
    question: p.question,
    queryKind: p.query.kind,
    health: p.health,
    retrieved: p.retrieved.map((r) => ({
      evidenceId: r.evidenceId,
      score: r.score,
      reason: r.reason,
      contentOrigin: r.contentOrigin,
      strength: r.strength,
      sensitivity: r.sensitivity,
      observedAt: r.observedAt.toISOString(),
      supersededByObjectVersion: r.supersededByObjectVersion,
    })),
    currentState: p.currentState.map((s) => ({
      objectId: s.objectId, title: s.title, status: s.status, version: s.version,
    })),
    supersededState: p.supersededState.map((s) => ({
      objectId: s.objectId, title: s.title, version: s.version,
    })),
    changes: p.changes.map((c) => ({
      changeId: c.changeId, objectId: c.objectId, changeType: c.changeType,
    })),
    conflicts: [...p.conflicts],
    gaps: [...p.gaps],
    providerEligibleEvidenceIds: [...p.providerEligibleEvidenceIds],
    declaredCognition: p.declaredCognition.map((c) => ({
      cognitionId: c.cognitionId, content: c.content, cognitionType: c.cognitionType,
      scopeDescription: c.scopeDescription, matchReason: c.matchReason, authority: c.authority,
    })),
    behavioralHypotheses: p.behavioralHypotheses.map((h) => ({
      hypothesisId: h.hypothesisId, falsifiableDescription: h.falsifiableDescription,
      context: h.context, status: h.status,
    })),
    stabilizedKnowledge: p.stabilizedKnowledge.map((k) => ({
      memoryRecordId: k.memoryRecordId, title: k.title, strength: k.strength,
    })),
  }
}

export class DecisionRecordRepository {
  constructor(private readonly db: Database) {}

  async append(input: DecisionRecordInput): Promise<string> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO decision_record (
         id, kind, workstream_id, request, query_kind, retrieval_result_ids,
         context_packet, packet_evidence_ids, excluded_evidence,
         context_health_id, context_health_state,
         provider, model, prompt_id, prompt_version, model_run_id, execution_mode,
         grounding_valid, grounding_failures, answer, answer_evidence_ids,
         uncertainties, abstained, abstention_reason, fallback_used, error_detail,
         declared_cognition_ids, hypothesis_ids, knowledge_ids, cognitive_authority, scope_match
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        id, input.kind, input.workstreamId, input.request, input.queryKind,
        JSON.stringify(input.retrievalResultIds),
        JSON.stringify(serialisePacket(input.packet)),
        JSON.stringify(input.packet.providerEligibleEvidenceIds),
        JSON.stringify(input.excluded),
        input.contextHealthId, input.contextHealthState,
        input.provider, input.model, input.promptId, input.promptVersion,
        input.modelRunId, input.executionMode,
        input.groundingValid, JSON.stringify(input.groundingFailures),
        input.answer, JSON.stringify(input.answerEvidenceIds),
        JSON.stringify(input.uncertainties), input.abstained, input.abstentionReason,
        input.fallbackUsed, input.errorDetail,
        JSON.stringify(input.declaredCognitionIds ?? []),
        JSON.stringify(input.hypothesisIds ?? []),
        JSON.stringify(input.knowledgeIds ?? []),
        input.cognitiveAuthority ?? null,
        JSON.stringify(input.scopeMatch ?? {}),
      ],
    )
    return id
  }

  async findById(id: string): Promise<DecisionRecordRow | null> {
    const res = await this.db.query('SELECT * FROM decision_record WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toRecord(row) : null
  }

  async listByWorkstream(workstreamId: string, limit = 25): Promise<DecisionRecordRow[]> {
    const res = await this.db.query(
      'SELECT * FROM decision_record WHERE workstream_id = $1 ORDER BY decided_at DESC LIMIT $2',
      [workstreamId, limit],
    )
    return res.rows.map(toRecord)
  }
}

function toRecord(r: Record<string, unknown>): DecisionRecordRow {
  return {
    id: String(r.id),
    kind: String(r.kind),
    workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    request: String(r.request),
    queryKind: String(r.query_kind),
    retrievalResultIds: (r.retrieval_result_ids ?? []) as string[],
    packet: (r.context_packet ?? {}) as SerialisedPacket,
    packetEvidenceIds: (r.packet_evidence_ids ?? []) as string[],
    excluded: (r.excluded_evidence ?? []) as Exclusion[],
    contextHealthState: r.context_health_state ? String(r.context_health_state) : null,
    provider: r.provider ? String(r.provider) : null,
    model: r.model ? String(r.model) : null,
    promptId: r.prompt_id ? String(r.prompt_id) : null,
    promptVersion: r.prompt_version ? String(r.prompt_version) : null,
    modelRunId: r.model_run_id ? String(r.model_run_id) : null,
    executionMode: r.execution_mode as ExecutionMode,
    groundingValid: r.grounding_valid === null || r.grounding_valid === undefined
      ? null : Boolean(r.grounding_valid),
    groundingFailures: (r.grounding_failures ?? []) as { kind: string; detail: string }[],
    answer: r.answer ? String(r.answer) : null,
    answerEvidenceIds: (r.answer_evidence_ids ?? []) as string[],
    uncertainties: (r.uncertainties ?? []) as string[],
    abstained: Boolean(r.abstained),
    abstentionReason: r.abstention_reason ? String(r.abstention_reason) : null,
    fallbackUsed: Boolean(r.fallback_used),
    errorDetail: r.error_detail ? String(r.error_detail) : null,
    declaredCognitionIds: (r.declared_cognition_ids ?? []) as string[],
    hypothesisIds: (r.hypothesis_ids ?? []) as string[],
    knowledgeIds: (r.knowledge_ids ?? []) as string[],
    cognitiveAuthority: r.cognitive_authority ? String(r.cognitive_authority) : null,
    scopeMatch: (r.scope_match ?? {}) as Record<string, unknown>,
    decidedAt: new Date(r.decided_at as string),
  }
}
