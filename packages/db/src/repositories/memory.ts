import { evidenceReachable, ulid } from '@ava/core'
import type { EvidenceStrength, MemoryClass, MemoryRecord, MemoryView } from '@ava/core'
import type { Database } from '../client'

/**
 * MemoryRecord and MemoryView storage.
 *
 * The `evidence_reachable` invariant (S4-T05) is enforced on WRITE, not
 * reported on read. A record whose sources cannot be reached is an
 * unfalsifiable belief — the user could neither check it nor correct it — so
 * it must be impossible to store, not merely flagged afterwards.
 */
function toRecord(r: Record<string, unknown>): MemoryRecord {
  return {
    id: String(r.id),
    memoryClass: r.memory_class as MemoryClass,
    refId: String(r.ref_id),
    refType: r.ref_type as MemoryRecord['refType'],
    title: String(r.title),
    derivedFromEvidenceIds: (r.derived_from_evidence_ids ?? []) as string[],
    evidenceReachable: Boolean(r.evidence_reachable),
    strength: r.strength as EvidenceStrength,
    promotedAt: r.promoted_at ? new Date(r.promoted_at as string) : null,
    promotionDecisionRecordId: r.promotion_decision_record_id
      ? String(r.promotion_decision_record_id) : null,
    workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    createdAt: new Date(r.created_at as string),
  }
}

export interface MemoryRecordInput {
  memoryClass: MemoryClass
  refId: string
  refType: MemoryRecord['refType']
  title: string
  derivedFromEvidenceIds: readonly string[]
  strength: EvidenceStrength
  promotedAt?: Date | null
  promotionDecisionRecordId?: string | null
  workstreamId?: string | null
}

export class MemoryRepository {
  constructor(private readonly db: Database) {}

  /** Ids of the level-zero evidence rows that actually exist. */
  private async existing(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM evidence WHERE id = ANY($1::text[])', [ids as string[]])
    return new Set(res.rows.map((r) => r.id))
  }

  async upsert(input: MemoryRecordInput): Promise<MemoryRecord> {
    const reachable = evidenceReachable(
      input.derivedFromEvidenceIds, await this.existing(input.derivedFromEvidenceIds))
    if (!reachable) {
      throw new Error(
        'memory record rejected: its evidence is not reachable, so it could never be checked or corrected',
      )
    }

    const existingRow = await this.db.query<{ id: string }>(
      'SELECT id FROM memory_record WHERE memory_class = $1 AND ref_id = $2',
      [input.memoryClass, input.refId])

    if (existingRow.rows[0]) {
      const id = existingRow.rows[0].id
      await this.db.query(
        `UPDATE memory_record
            SET title = $2, derived_from_evidence_ids = $3, strength = $4,
                promoted_at = $5, promotion_decision_record_id = $6
          WHERE id = $1`,
        [
          id, input.title, JSON.stringify([...input.derivedFromEvidenceIds]), input.strength,
          input.promotedAt?.toISOString() ?? null, input.promotionDecisionRecordId ?? null,
        ],
      )
      const updated = await this.findById(id)
      if (!updated) throw new Error('memory record vanished after update')
      return updated
    }

    const id = ulid()
    await this.db.query(
      `INSERT INTO memory_record (
         id, memory_class, ref_id, ref_type, title, derived_from_evidence_ids,
         evidence_reachable, strength, promoted_at, promotion_decision_record_id, workstream_id
       ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10)`,
      [
        id, input.memoryClass, input.refId, input.refType, input.title,
        JSON.stringify([...input.derivedFromEvidenceIds]), input.strength,
        input.promotedAt?.toISOString() ?? null, input.promotionDecisionRecordId ?? null,
        input.workstreamId ?? null,
      ],
    )
    const created = await this.findById(id)
    if (!created) throw new Error('memory record did not persist')
    return created
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const res = await this.db.query('SELECT * FROM memory_record WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toRecord(row) : null
  }

  async listByClass(memoryClass: MemoryClass, workstreamId?: string | null): Promise<MemoryRecord[]> {
    const res = workstreamId
      ? await this.db.query(
          `SELECT * FROM memory_record
            WHERE memory_class = $1 AND (workstream_id = $2 OR workstream_id IS NULL)
            ORDER BY created_at DESC`, [memoryClass, workstreamId])
      : await this.db.query(
          'SELECT * FROM memory_record WHERE memory_class = $1 ORDER BY created_at DESC',
          [memoryClass])
    return res.rows.map(toRecord)
  }

  async listAll(workstreamId?: string | null): Promise<MemoryRecord[]> {
    const res = workstreamId
      ? await this.db.query(
          'SELECT * FROM memory_record WHERE workstream_id = $1 OR workstream_id IS NULL ORDER BY created_at DESC',
          [workstreamId])
      : await this.db.query('SELECT * FROM memory_record ORDER BY created_at DESC')
    return res.rows.map(toRecord)
  }

  /**
   * Verifies the invariant across the whole table.
   *
   * Used by the audit test rather than by the application: the write path
   * already refuses unreachable records, and this proves that no route around
   * it exists.
   */
  async unreachableRecords(): Promise<string[]> {
    const res = await this.db.query<{ id: string }>(
      `SELECT m.id
         FROM memory_record m
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(m.derived_from_evidence_ids) AS e(id)
           WHERE NOT EXISTS (SELECT 1 FROM evidence v WHERE v.id = e.id)
        )`)
    return res.rows.map((r) => r.id)
  }

  // -- Views ---------------------------------------------------------------

  async saveView(view: Omit<MemoryView, 'id' | 'builtAt'> & { workstreamId: string | null }): Promise<MemoryView> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO memory_view (
         id, title, summary, derived_from_evidence_ids, content_origin, strength, workstream_id, stale
       ) VALUES ($1,$2,$3,$4,'system',$5,$6,$7)`,
      [
        id, view.title, view.summary, JSON.stringify([...view.derivedFromEvidenceIds]),
        view.strength, view.workstreamId, view.stale,
      ],
    )
    const saved = await this.findView(id)
    if (!saved) throw new Error('memory view did not persist')
    return saved
  }

  async findView(id: string): Promise<MemoryView | null> {
    const res = await this.db.query('SELECT * FROM memory_view WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toView(row) : null
  }

  async listViews(workstreamId?: string | null): Promise<MemoryView[]> {
    const res = workstreamId
      ? await this.db.query('SELECT * FROM memory_view WHERE workstream_id = $1 ORDER BY built_at DESC', [workstreamId])
      : await this.db.query('SELECT * FROM memory_view ORDER BY built_at DESC')
    return res.rows.map(toView)
  }

  /**
   * Marks every view touching this evidence stale.
   *
   * Called on correction. A stale view is not served: it is rebuilt from the
   * ledger, which is the only reason a view is allowed to exist at all.
   */
  async markViewsStale(evidenceIds: readonly string[]): Promise<number> {
    if (evidenceIds.length === 0) return 0
    const res = await this.db.query<{ id: string }>(
      `UPDATE memory_view
          SET stale = true
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(derived_from_evidence_ids) AS e(id)
           WHERE e.id = ANY($1::text[])
        )
        RETURNING id`,
      [evidenceIds as string[]],
    )
    return res.rows.length
  }

  async deleteView(id: string): Promise<void> {
    await this.db.query('DELETE FROM memory_view WHERE id = $1', [id])
  }
}

function toView(r: Record<string, unknown>): MemoryView {
  return {
    id: String(r.id),
    title: String(r.title),
    summary: String(r.summary),
    derivedFromEvidenceIds: (r.derived_from_evidence_ids ?? []) as string[],
    contentOrigin: 'system',
    strength: r.strength as EvidenceStrength,
    builtAt: new Date(r.built_at as string),
    stale: Boolean(r.stale),
  }
}
