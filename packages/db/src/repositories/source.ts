import { ulid } from '@ava/core'
import type { Database } from '../client'

export type SourceKind = 'manual_capture' | 'chat' | 'file_upload'

export interface SourceRecord {
  id: string
  kind: SourceKind
  authority: string
  availabilityState: 'available' | 'partial' | 'unavailable'
}

/**
 * Sources exist even though Batch 1 has only manual capture: a future
 * connector must slot in as a new `kind`, not as a schema migration.
 */
export class SourceRepository {
  constructor(private readonly db: Database) {}

  async ensureManualCapture(): Promise<SourceRecord> {
    const existing = await this.db.query<{ id: string; kind: string; authority: string; availability_state: string }>(
      "SELECT * FROM source_record WHERE kind = 'manual_capture' LIMIT 1",
    )
    const row = existing.rows[0]
    if (row) {
      return {
        id: row.id, kind: row.kind as SourceKind, authority: row.authority,
        availabilityState: row.availability_state as SourceRecord['availabilityState'],
      }
    }
    const id = ulid()
    await this.db.query(
      "INSERT INTO source_record (id, kind, authority, last_ingested_at) VALUES ($1,'manual_capture','user_direct', now())",
      [id],
    )
    return { id, kind: 'manual_capture', authority: 'user_direct', availabilityState: 'available' }
  }
}
