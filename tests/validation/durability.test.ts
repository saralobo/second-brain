import { describe, expect, it } from 'vitest'
import { openDatabaseFromDump, openTestDatabase, migrate } from '@ava/db'
import { buildContext } from '@ava/app'
import {
  buildBriefing, generateOpportunities, openCheckpoint, recordFeedback, recordUserAction,
  resolveOutcome, seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'

/**
 * Deviation D-02 — PGlite durability, revisited before prospective validation.
 *
 * The technology was never the question: PGlite is genuine PostgreSQL with the
 * same SQL and the same migrations. What was open is whether a longitudinal
 * record can survive months of real use, and until this slice there was no
 * backup, no export and no restore — so one lost directory would have taken
 * the entire evidence trail with it.
 *
 * A backup nobody has restored is a hypothesis. This restores one.
 */
describe('D-02 — a backup can be taken and restored', () => {
  it('round-trips the whole evidence trail, rows and history intact', async () => {
    const db = await openTestDatabase()
    await migrate(db)
    const ctx = buildContext(db)

    const seed = await seedProactiveScenario(ctx)
    await openCheckpoint(ctx, seed.workstreamId)
    await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
    await generateOpportunities(ctx, seed.workstreamId)
    await buildBriefing(ctx, seed.workstreamId, { deliver: true })
    const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
    const opportunity = all.find((o) => o.shownAt !== null)!
    await recordFeedback(ctx, {
      targetType: 'opportunity', targetId: opportunity.id,
      epistemic: 'correct', delivery: 'valuable',
    })
    await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'reviewed' })
    await resolveOutcome(ctx, opportunity.id)

    const before = await counts(db)
    const dump = await db.dump()
    expect(dump.byteLength).toBeGreaterThan(0)
    await db.close()

    const restored = await openDatabaseFromDump(dump)
    try {
      expect(await counts(restored)).toEqual(before)

      // The parts that matter most survive as themselves, not as row counts.
      const gen = await restored.query<{ generated_at: string; policy_version: string }>(
        'SELECT generated_at, policy_version FROM opportunity_generation WHERE opportunity_id = $1',
        [opportunity.id])
      expect(gen.rows[0]!.policy_version).toBe(opportunity.show.version)
      expect(new Date(gen.rows[0]!.generated_at).getTime())
        .toBe(opportunity.generation.generatedAt.getTime())

      const fb = await restored.query<{ epistemic: string; delivery: string }>(
        'SELECT epistemic, delivery FROM feedback WHERE opportunity_id = $1', [opportunity.id])
      expect(fb.rows[0]!.epistemic).toBe('correct')
      expect(fb.rows[0]!.delivery).toBe('valuable')

      const events = await restored.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM validation_event WHERE time_basis = 'reported'`)
      expect(Number(events.rows[0]!.n)).toBeGreaterThan(0)
    } finally {
      await restored.close()
    }
  })

  it('keeps the restored database append-only', async () => {
    const db = await openTestDatabase()
    await migrate(db)
    const ctx = buildContext(db)
    const seed = await seedProactiveScenario(ctx)
    const dump = await db.dump()
    await db.close()

    const restored = await openDatabaseFromDump(dump)
    try {
      const before = await restored.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM evidence')
      await restored.query('DELETE FROM evidence')
      const after = await restored.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM evidence')
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n)
      expect(seed.workstreamId).toBeTruthy()
    } finally {
      await restored.close()
    }
  })
})

const TABLES = [
  'evidence', 'validation_event', 'decision_record', 'opportunity',
  'opportunity_generation', 'feedback', 'user_action', 'outcome', 'model_run',
] as const

async function counts(db: { query: <T>(s: string) => Promise<{ rows: T[] }> }) {
  const out: Record<string, number> = {}
  for (const t of TABLES) {
    const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)
    out[t] = Number(r.rows[0]?.n ?? '0')
  }
  return out
}
