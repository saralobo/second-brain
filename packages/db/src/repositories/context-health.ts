import { ulid } from '@ava/core'
import type { ContextHealthResult } from '@ava/core'
import type { Database } from '../client'

/** Persists a computed health assessment so an abstention stays explainable. */
export class ContextHealthRepository {
  constructor(private readonly db: Database) {}

  async record(
    task: string,
    workstreamId: string | null,
    result: ContextHealthResult,
  ): Promise<string> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO context_health (id, task, workstream_id, state, decided_by, dimensions, gaps)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id, task, workstreamId, result.state, result.decidedBy,
        JSON.stringify(result.dimensions), JSON.stringify(result.gaps),
      ],
    )
    return id
  }

  async findById(id: string): Promise<ContextHealthResult | null> {
    const res = await this.db.query('SELECT * FROM context_health WHERE id = $1', [id])
    const row = res.rows[0]
    if (!row) return null
    return {
      state: row.state as ContextHealthResult['state'],
      decidedBy: row.decided_by ? (row.decided_by as ContextHealthResult['decidedBy']) : null,
      dimensions: (row.dimensions ?? []) as ContextHealthResult['dimensions'],
      gaps: (row.gaps ?? []) as string[],
    }
  }
}
