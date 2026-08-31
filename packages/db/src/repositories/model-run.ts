import { ulid } from '@ava/core'
import type { Database } from '../client'

/**
 * ModelRun persistence.
 *
 * The record is written in `PENDING` **before** the external call, so a crash,
 * a timeout or a killed process still leaves a trace. Writing it after success
 * would silently drop the failures ADR-21 Gate B needs to measure.
 */
export type ModelRunStatus = 'PENDING' | 'COMPLETE' | 'FAILED' | 'DENIED' | 'ABORTED'

export interface ModelRunStart {
  provider: string
  model: string
  archetype: string
  purpose: string
  promptId: string
  promptVersion: string
  evidenceIds: string[]
  sensitivitySummary: Record<string, number>
  redactionApplied: string[]
  estimatedCostUsd: number | null
  priceTableVersion: string | null
  requestStartedAt: Date
}

export interface ModelRunFinish {
  status: Exclude<ModelRunStatus, 'PENDING'>
  modelIdentifier?: string | null
  /** null means unknown. Never record unknown usage as zero. */
  inputTokens?: number | null
  outputTokens?: number | null
  actualCostUsd?: number | null
  responseCompletedAt?: Date | null
  retryCount?: number
  errorKind?: string | null
  /** Must never contain payload content. */
  errorDetail?: string | null
  fallbackUsed?: boolean
  denialReason?: string | null
}

export interface ModelRunRow {
  id: string
  provider: string
  model: string
  model_identifier: string | null
  archetype: string
  purpose: string
  prompt_id: string
  prompt_version: string
  evidence_ids: string[]
  sensitivity_summary: Record<string, number>
  redaction_applied: string[]
  request_started_at: string
  response_completed_at: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost_usd: string | null
  actual_cost_usd: string | null
  price_table_version: string | null
  status: ModelRunStatus
  retry_count: number
  error_kind: string | null
  error_detail: string | null
  fallback_used: boolean
  denial_reason: string | null
}

export class ModelRunRepository {
  constructor(private readonly db: Database) {}

  /** Opens a run in PENDING. Call this before the provider, always. */
  async begin(input: ModelRunStart): Promise<string> {
    const id = ulid(input.requestStartedAt.getTime())
    await this.db.query(
      `INSERT INTO model_run (
         id, provider, model, archetype, purpose, prompt_id, prompt_version,
         evidence_ids, sensitivity_summary, redaction_applied,
         request_started_at, estimated_cost_usd, price_table_version, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDING')`,
      [
        id, input.provider, input.model, input.archetype, input.purpose,
        input.promptId, input.promptVersion,
        JSON.stringify(input.evidenceIds), JSON.stringify(input.sensitivitySummary),
        JSON.stringify(input.redactionApplied),
        input.requestStartedAt.toISOString(),
        input.estimatedCostUsd, input.priceTableVersion,
      ],
    )
    return id
  }

  /** Settles a run. Latency is derived from the two recorded timestamps. */
  async finish(id: string, result: ModelRunFinish): Promise<void> {
    const completedAt = result.responseCompletedAt ?? new Date()
    await this.db.query(
      `UPDATE model_run SET
         status = $2,
         model_identifier = $3,
         input_tokens = $4,
         output_tokens = $5,
         actual_cost_usd = $6,
         response_completed_at = $7,
         latency_ms = EXTRACT(EPOCH FROM ($7::timestamptz - request_started_at)) * 1000,
         retry_count = $8,
         error_kind = $9,
         error_detail = $10,
         fallback_used = $11,
         denial_reason = $12
       WHERE id = $1`,
      [
        id, result.status, result.modelIdentifier ?? null,
        result.inputTokens ?? null, result.outputTokens ?? null,
        result.actualCostUsd ?? null, completedAt.toISOString(),
        result.retryCount ?? 0, result.errorKind ?? null, result.errorDetail ?? null,
        result.fallbackUsed ?? false, result.denialReason ?? null,
      ],
    )
  }

  async findById(id: string): Promise<ModelRunRow | null> {
    const res = await this.db.query<ModelRunRow>('SELECT * FROM model_run WHERE id = $1', [id])
    return res.rows[0] ?? null
  }

  async list(limit = 50): Promise<ModelRunRow[]> {
    const res = await this.db.query<ModelRunRow>(
      'SELECT * FROM model_run ORDER BY request_started_at DESC LIMIT $1', [limit],
    )
    return res.rows
  }

  /** Settled spend within a window, for the Budget Controller. */
  async spendSince(since: Date): Promise<number> {
    const res = await this.db.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd)), 0)::text AS total
         FROM model_run
        WHERE request_started_at >= $1 AND status IN ('COMPLETE','FAILED')`,
      [since.toISOString()],
    )
    return Number(res.rows[0]?.total ?? 0)
  }
}
