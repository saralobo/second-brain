import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { checkAssertiveness } from '@ava/core'
import {
  buildBriefing, currentStateQuiet, generateOpportunities, openCheckpoint,
  seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'

/**
 * GS-02 — Invalidated Artifact, completing the scenario Slice 2 opened.
 *
 *   Decision A → Artifact X depends on A → B supersedes A
 *   → Change: superseded → Impact: X potentially outdated
 *   → Opportunity: X may need review → Show Policy → Today
 *
 * The invariant under test is that Change and Impact stay distinct, that
 * propagation stops at declared relations, and that the language never
 * hardens "may need review" into "is invalid".
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
describe('GS-02 — a superseded decision reaches the artifact that depends on it', () => {
  it('runs Change → Impact → Opportunity → Show with no provider at all', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)

      // Before the correction there is nothing to raise about the artifact.
      const before = await generateOpportunities(ctx, seed.workstreamId)
      expect(before.generated.some((o) => o.opportunityClass === 'unpropagated_decision'))
        .toBe(false)

      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)

      // Impact moved the artifact to `outdated` — a new version, with the
      // previous one still readable.
      const state = await currentStateQuiet(ctx, seed.workstreamId)
      const artifact = state.entries.find((e) => e.objectId === seed.artifactObjectId)!
      expect(artifact.current.status).toBe('outdated')
      expect(artifact.current.version).toBe(2)
      expect(artifact.superseded[0]?.status).toBe('draft')

      const result = await generateOpportunities(ctx, seed.workstreamId)
      const opportunity = result.generated.find(
        (o) => o.opportunityClass === 'unpropagated_decision')!
      expect(opportunity).toBeDefined()

      // Change ≠ Impact: the trigger is the change on the DECISION, and the
      // affected object is the artifact.
      const trigger = await ctx.changes.listByObject(seed.decisionObjectId)
      expect(trigger.some((c) => c.changeType === 'superseded')).toBe(true)
      expect(opportunity.affectedObjects.map((a) => a.objectId))
        .toContain(seed.artifactObjectId)
      expect(opportunity.affectedObjects.every((a) => a.depth <= 2)).toBe(true)
      expect(opportunity.affectedObjects[0]?.relation).toBe('potentially_outdated')

      // It reaches Today.
      const briefing = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      const shown = briefing.blocks.flatMap((b) => b.items)
        .find((i) => i.opportunityId === opportunity.id)
      expect(shown).toBeDefined()
      expect(opportunity.show.verdict).toBe('PASS')
    })
  })

  it('says the artifact MAY need review, never that it is invalid', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
      const result = await generateOpportunities(ctx, seed.workstreamId)

      for (const o of result.generated) {
        const check = checkAssertiveness(`${o.headline} ${o.detail}`, o.strength, o.contextHealth)
        expect(check.problems).toEqual([])
        expect(`${o.headline} ${o.detail}`).not.toMatch(/\byou need to\b/i)
      }
      const opportunity = result.generated.find(
        (o) => o.opportunityClass === 'unpropagated_decision')!
      expect(opportunity.headline).toMatch(/may need review/i)
      expect(opportunity.detail).toMatch(/cannot tell whether/i)
    })
  })

  /**
   * GS-07 in the proactive path. Slice 1 established that an ambiguous entity
   * stays unresolved rather than being merged; the consequence here is that a
   * relation AVA never had must not produce an opportunity. Proximity, name
   * similarity and shared vocabulary are not dependencies.
   */
  it('raises nothing when the dependency was never declared', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await ctx.db.query('DELETE FROM relationship')
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)

      const result = await generateOpportunities(ctx, seed.workstreamId)
      expect(result.generated.some((o) => o.opportunityClass === 'unpropagated_decision'))
        .toBe(false)
      expect(result.generated.some((o) => o.opportunityClass === 'upcoming_commitment'))
        .toBe(false)
    })
  })
})
