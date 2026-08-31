import { ulid } from '@ava/core'
import type {
  EvidenceStrength, Relationship, RelationshipKind, Sensitivity,
  StateObjectType, StateObjectVersion,
} from '@ava/core'
import type { Database } from '../client'

function toVersion(r: Record<string, unknown>): StateObjectVersion {
  return {
    id: String(r.id),
    objectId: String(r.object_id),
    type: r.type as StateObjectType,
    workstreamId: String(r.workstream_id),
    version: Number(r.version),
    status: String(r.status),
    title: String(r.title),
    fields: (r.fields ?? {}) as Record<string, unknown>,
    evidenceIds: (r.evidence_ids ?? []) as string[],
    strength: r.strength as EvidenceStrength,
    sensitivity: r.sensitivity as Sensitivity,
    observedAt: new Date(r.observed_at as string),
    effectiveAt: r.effective_at ? new Date(r.effective_at as string) : null,
    effectiveAtInferred: Boolean(r.effective_at_inferred),
    supersededBy: r.superseded_by ? String(r.superseded_by) : null,
  }
}

export interface NewVersionInput {
  objectId: string
  type: StateObjectType
  workstreamId: string
  version: number
  status: string
  title: string
  fields: Record<string, unknown>
  evidenceIds: string[]
  strength: EvidenceStrength
  sensitivity: Sensitivity
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
}

export class StateRepository {
  constructor(private readonly db: Database) {}

  async createObject(type: StateObjectType, workstreamId: string): Promise<string> {
    const id = ulid()
    await this.db.query(
      'INSERT INTO state_object (id, type, workstream_id) VALUES ($1,$2,$3)',
      [id, type, workstreamId],
    )
    return id
  }

  async appendVersion(input: NewVersionInput): Promise<StateObjectVersion> {
    const id = ulid(input.observedAt.getTime())
    await this.db.query(
      `INSERT INTO state_object_version (
         id, object_id, type, workstream_id, version, status, title, fields,
         evidence_ids, strength, sensitivity, observed_at, effective_at, effective_at_inferred
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id, input.objectId, input.type, input.workstreamId, input.version, input.status,
        input.title, JSON.stringify(input.fields), JSON.stringify(input.evidenceIds),
        input.strength, input.sensitivity, input.observedAt.toISOString(),
        input.effectiveAt?.toISOString() ?? null, input.effectiveAtInferred,
      ],
    )
    const v = await this.findVersionById(id)
    if (!v) throw new Error('state version append did not persist')
    return v
  }

  /**
   * Marks a version as replaced. This is the ONLY mutation allowed on a
   * version row, it writes a pointer and never touches content, and it is
   * refused if the version is already superseded — history is not rewritten.
   */
  async markSuperseded(versionId: string, successorId: string): Promise<void> {
    const res = await this.db.query<{ superseded_by: string | null }>(
      'SELECT superseded_by FROM state_object_version WHERE id = $1',
      [versionId],
    )
    const row = res.rows[0]
    if (!row) throw new Error(`unknown version ${versionId}`)
    if (row.superseded_by !== null) {
      throw new Error('version is already superseded; history cannot be rewritten')
    }
    await this.db.query(
      'UPDATE state_object_version SET superseded_by = $2 WHERE id = $1',
      [versionId, successorId],
    )
  }

  async findVersionById(id: string): Promise<StateObjectVersion | null> {
    const res = await this.db.query('SELECT * FROM state_object_version WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toVersion(row) : null
  }

  async versionsOfObject(objectId: string): Promise<StateObjectVersion[]> {
    const res = await this.db.query(
      'SELECT * FROM state_object_version WHERE object_id = $1 ORDER BY version',
      [objectId],
    )
    return res.rows.map(toVersion)
  }

  async latestVersion(objectId: string): Promise<StateObjectVersion | null> {
    const res = await this.db.query(
      'SELECT * FROM state_object_version WHERE object_id = $1 ORDER BY version DESC LIMIT 1',
      [objectId],
    )
    const row = res.rows[0]
    return row ? toVersion(row) : null
  }

  /** Every version in a workstream — the input to the projection. */
  async allVersions(workstreamId: string): Promise<StateObjectVersion[]> {
    const res = await this.db.query(
      'SELECT * FROM state_object_version WHERE workstream_id = $1 ORDER BY object_id, version',
      [workstreamId],
    )
    return res.rows.map(toVersion)
  }

  async addRelationship(rel: Relationship): Promise<void> {
    await this.db.query(
      `INSERT INTO relationship (id, from_id, from_type, to_id, to_type, kind, evidence_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rel.id, rel.fromId, rel.fromType, rel.toId, rel.toType, rel.kind, JSON.stringify(rel.evidenceIds)],
    )
  }

  async relationships(): Promise<Relationship[]> {
    const res = await this.db.query('SELECT * FROM relationship')
    return res.rows.map((r) => ({
      id: String(r.id),
      fromId: String(r.from_id),
      fromType: String(r.from_type),
      toId: String(r.to_id),
      toType: String(r.to_type),
      kind: r.kind as RelationshipKind,
      evidenceIds: (r.evidence_ids ?? []) as string[],
    }))
  }
}
