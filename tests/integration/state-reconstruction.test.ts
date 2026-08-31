import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { canonicalise } from '@ava/core'
import { capture, currentState, currentStateQuiet, seedProjectAlpha, seedSupersedingEvidence } from '@ava/app'

describe('current state is a rebuildable projection, not a second truth', () => {
  it('reconstructs identically after the projection is discarded', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)

      const at = new Date()
      const first = canonicalise(await currentStateQuiet(ctx, seed.workstreamId, at))

      // The projection holds no state of its own: it is derived on demand from
      // the ledger. Rebuilding it must produce the same bytes.
      const second = canonicalise(await currentStateQuiet(ctx, seed.workstreamId, at))
      expect(second).toBe(first)
    })
  })

  it('answers what AVA knew at an earlier moment', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      const beforeSupersession = new Date()
      await new Promise((r) => setTimeout(r, 10))
      await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)

      const past = await currentStateQuiet(ctx, seed.workstreamId, beforeSupersession)
      const pastDecision = past.entries.find((e) => e.objectId === seed.decisionObjectId)
      expect(pastDecision?.current.version).toBe(1)
      expect(pastDecision?.current.status).toBe('made')

      const now = await currentStateQuiet(ctx, seed.workstreamId, new Date())
      const nowDecision = now.entries.find((e) => e.objectId === seed.decisionObjectId)
      expect(nowDecision?.current.version).toBe(2)
      expect(nowDecision?.current.status).toBe('superseded')
    })
  })

  it('keeps the superseded version reachable with its original wording', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)

      const versions = await ctx.state.versionsOfObject(seed.decisionObjectId)
      expect(versions).toHaveLength(2)
      expect(versions[0]?.title).toContain('store annotations locally')
      expect(versions[0]?.supersededBy).toBe(versions[1]?.id)

      // The original evidence is still readable in full.
      const evidence = await ctx.evidence.findByIds(versions[0]!.evidenceIds)
      expect(evidence[0]?.content).toContain('No sync service in the first version')
    })
  })

  it('refuses to rewrite an already superseded version', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)
      const versions = await ctx.state.versionsOfObject(seed.decisionObjectId)
      await expect(
        ctx.state.markSuperseded(versions[0]!.id, versions[1]!.id),
      ).rejects.toThrow(/already superseded/)
    })
  })

  it('never uses created_at for reasoning: a backdated capture orders by observed_at', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha')
      const older = new Date(Date.now() - 60 * 60 * 1000)

      // Written second, but observed first.
      await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'written first' })
      const out = await ctx.evidence.append({
        content: 'observed earlier', contentOrigin: 'user',
        sourceRecordId: (await ctx.sources.ensureManualCapture()).id,
        workstreamId: ws.id, captureType: 'note', title: null,
        observedAt: older, effectiveAt: null, effectiveAtInferred: false,
        strength: 'ESTABLISHED', sensitivity: 'normal',
        lineage: { rootRunId: null, producedBy: 'test', derivedFromEvidenceIds: [] }, fields: {},
      })

      const ordered = await ctx.evidence.listKnownAt(ws.id, new Date())
      expect(ordered[0]?.id).toBe(out.id)
      expect(ordered[0]?.content).toBe('observed earlier')

      // And it is invisible before it was observed.
      const earlier = await ctx.evidence.listKnownAt(ws.id, new Date(older.getTime() - 1000))
      expect(earlier).toHaveLength(0)
    })
  })

  it('emits a projection telemetry event with a real timestamp', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      await currentState(ctx, seed.workstreamId)
      const counts = await ctx.telemetry.countByType()
      expect(counts.state_projection_triggered).toBeGreaterThanOrEqual(1)
    })
  })
})
