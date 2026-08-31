import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { availableMigrations, appliedMigrations, hashContent } from '@ava/db'
import { capture } from '@ava/app'

describe('migrations', () => {
  it('applies every migration from zero', async () => {
    await withTestContext(async (ctx) => {
      const available = await availableMigrations()
      const applied = await appliedMigrations(ctx.db)
      expect(applied).toEqual(available)
      expect(available.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('creates the expected tables', async () => {
    await withTestContext(async (ctx) => {
      const res = await ctx.db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      )
      const tables = res.rows.map((r) => r.table_name)
      for (const t of [
        'validation_event', 'workstream', 'source_record', 'evidence',
        'evidence_annotation', 'raw_input', 'state_object', 'state_object_version',
        'relationship', 'change_record', 'entity',
      ]) {
        expect(tables, `missing table ${t}`).toContain(t)
      }
    })
  })
})

describe('evidence ledger is append-only', () => {
  it('refuses a direct UPDATE at the database, not merely in the repository', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      const out = await capture(ctx, {
        workstreamId: ws.id, type: 'note', content: 'original wording that must survive',
      })
      expect(out.ok).toBe(true)
      if (!out.ok) return

      await ctx.db.query("UPDATE evidence SET content = 'TAMPERED'")
      const after = await ctx.evidence.findById(out.evidence.id)
      expect(after?.content).toBe('original wording that must survive')
    })
  })

  it('refuses a direct DELETE', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'keep me' })
      await ctx.db.query('DELETE FROM evidence')
      expect(await ctx.evidence.count()).toBe(1)
    })
  })

  it('exposes no update or delete on the repository interface', async () => {
    await withTestContext(async (ctx) => {
      const repo = ctx.evidence as unknown as Record<string, unknown>
      expect(typeof repo.append).toBe('function')
      expect(repo.update).toBeUndefined()
      expect(repo.delete).toBeUndefined()
      expect(repo.remove).toBeUndefined()
    })
  })

  it('stores a content hash that matches the stored content', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      const out = await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'hash me' })
      if (!out.ok) throw new Error('capture failed')
      expect(out.evidence.hash).toBe(hashContent('hash me'))
    })
  })

  it('keeps the same content observed twice as two observations', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'same words' })
      await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'same words' })
      expect(await ctx.evidence.count()).toBe(2)
    })
  })
})

describe('validation telemetry', () => {
  it('rejects a backdated event at the database', async () => {
    await withTestContext(async (ctx) => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      await expect(
        ctx.db.query(
          `INSERT INTO validation_event (id, event_type, occurred_at, subject_type, subject_id)
           VALUES ('X','evidence_arrived',$1,'evidence','E1')`,
          [past],
        ),
      ).rejects.toThrow()
    })
  })

  it('rejects a future-dated event', async () => {
    await withTestContext(async (ctx) => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await expect(
        ctx.db.query(
          `INSERT INTO validation_event (id, event_type, occurred_at, subject_type, subject_id)
           VALUES ('Y','evidence_arrived',$1,'evidence','E1')`,
          [future],
        ),
      ).rejects.toThrow()
    })
  })

  it('refuses to emit an event that belongs to a later slice', async () => {
    await withTestContext(async (ctx) => {
      await expect(
        ctx.telemetry.record({
          // Slice 5 event: emitting it now would fabricate a timeline.
          eventType: 'opportunity_shown',
          occurredAt: new Date(), subjectType: 'opportunity', subjectId: 'O1',
        }),
      ).rejects.toThrow(/later slice/)
    })
  })
})
