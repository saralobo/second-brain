import { createHash } from 'node:crypto'
import { ulid } from '@ava/core'
import type { ContentOrigin, EvidenceStrength, Lineage, Sensitivity } from '@ava/core'
import type { Database } from '../client'

export interface Evidence {
  id: string
  content: string
  contentType: string
  contentOrigin: ContentOrigin
  sourceRecordId: string
  workstreamId: string | null
  captureType: string
  title: string | null
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  strength: EvidenceStrength
  sensitivity: Sensitivity
  hash: string
  lineage: Lineage
  fields: Record<string, unknown>
}

export interface AppendEvidenceInput {
  content: string
  contentType?: string
  contentOrigin: ContentOrigin
  sourceRecordId: string
  workstreamId: string | null
  captureType: string
  title: string | null
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  strength: EvidenceStrength
  sensitivity: Sensitivity
  lineage: Lineage
  fields: Record<string, unknown>
}

function toEvidence(r: Record<string, unknown>): Evidence {
  return {
    id: String(r.id),
    content: String(r.content),
    contentType: String(r.content_type),
    contentOrigin: r.content_origin as ContentOrigin,
    sourceRecordId: String(r.source_record_id),
    workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    captureType: String(r.capture_type),
    title: r.title ? String(r.title) : null,
    observedAt: new Date(r.observed_at as string),
    effectiveAt: r.effective_at ? new Date(r.effective_at as string) : null,
    effectiveAtInferred: Boolean(r.effective_at_inferred),
    strength: r.strength as EvidenceStrength,
    sensitivity: r.sensitivity as Sensitivity,
    hash: String(r.hash),
    lineage: (r.lineage ?? {}) as Lineage,
    fields: (r.fields ?? {}) as Record<string, unknown>,
  }
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Append-only evidence access.
 *
 * There is deliberately NO update() and NO delete() on this interface. The
 * database enforces the same rule with rewrite rules; this is the second of
 * the three layers described in the implementation plan §6.
 *
 * Deletion required by privacy is an explicit administrative operation living
 * outside this repository, not a method here.
 */
export class EvidenceRepository {
  constructor(private readonly db: Database) {}

  async append(input: AppendEvidenceInput): Promise<Evidence> {
    const id = ulid(input.observedAt.getTime())
    const hash = hashContent(input.content)
    await this.db.query(
      `INSERT INTO evidence (
         id, content, content_type, content_origin, source_record_id, workstream_id,
         capture_type, title, observed_at, effective_at, effective_at_inferred,
         strength, sensitivity, hash, lineage, fields
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, input.content, input.contentType ?? 'text/plain', input.contentOrigin,
        input.sourceRecordId, input.workstreamId, input.captureType, input.title,
        input.observedAt.toISOString(), input.effectiveAt?.toISOString() ?? null,
        input.effectiveAtInferred, input.strength, input.sensitivity, hash,
        JSON.stringify(input.lineage), JSON.stringify(input.fields),
      ],
    )
    const created = await this.findById(id)
    if (!created) throw new Error('evidence append did not persist')
    return created
  }

  async findById(id: string): Promise<Evidence | null> {
    const res = await this.db.query('SELECT * FROM evidence WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toEvidence(row) : null
  }

  async findByIds(ids: readonly string[]): Promise<Evidence[]> {
    if (ids.length === 0) return []
    const res = await this.db.query(
      'SELECT * FROM evidence WHERE id = ANY($1::text[]) ORDER BY observed_at',
      [ids as string[]],
    )
    return res.rows.map(toEvidence)
  }

  /** Reasoning order is observed_at — never created_at. */
  async listByWorkstream(workstreamId: string, limit = 50): Promise<Evidence[]> {
    const res = await this.db.query(
      'SELECT * FROM evidence WHERE workstream_id = $1 ORDER BY observed_at DESC LIMIT $2',
      [workstreamId, limit],
    )
    return res.rows.map(toEvidence)
  }

  /** "What did AVA know at this moment?" */
  async listKnownAt(workstreamId: string, at: Date): Promise<Evidence[]> {
    const res = await this.db.query(
      'SELECT * FROM evidence WHERE workstream_id = $1 AND observed_at <= $2 ORDER BY observed_at',
      [workstreamId, at.toISOString()],
    )
    return res.rows.map(toEvidence)
  }

  async count(): Promise<number> {
    const res = await this.db.query<{ n: string }>('SELECT count(*)::text AS n FROM evidence')
    return Number(res.rows[0]?.n ?? 0)
  }
}
