import type { ChangeRecord, ChangeType, Detector, EvidenceStrength } from '@ava/core'
import type { Database } from '../client'

function toChange(r: Record<string, unknown>): ChangeRecord {
  return {
    id: String(r.id),
    objectId: String(r.object_id),
    objectType: String(r.object_type),
    workstreamId: String(r.workstream_id),
    changeType: r.change_type as ChangeType,
    beforeVersionRef: r.before_version_ref ? String(r.before_version_ref) : null,
    afterVersionRef: r.after_version_ref ? String(r.after_version_ref) : null,
    changedFields: (r.changed_fields ?? []) as string[],
    observedAt: new Date(r.observed_at as string),
    effectiveAt: r.effective_at ? new Date(r.effective_at as string) : null,
    effectiveAtInferred: Boolean(r.effective_at_inferred),
    evidenceIds: (r.evidence_ids ?? []) as string[],
    strength: r.strength as EvidenceStrength,
    candidateDependencies: (r.candidate_dependencies ?? []) as string[],
    contradictionFlag: Boolean(r.contradiction_flag),
    contextHealthAtDetection: r.context_health_at_detection ? String(r.context_health_at_detection) : null,
    detector: r.detector as Detector,
    detectorVersion: String(r.detector_version),
    status: r.status as ChangeRecord['status'],
  }
}

export class ChangeRepository {
  constructor(private readonly db: Database) {}

  async append(change: ChangeRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO change_record (
         id, object_id, object_type, workstream_id, change_type,
         before_version_ref, after_version_ref, changed_fields,
         observed_at, effective_at, effective_at_inferred, evidence_ids, strength,
         candidate_dependencies, contradiction_flag, context_health_at_detection,
         detector, detector_version, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        change.id, change.objectId, change.objectType, change.workstreamId, change.changeType,
        change.beforeVersionRef, change.afterVersionRef, JSON.stringify(change.changedFields),
        change.observedAt.toISOString(), change.effectiveAt?.toISOString() ?? null,
        change.effectiveAtInferred, JSON.stringify(change.evidenceIds), change.strength,
        JSON.stringify(change.candidateDependencies), change.contradictionFlag,
        change.contextHealthAtDetection, change.detector, change.detectorVersion, change.status,
      ],
    )
  }

  async listByWorkstream(workstreamId: string, limit = 50): Promise<ChangeRecord[]> {
    const res = await this.db.query(
      'SELECT * FROM change_record WHERE workstream_id = $1 ORDER BY observed_at DESC, id DESC LIMIT $2',
      [workstreamId, limit],
    )
    return res.rows.map(toChange)
  }

  async listByObject(objectId: string): Promise<ChangeRecord[]> {
    const res = await this.db.query(
      'SELECT * FROM change_record WHERE object_id = $1 ORDER BY observed_at',
      [objectId],
    )
    return res.rows.map(toChange)
  }
}
