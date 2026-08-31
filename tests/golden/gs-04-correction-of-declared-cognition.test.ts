import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, buildView, correctCognition, declareCognition, rebuildStaleViews } from '@ava/app'
import type { AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * GS-04 — Correction of Declared Cognition.
 *
 * The invariant: the past is not rewritten. A correction adds; it never edits.
 * What makes this scenario worth having is the second half — the ANSWER has to
 * change, and the old wording has to remain readable. A system that keeps
 * history but keeps answering from the old version has preserved the record
 * and lost the point of it.
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock' }
}

describe('GS-04 correction of declared cognition', () => {
  it('preserves the original, makes the correction authoritative, and changes the answer', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Updates', null)

      // t1 — the original declaration.
      const t1 = await declareCognition(ctx, {
        content: 'I prefer concise project updates.',
        cognitionType: 'contextual_preference',
        workstreamId: ws.id,
      })

      const before = await ask(ctx, mockDeps(), {
        workstreamId: ws.id,
        question: 'What have I told you about my preferences for updates?',
      })
      expect(before.answer).toContain('concise project updates')
      expect(before.declaredCognitionIds).toEqual([t1.cognition.id])

      // A view built on the original wording.
      const view = await buildView(ctx, {
        title: 'Update preferences',
        summary: 'Concise updates preferred.',
        evidenceIds: [t1.evidence.id],
        workstreamId: ws.id,
      })
      expect(view.stale).toBe(false)

      // t2 — the correction, which contextualises rather than replaces wholesale.
      const t2 = await correctCognition(ctx, {
        cognitionId: t1.cognition.id,
        kind: 'contextualize',
        content:
          'For technical architecture decisions I prefer detailed reasoning. ' +
          'Concise applies to routine status updates.',
        scope: { decisionCategory: 'architecture' },
      })

      // 1. The original is still there, word for word.
      const original = await ctx.cognition.findById(t1.cognition.id)
      expect(original!.content).toBe('I prefer concise project updates.')
      expect(original!.status).toBe('superseded')
      expect(original!.supersededBy).toBe(t2.cognition.id)

      // Its evidence is untouched in the ledger.
      const originalEvidence = await ctx.evidence.findById(t1.evidence.id)
      expect(originalEvidence!.content).toBe('I prefer concise project updates.')

      // 2. The correction is authoritative, and part of the same chain.
      expect(t2.cognition.status).toBe('active')
      expect(t2.cognition.version).toBe(2)
      expect(t2.cognition.rootId).toBe(t1.cognition.rootId)

      // 3. The contexts are distinct: the new declaration is scoped.
      expect(t2.cognition.scope.decisionCategory).toBe('architecture')

      // 4. Views built on the old wording were invalidated, then rebuilt.
      const staleViews = (await ctx.memory.listViews(ws.id)).filter((v) => v.stale)
      expect(staleViews).toHaveLength(1)
      const rebuild = await rebuildStaleViews(ctx, ws.id)
      expect(rebuild.rebuilt).toBe(1)
      expect((await ctx.memory.listViews(ws.id)).every((v) => !v.stale)).toBe(true)

      // 5. The answer changes, and uses the correct context.
      const after = await ask(ctx, mockDeps(), {
        workstreamId: ws.id,
        question: 'What have I told you about my preferences for updates?',
        cognitionContext: { decisionCategory: 'architecture' },
      })
      expect(after.answer).toContain('detailed reasoning')
      expect(after.declaredCognitionIds).toEqual([t2.cognition.id])
      expect(after.declaredCognitionIds).not.toContain(t1.cognition.id)

      // 6. The Why surface can show the provenance of both.
      const dr = await ctx.decisionRecords.findById(after.decisionRecordId)
      expect(dr!.declaredCognitionIds).toEqual([t2.cognition.id])
      expect(dr!.cognitiveAuthority).toBe('DECLARED')
      expect(dr!.packet.declaredCognition[0]!.content).toContain('detailed reasoning')
      expect(dr!.packet.declaredCognition[0]!.matchReason).toContain('scope matches')

      // 7. The history is complete and ordered.
      const history = await ctx.cognition.history(t1.cognition.rootId)
      expect(history.map((h) => h.content)).toEqual([
        'I prefer concise project updates.',
        'For technical architecture decisions I prefer detailed reasoning. ' +
        'Concise applies to routine status updates.',
      ])

      // 8. Correction and supersession were both recorded as events.
      const counts = await ctx.telemetry.countByType()
      expect(counts.cognition_declared).toBe(1)
      expect(counts.cognition_contextualized).toBe(1)
      expect(counts.cognition_superseded).toBe(1)
      expect(counts.memory_view_rebuilt).toBe(1)
    })
  })

  it('refuses to correct a version that has already been replaced', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Chain', null)
      const t1 = await declareCognition(ctx, {
        content: 'I prefer short meetings.', cognitionType: 'contextual_preference',
        workstreamId: ws.id,
      })
      await correctCognition(ctx, { cognitionId: t1.cognition.id, content: 'I prefer 25-minute meetings.' })

      // Correcting the old version would fork the history into two "current"
      // positions, and neither could be trusted.
      await expect(
        correctCognition(ctx, { cognitionId: t1.cognition.id, content: 'Something else.' }),
      ).rejects.toThrow(/already been replaced/)
    })
  })
})
