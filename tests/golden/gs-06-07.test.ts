import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { countIndependentEvidence, ulid } from '@ava/core'
import { capture } from '@ava/app'

/**
 * GS-06 — System-origin evidence cannot self-confirm.
 * GS-07 — Entity ambiguity remains unresolved.
 */
describe('GS-06 system-origin evidence cannot self-confirm', () => {
  it('does not let AVA output raise the diversity behind a claim', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      const source = await ctx.sources.ensureManualCapture()

      const user = await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        content: 'We will ship the reader before the conference.',
      })
      if (!user.ok) throw new Error('capture failed')

      // AVA produces a summary of that claim, which later reappears as input.
      const systemEcho = await ctx.evidence.append({
        content: 'Summary: the reader ships before the conference.',
        contentOrigin: 'system',
        sourceRecordId: source.id, workstreamId: ws.id, captureType: 'note', title: null,
        observedAt: new Date(), effectiveAt: null, effectiveAtInferred: false,
        strength: 'SUPPORTED', sensitivity: 'normal',
        lineage: { rootRunId: 'run-1', producedBy: 'ava', derivedFromEvidenceIds: [user.evidence.id] },
        fields: {},
      })

      // Two rows, but only one independent source of evidence.
      expect(countIndependentEvidence([user.evidence, systemEcho])).toBe(1)
      // And the system row alone corroborates nothing.
      expect(countIndependentEvidence([systemEcho])).toBe(0)
    })
  })

  it('counts copies sharing a lineage root as one source', async () => {
    const root = { rootRunId: 'run-9', producedBy: 'import', derivedFromEvidenceIds: [] }
    const copies = [
      { id: ulid(), contentOrigin: 'user' as const, lineage: root },
      { id: ulid(), contentOrigin: 'user' as const, lineage: root },
      { id: ulid(), contentOrigin: 'user' as const, lineage: root },
    ]
    expect(countIndependentEvidence(copies)).toBe(1)
  })
})

describe('GS-07 entity ambiguity remains unresolved', () => {
  it('keeps ambiguous entities distinct rather than merging them', async () => {
    await withTestContext(async (ctx) => {
      // Two entities that plausibly refer to the same thing. Nothing in Batch 1
      // may merge them: unresolved is a legitimate, preferred outcome.
      for (const name of ['Alpha reader spec', 'Reader spec (Alpha)']) {
        await ctx.db.query(
          `INSERT INTO entity (id, type, canonical_name, source_identifiers)
           VALUES ($1,'document',$2,'[]'::jsonb)`,
          [ulid(), name],
        )
      }

      const rows = await ctx.db.query<{ id: string; resolution_status: string; merged_into: string | null }>(
        'SELECT id, resolution_status, merged_into FROM entity',
      )
      expect(rows.rows).toHaveLength(2)
      for (const r of rows.rows) {
        expect(r.resolution_status).toBe('unresolved')
        expect(r.merged_into).toBeNull()
      }
    })
  })
})
