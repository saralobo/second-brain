import { ulid } from '@ava/core'
import type { Database } from '../client'

export interface Workstream {
  id: string
  name: string
  goal: string | null
  status: 'active' | 'paused' | 'closed'
  createdAt: Date
}

interface Row {
  id: string; name: string; goal: string | null; status: string; created_at: string | Date
}

function toWorkstream(r: Row): Workstream {
  return {
    id: r.id, name: r.name, goal: r.goal,
    status: r.status as Workstream['status'],
    createdAt: new Date(r.created_at),
  }
}

export class WorkstreamRepository {
  constructor(private readonly db: Database) {}

  async create(name: string, goal: string | null = null): Promise<Workstream> {
    const id = ulid()
    await this.db.query(
      'INSERT INTO workstream (id, name, goal) VALUES ($1, $2, $3)',
      [id, name.trim(), goal],
    )
    const created = await this.findById(id)
    if (!created) throw new Error('workstream insert did not persist')
    return created
  }

  async list(): Promise<Workstream[]> {
    const res = await this.db.query<Row>('SELECT * FROM workstream ORDER BY created_at DESC')
    return res.rows.map(toWorkstream)
  }

  async findById(id: string): Promise<Workstream | null> {
    const res = await this.db.query<Row>('SELECT * FROM workstream WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toWorkstream(row) : null
  }
}
