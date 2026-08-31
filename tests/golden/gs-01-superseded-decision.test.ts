import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { capture, currentStateQuiet } from '@ava/app'

/**
 * GS-01 — Superseded Decision.
 *
 * The Milestone 1 loop, end to end, with no model involved at any step.
 */
describe('GS-01 superseded decision', () => {
  it('runs the whole capture and change loop deterministically', async () => {
    await withTestContext(async (ctx) => {
      // 1. Workstream created
      const ws = await ctx.workstreams.create('Project Alpha', 'Synthetic scenario')

      // 2. Decision A captured  →  3. Evidence A persisted
      const a = await capture(ctx, {
        workstreamId: ws.id,
        type: 'decision',
        title: 'Decision A: store annotations locally only',
        content: 'Annotations stay on the device. No sync service in the first version.',
      })
      expect(a.ok).toBe(true)
      if (!a.ok || !a.change) throw new Error('decision capture failed')

      const evidenceA = a.evidence
      const objectId = a.change.objectId
      expect(a.change.change?.changeType).toBe('created')
      expect(a.change.change?.detector).toBe('stage1_identity')

      // 4. Current State contains Decision A
      const before = await currentStateQuiet(ctx, ws.id)
      const entryBefore = before.entries.find((e) => e.objectId === objectId)
      expect(entryBefore?.current.status).toBe('made')
      expect(entryBefore?.current.version).toBe(1)
      expect(entryBefore?.superseded).toHaveLength(0)

      // 5. New capture supersedes Decision A  →  6. Evidence B persisted
      const b = await capture(ctx, {
        workstreamId: ws.id,
        type: 'correction',
        title: 'Decision A replaced: annotations sync through an encrypted store',
        content: 'Testers lost annotations after reinstalling. Local-only no longer holds.',
        supersedesStateObjectId: objectId,
      })
      expect(b.ok).toBe(true)
      if (!b.ok || !b.change) throw new Error('correction capture failed')

      // 7. Decision A remains historically reachable
      const versions = await ctx.state.versionsOfObject(objectId)
      expect(versions).toHaveLength(2)
      expect(versions[0]?.version).toBe(1)
      expect(versions[0]?.title).toContain('store annotations locally only')
      expect(versions[0]?.supersededBy).toBe(versions[1]?.id)

      const originalEvidence = await ctx.evidence.findById(evidenceA.id)
      expect(originalEvidence?.content).toContain('No sync service in the first version')

      // 8. Current State now points to B
      const after = await currentStateQuiet(ctx, ws.id)
      const entryAfter = after.entries.find((e) => e.objectId === objectId)
      expect(entryAfter?.current.version).toBe(2)
      expect(entryAfter?.current.status).toBe('superseded')
      expect(entryAfter?.current.title).toContain('encrypted store')
      expect(entryAfter?.superseded).toHaveLength(1)

      // 9. ChangeRecord created
      const changes = await ctx.changes.listByObject(objectId)
      const superseded = changes.find((c) => c.changeType === 'superseded')
      expect(superseded).toBeDefined()
      expect(superseded?.beforeVersionRef).toBe(versions[0]?.id)
      expect(superseded?.afterVersionRef).toBe(versions[1]?.id)
      expect(superseded?.evidenceIds).toContain(b.evidence.id)
      expect(superseded?.detectorVersion).toBe('1.0.0')

      // No model took part anywhere in this loop.
      for (const c of changes) {
        expect(c.detector).not.toBe('stage5_semantic')
      }

      // 10. The timeline needed for prospective validation exists.
      const counts = await ctx.telemetry.countByType()
      expect(counts.evidence_arrived).toBe(2)
      expect(counts.change_detectable_at).toBe(2)
      expect(counts.change_detected).toBe(2)
    })
  })
})
