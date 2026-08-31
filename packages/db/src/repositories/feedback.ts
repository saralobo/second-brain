import { ulid } from '@ava/core'
import type {
  ArtifactVerdict, DeliveryVerdict, EpistemicVerdict, FeedbackRecord, FeedbackTargetType,
  OutcomeRecord, OutcomeState, UserActionKind, UserActionRecord,
} from '@ava/core'
import type { Database } from '../client'

/**
 * Feedback, actions and outcomes (S6-T01, S6-T05).
 *
 * All three tables are append-oriented. A correction writes a new row and
 * links back; nothing is overwritten, so the question "what did the user think
 * at t1?" stays answerable after they change their mind at t2.
 */
export interface RecordFeedbackInput {
  targetType: FeedbackTargetType
  targetId: string
  opportunityId?: string | null
  decisionRecordId?: string | null
  epistemic?: EpistemicVerdict | null
  delivery?: DeliveryVerdict | null
  artifact?: ArtifactVerdict | null
  reason?: string | null
  givenAt?: Date
  correctsFeedbackId?: string | null
}

export class FeedbackRepository {
  constructor(private readonly db: Database) {}

  async record(input: RecordFeedbackInput): Promise<FeedbackRecord> {
    const epistemic = input.epistemic ?? null
    const delivery = input.delivery ?? null
    const artifact = input.artifact ?? null
    if (epistemic === null && delivery === null && artifact === null) {
      throw new Error('feedback must carry at least one dimension; an empty row is not feedback')
    }
    const givenAt = input.givenAt ?? new Date()
    const id = ulid(givenAt.getTime())

    await this.db.query(
      `INSERT INTO feedback (
         id, target_type, target_id, opportunity_id, decision_record_id,
         epistemic, delivery, artifact_feedback, reason, given_at, corrects_feedback_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, input.targetType, input.targetId, input.opportunityId ?? null,
        input.decisionRecordId ?? null, epistemic, delivery, artifact,
        input.reason ?? null, givenAt.toISOString(), input.correctsFeedbackId ?? null,
      ],
    )

    // A correction marks its predecessor superseded. The predecessor stays in
    // the table and stays readable — this is a pointer, not an erasure.
    if (input.correctsFeedbackId) {
      await this.db.query(
        'UPDATE feedback SET superseded_by = $2 WHERE id = $1 AND superseded_by IS NULL',
        [input.correctsFeedbackId, id],
      )
    }

    return {
      id, targetType: input.targetType, targetId: input.targetId,
      opportunityId: input.opportunityId ?? null,
      decisionRecordId: input.decisionRecordId ?? null,
      epistemic, delivery, artifact, reason: input.reason ?? null,
      givenAt, correctsFeedbackId: input.correctsFeedbackId ?? null,
      supersededByFeedbackId: null,
    }
  }

  async forTarget(targetType: FeedbackTargetType, targetId: string): Promise<FeedbackRecord[]> {
    const res = await this.db.query(
      'SELECT * FROM feedback WHERE target_type = $1 AND target_id = $2 ORDER BY given_at',
      [targetType, targetId],
    )
    return res.rows.map(toFeedback)
  }

  /** Every row touching an opportunity, whatever the target type. */
  async forOpportunity(opportunityId: string): Promise<FeedbackRecord[]> {
    const res = await this.db.query(
      `SELECT * FROM feedback
       WHERE opportunity_id = $1 OR (target_type = 'opportunity' AND target_id = $1)
       ORDER BY given_at`,
      [opportunityId],
    )
    return res.rows.map(toFeedback)
  }

  async findById(id: string): Promise<FeedbackRecord | null> {
    const res = await this.db.query('SELECT * FROM feedback WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toFeedback(row) : null
  }

  async listByWorkstream(workstreamId: string): Promise<FeedbackRecord[]> {
    const res = await this.db.query(
      `SELECT f.* FROM feedback f
       LEFT JOIN opportunity o ON o.id = f.opportunity_id
                              OR (f.target_type = 'opportunity' AND o.id = f.target_id)
       WHERE o.workstream_id = $1 ORDER BY f.given_at`,
      [workstreamId],
    )
    return res.rows.map(toFeedback)
  }
}

function toFeedback(r: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(r.id),
    targetType: r.target_type as FeedbackTargetType,
    targetId: String(r.target_id),
    opportunityId: r.opportunity_id ? String(r.opportunity_id) : null,
    decisionRecordId: r.decision_record_id ? String(r.decision_record_id) : null,
    epistemic: (r.epistemic ?? null) as EpistemicVerdict | null,
    delivery: (r.delivery ?? null) as DeliveryVerdict | null,
    artifact: (r.artifact_feedback ?? null) as ArtifactVerdict | null,
    reason: r.reason ? String(r.reason) : null,
    givenAt: new Date(r.given_at as string),
    correctsFeedbackId: r.corrects_feedback_id ? String(r.corrects_feedback_id) : null,
    supersededByFeedbackId: r.superseded_by ? String(r.superseded_by) : null,
  }
}

export class UserActionRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    opportunityId: string
    kind: UserActionKind
    description?: string | null
    actedAt: Date
    relatedObjectId?: string | null
    relatedArtifactId?: string | null
  }): Promise<UserActionRecord> {
    const id = ulid(input.actedAt.getTime())
    const recordedAt = new Date()
    await this.db.query(
      `INSERT INTO user_action (
         id, opportunity_id, kind, description, acted_at, related_object_id,
         related_artifact_id, recorded_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id, input.opportunityId, input.kind, input.description ?? null,
        input.actedAt.toISOString(), input.relatedObjectId ?? null,
        input.relatedArtifactId ?? null, recordedAt.toISOString(),
      ],
    )
    return {
      id, opportunityId: input.opportunityId, kind: input.kind,
      description: input.description ?? null, actedAt: input.actedAt,
      relatedObjectId: input.relatedObjectId ?? null,
      relatedArtifactId: input.relatedArtifactId ?? null, recordedAt,
    }
  }

  async forOpportunity(opportunityId: string): Promise<UserActionRecord[]> {
    const res = await this.db.query(
      'SELECT * FROM user_action WHERE opportunity_id = $1 ORDER BY acted_at',
      [opportunityId],
    )
    return res.rows.map(toAction)
  }
}

function toAction(r: Record<string, unknown>): UserActionRecord {
  return {
    id: String(r.id),
    opportunityId: String(r.opportunity_id),
    kind: r.kind as UserActionKind,
    description: r.description ? String(r.description) : null,
    actedAt: new Date(r.acted_at as string),
    relatedObjectId: r.related_object_id ? String(r.related_object_id) : null,
    relatedArtifactId: r.related_artifact_id ? String(r.related_artifact_id) : null,
    recordedAt: new Date(r.recorded_at as string),
  }
}

export class OutcomeRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    opportunityId?: string | null
    decisionRecordId?: string | null
    state: OutcomeState
    resolvedBy: 'deterministic_event' | 'explicit_review'
    resolvedAt?: Date | null
    evidenceIds?: readonly string[]
    note?: string | null
    recordedAt?: Date
    supersedesOutcomeId?: string | null
  }): Promise<OutcomeRecord> {
    const recordedAt = input.recordedAt ?? new Date()
    const id = ulid(recordedAt.getTime())
    const resolvedAt = input.state === 'resolved' ? (input.resolvedAt ?? recordedAt) : null

    await this.db.query(
      `INSERT INTO outcome (
         id, opportunity_id, decision_record_id, state, resolved_by, resolved_at,
         evidence_ids, note, recorded_at, supersedes_outcome_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, input.opportunityId ?? null, input.decisionRecordId ?? null,
        input.state, input.resolvedBy, resolvedAt ? resolvedAt.toISOString() : null,
        JSON.stringify(input.evidenceIds ?? []), input.note ?? null,
        recordedAt.toISOString(), input.supersedesOutcomeId ?? null,
      ],
    )
    if (input.supersedesOutcomeId) {
      await this.db.query(
        'UPDATE outcome SET superseded_by = $2 WHERE id = $1 AND superseded_by IS NULL',
        [input.supersedesOutcomeId, id],
      )
    }
    return {
      id, opportunityId: input.opportunityId ?? null,
      decisionRecordId: input.decisionRecordId ?? null,
      state: input.state, resolvedBy: input.resolvedBy, resolvedAt,
      evidenceIds: [...(input.evidenceIds ?? [])], note: input.note ?? null,
      recordedAt, supersedesOutcomeId: input.supersedesOutcomeId ?? null,
      supersededByOutcomeId: null,
    }
  }

  /** The whole chain, oldest first. `unresolved` at t1 stays visible. */
  async historyFor(opportunityId: string): Promise<OutcomeRecord[]> {
    const res = await this.db.query(
      'SELECT * FROM outcome WHERE opportunity_id = $1 ORDER BY recorded_at',
      [opportunityId],
    )
    return res.rows.map(toOutcome)
  }

  async listByWorkstream(workstreamId: string): Promise<OutcomeRecord[]> {
    const res = await this.db.query(
      `SELECT oc.* FROM outcome oc JOIN opportunity o ON o.id = oc.opportunity_id
       WHERE o.workstream_id = $1 ORDER BY oc.recorded_at`,
      [workstreamId],
    )
    return res.rows.map(toOutcome)
  }
}

function toOutcome(r: Record<string, unknown>): OutcomeRecord {
  return {
    id: String(r.id),
    opportunityId: r.opportunity_id ? String(r.opportunity_id) : null,
    decisionRecordId: r.decision_record_id ? String(r.decision_record_id) : null,
    state: r.state as OutcomeState,
    resolvedBy: r.resolved_by as 'deterministic_event' | 'explicit_review',
    resolvedAt: r.resolved_at ? new Date(r.resolved_at as string) : null,
    evidenceIds: (r.evidence_ids ?? []) as string[],
    note: r.note ? String(r.note) : null,
    recordedAt: new Date(r.recorded_at as string),
    supersedesOutcomeId: r.supersedes_outcome_id ? String(r.supersedes_outcome_id) : null,
    supersededByOutcomeId: r.superseded_by ? String(r.superseded_by) : null,
  }
}
