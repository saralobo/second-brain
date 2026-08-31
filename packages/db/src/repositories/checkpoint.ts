import { ulid } from '@ava/core'
import type { Database } from '../client'

/**
 * Checkpoints (spec §2.1).
 *
 * "Since the last checkpoint" needs an exact boundary, otherwise every
 * proactive surface silently redefines recency. V0 closes checkpoints
 * manually: the right cadence is an open question for the prospective data,
 * and a scheduler here would answer it by assumption.
 */
export interface Checkpoint {
  id: string
  workstreamId: string
  openedAt: Date
  closedAt: Date | null
  note: string | null
}

export class CheckpointRepository {
  constructor(private readonly db: Database) {}

  async open(workstreamId: string, openedAt: Date = new Date()): Promise<Checkpoint> {
    const id = ulid(openedAt.getTime())
    await this.db.query(
      'INSERT INTO checkpoint (id, workstream_id, opened_at) VALUES ($1,$2,$3)',
      [id, workstreamId, openedAt.toISOString()],
    )
    return { id, workstreamId, openedAt, closedAt: null, note: null }
  }

  async close(id: string, closedAt: Date = new Date(), note: string | null = null): Promise<void> {
    await this.db.query(
      'UPDATE checkpoint SET closed_at = $2, note = $3 WHERE id = $1 AND closed_at IS NULL',
      [id, closedAt.toISOString(), note],
    )
  }

  async current(workstreamId: string): Promise<Checkpoint | null> {
    const res = await this.db.query(
      'SELECT * FROM checkpoint WHERE workstream_id = $1 AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1',
      [workstreamId],
    )
    const row = res.rows[0]
    return row ? toCheckpoint(row) : null
  }

  /** The most recently closed checkpoint — the boundary of "what changed". */
  async lastClosed(workstreamId: string): Promise<Checkpoint | null> {
    const res = await this.db.query(
      'SELECT * FROM checkpoint WHERE workstream_id = $1 AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1',
      [workstreamId],
    )
    const row = res.rows[0]
    return row ? toCheckpoint(row) : null
  }

  async list(workstreamId: string, limit = 20): Promise<Checkpoint[]> {
    const res = await this.db.query(
      'SELECT * FROM checkpoint WHERE workstream_id = $1 ORDER BY opened_at DESC LIMIT $2',
      [workstreamId, limit],
    )
    return res.rows.map(toCheckpoint)
  }
}

function toCheckpoint(r: Record<string, unknown>): Checkpoint {
  return {
    id: String(r.id),
    workstreamId: String(r.workstream_id),
    openedAt: new Date(r.opened_at as string),
    closedAt: r.closed_at ? new Date(r.closed_at as string) : null,
    note: r.note ? String(r.note) : null,
  }
}
