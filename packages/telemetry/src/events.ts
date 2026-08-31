import { ulid } from '@ava/core'
import type { EvidenceStrength } from '@ava/core'
import type { Database } from '@ava/db'

/**
 * Prospective validation telemetry (spec §23).
 *
 * Batch 1 instruments the events its slices can honestly produce. The later
 * events exist in the type so Slice 7 audits absence rather than discovering
 * that instrumentation was never designed — but they are NOT written here,
 * because inventing an event that did not occur would corrupt the very
 * timeline this table exists to protect.
 */
export type ValidationEventType =
  // Batch 1
  | 'capture_initiated'
  | 'evidence_arrived'
  | 'evidence_accepted'
  | 'evidence_rejected'
  | 'state_projection_triggered'
  | 'change_detection_triggered'
  | 'change_detectable_at'
  | 'change_detected'
  // Later slices — declared, deliberately not emitted in Batch 1
  | 'opportunity_generated'
  | 'opportunity_shown'
  | 'user_seen'
  | 'feedback_given'
  | 'user_action'
  | 'outcome_resolved'

/** Events Batch 1 is allowed to emit. Anything else is a programming error. */
export const BATCH_1_EVENTS: readonly ValidationEventType[] = [
  'capture_initiated', 'evidence_arrived', 'evidence_accepted', 'evidence_rejected',
  'state_projection_triggered', 'change_detection_triggered',
  'change_detectable_at', 'change_detected',
] as const

export interface ValidationEventInput {
  eventType: ValidationEventType
  /** The real instant of the event. Never the write time. */
  occurredAt: Date
  subjectType: string
  subjectId: string
  workstreamId?: string | null
  contextHealth?: string | null
  evidenceStrength?: EvidenceStrength | null
  modelRunId?: string | null
  decisionRecordId?: string | null
  payload?: Record<string, unknown>
}

export class TelemetryWriter {
  constructor(private readonly db: Database) {}

  /**
   * Records an event. The database refuses backdated and future-dated rows,
   * so a lost event stays lost rather than being reconstructed later.
   */
  async record(input: ValidationEventInput): Promise<string> {
    if (!BATCH_1_EVENTS.includes(input.eventType)) {
      throw new Error(
        `event "${input.eventType}" belongs to a later slice and must not be emitted in Batch 1`,
      )
    }
    const id = ulid(input.occurredAt.getTime())
    await this.db.query(
      `INSERT INTO validation_event (
         id, event_type, occurred_at, subject_type, subject_id, workstream_id,
         context_health, evidence_strength, model_run_id, decision_record_id, payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, input.eventType, input.occurredAt.toISOString(), input.subjectType, input.subjectId,
        input.workstreamId ?? null, input.contextHealth ?? null, input.evidenceStrength ?? null,
        input.modelRunId ?? null, input.decisionRecordId ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    )
    return id
  }

  async listBySubject(subjectId: string): Promise<ValidationEventRow[]> {
    const res = await this.db.query<ValidationEventRow>(
      'SELECT id, event_type, occurred_at, subject_type, subject_id FROM validation_event WHERE subject_id = $1 ORDER BY occurred_at',
      [subjectId],
    )
    return res.rows
  }

  async countByType(): Promise<Record<string, number>> {
    const res = await this.db.query<{ event_type: string; n: string }>(
      'SELECT event_type, count(*)::text AS n FROM validation_event GROUP BY event_type',
    )
    return Object.fromEntries(res.rows.map((r) => [r.event_type, Number(r.n)]))
  }
}

export interface ValidationEventRow {
  id: string
  event_type: string
  occurred_at: string
  subject_type: string
  subject_id: string
}
