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
  // Slice 3
  | 'question_received'
  | 'retrieval_started'
  | 'retrieval_completed'
  | 'context_packet_created'
  | 'provider_call_authorized'
  | 'provider_call_denied'
  | 'grounded_answer_generated'
  | 'grounded_answer_rejected'
  | 'answer_shown'
  | 'abstention_shown'
  // Slice 4
  | 'cognition_declared'
  | 'cognition_confirmed'
  | 'cognition_corrected'
  | 'cognition_contextualized'
  | 'cognition_superseded'
  | 'cognition_revoked'
  | 'hypothesis_created'
  | 'hypothesis_rejected'
  | 'hypothesis_conflict_recorded'
  | 'knowledge_promoted'
  | 'memory_view_rebuilt'
  // Slice 5
  | 'opportunity_generated'
  | 'opportunity_eligible'
  | 'opportunity_suppressed'
  | 'opportunity_shown'
  | 'preparation_started'
  | 'preparation_completed'
  | 'preparation_denied'
  | 'briefing_generated'
  | 'briefing_shown'
  | 'checkpoint_opened'
  | 'checkpoint_closed'
  // Slice 6
  | 'feedback_epistemic_recorded'
  | 'feedback_delivery_recorded'
  | 'artifact_feedback_recorded'
  | 'feedback_corrected'
  | 'user_action_recorded'
  | 'outcome_recorded'
  | 'outcome_updated'
  // Declared, deliberately not emitted: there is still no client-side
  // observability, and delivering something is not the same as reading it.
  | 'user_seen'

/** Events Batch 1 is allowed to emit. Anything else is a programming error. */
export const BATCH_1_EVENTS: readonly ValidationEventType[] = [
  'capture_initiated', 'evidence_arrived', 'evidence_accepted', 'evidence_rejected',
  'state_projection_triggered', 'change_detection_triggered',
  'change_detectable_at', 'change_detected',
] as const

/**
 * Events Slice 3 is allowed to emit.
 *
 * `answer_shown` and `abstention_shown` mean the response was DELIVERED by
 * the server. They deliberately do not claim the user read it: there is no
 * client-side observability yet, and `user_seen` stays unemitted rather than
 * being approximated by delivery.
 */
export const SLICE_3_EVENTS: readonly ValidationEventType[] = [
  'question_received', 'retrieval_started', 'retrieval_completed',
  'context_packet_created', 'provider_call_authorized', 'provider_call_denied',
  'grounded_answer_generated', 'grounded_answer_rejected',
  'answer_shown', 'abstention_shown',
] as const

/**
 * Events Slice 4 is allowed to emit.
 *
 * Every one of them corresponds to an action that actually happened —
 * a declaration written, a correction made, a view rebuilt. There is no event
 * for "AVA inferred a preference", because inferring one is not permitted.
 */
export const SLICE_4_EVENTS: readonly ValidationEventType[] = [
  'cognition_declared', 'cognition_confirmed', 'cognition_corrected',
  'cognition_contextualized', 'cognition_superseded', 'cognition_revoked',
  'hypothesis_created', 'hypothesis_rejected', 'hypothesis_conflict_recorded',
  'knowledge_promoted', 'memory_view_rebuilt',
] as const

/**
 * Events Slice 5 is allowed to emit.
 *
 * `opportunity_shown` and `briefing_shown` mean the server DELIVERED the item.
 * They do not claim it was read. `user_seen` stays unemitted for exactly the
 * reason it stayed unemitted in Slice 3: there is still no client-side
 * observability, and `shown` is not `seen`. Approximating one with the other
 * would corrupt the very latency measurements this table exists to support.
 */
export const SLICE_5_EVENTS: readonly ValidationEventType[] = [
  'opportunity_generated', 'opportunity_eligible', 'opportunity_suppressed',
  'opportunity_shown', 'preparation_started', 'preparation_completed',
  'preparation_denied', 'briefing_generated', 'briefing_shown',
  'checkpoint_opened', 'checkpoint_closed',
] as const

/**
 * Events Slice 6 is allowed to emit.
 *
 * Each corresponds to something a person actually did — a verdict given, an
 * action reported, an outcome written down. There is no event for "the user
 * ignored this", because silence is not an observation about the item; it is
 * the absence of one.
 *
 * `user_seen` stays unemitted for the third slice running. Slice 6 revisited
 * whether client observability now exists: it does not. Page render, response
 * delivery and `opportunity_shown` are all proxies for `seen`, and using any
 * of them would put a fabricated timestamp into the one timeline the
 * prospective study depends on.
 */
export const SLICE_6_EVENTS: readonly ValidationEventType[] = [
  'feedback_epistemic_recorded', 'feedback_delivery_recorded',
  'artifact_feedback_recorded', 'feedback_corrected',
  'user_action_recorded', 'outcome_recorded', 'outcome_updated',
] as const

const EMITTABLE: readonly ValidationEventType[] = [
  ...BATCH_1_EVENTS, ...SLICE_3_EVENTS, ...SLICE_4_EVENTS, ...SLICE_5_EVENTS,
  ...SLICE_6_EVENTS,
]

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
    if (!EMITTABLE.includes(input.eventType)) {
      throw new Error(
        `event "${input.eventType}" belongs to a later slice and must not be emitted yet`,
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
