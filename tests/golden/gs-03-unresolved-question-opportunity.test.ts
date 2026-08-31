import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  buildBriefing, closeCheckpoint, generateOpportunities, openCheckpoint, seedProactiveScenario,
} from '@ava/app'

/**
 * GS-03 — Unresolved Question, the Slice 5 half.
 *
 * A question that passes a checkpoint without an answer becomes an
 * opportunity — and the opportunity says the question is open. It never
 * supplies an answer, never guesses one, and never quietly closes the
 * question to make the briefing tidier.
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
describe('GS-03 — an open question becomes an opportunity without being answered', () => {
  it('raises the question only once it is relevant, and leaves it open', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await closeCheckpoint(ctx, seed.workstreamId, 'checkpoint passed with no answer')

      const result = await generateOpportunities(ctx, seed.workstreamId)
      const opportunity = result.generated.find(
        (o) => o.opportunityClass === 'unresolved_question')
      expect(opportunity).toBeDefined()
      expect(opportunity!.affectedObjects.map((a) => a.objectId))
        .toContain(seed.commitmentObjectId)

      // The question itself is untouched: still open, still unanswered.
      const versions = await ctx.state.versionsOfObject(seed.questionObjectId)
      expect(versions).toHaveLength(1)
      expect(versions[0]?.status).toBe('open')

      // And nothing in what AVA says pretends to resolve it.
      const text = `${opportunity!.headline} ${opportunity!.detail} ${opportunity!.minimalAction}`
      expect(text).toMatch(/still open/i)
      expect(text).toMatch(/has not invented an answer/i)
      expect(text).not.toMatch(/the answer is/i)
    })
  })

  it('stays quiet about a question that nothing has made relevant', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Quiet', 'one lonely question')
      await openCheckpoint(ctx, ws.id)
      const { capture } = await import('@ava/app')
      await capture(ctx, {
        workstreamId: ws.id, type: 'question',
        title: 'Should the reader support annotations in landscape?',
        content: 'Nobody has answered this and nothing depends on it yet.',
      })
      const result = await generateOpportunities(ctx, ws.id)
      expect(result.generated).toHaveLength(0)
    })
  })

  it('appears in Today under a block, with a route to Why', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      const briefing = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      const items = briefing.blocks.flatMap((b) => b.items).filter((i) => i.opportunityId)
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        expect(item.whyHref).toMatch(/^\/why\/opportunity\//)
        expect(['ESTABLISHED', 'SUPPORTED', 'SPECULATIVE']).toContain(item.strength)
      }
    })
  })
})
