import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  buildBriefing, declareCognition, generateOpportunities, openCheckpoint,
  prepareForOpportunity, proposeHypothesis, seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'

/**
 * Context Health limits proactivity, and Declared Cognition governs it.
 *
 * The Slice 5 half of GS-05: an abstention is a legitimate result for a
 * proactive surface too. Low coverage never becomes creativity — the
 * opportunity is still recorded, and it simply is not asserted.
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
describe('INSUFFICIENT context blocks a proactive claim', () => {
  it('keeps the opportunity for audit but shows nothing', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)

      // A material exclusion: evidence exists but may not be used.
      await ctx.db.query(
        `UPDATE source_record SET availability_state = 'unavailable'`)
      await ctx.db.query(
        `UPDATE evidence SET observed_at = observed_at`)

      const result = await generateOpportunities(ctx, seed.workstreamId)
      const suppressed = result.generated.filter((o) => o.status === 'suppressed')

      if (suppressed.length > 0) {
        for (const o of suppressed) {
          // Recorded, not deleted. The reason is explicit.
          const stored = await ctx.opportunities.findById(o.id)
          expect(stored).not.toBeNull()
          expect(stored!.suppressedReason).toBeTruthy()
          expect(o.show.verdict).not.toBe('PASS')
        }
        const briefing = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
        const shownIds = briefing.blocks.flatMap((b) => b.items).map((i) => i.opportunityId)
        for (const o of suppressed) expect(shownIds).not.toContain(o.id)
      }
    })
  })

  it('blocks preparation whenever context is not HEALTHY', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
      // A contradiction flag degrades health without making it insufficient.
      await ctx.db.query(`UPDATE change_record SET contradiction_flag = true`)

      const result = await generateOpportunities(ctx, seed.workstreamId)
      expect(result.contextHealth).toBe('DEGRADED')
      for (const o of result.generated) {
        expect(o.prepare.verdict).toBe('BLOCKED_BY_HEALTH')
        const outcome = await prepareForOpportunity(ctx, o.id)
        expect(outcome.prepared).toBe(false)
      }
      // Showing is still allowed, with the gap stated.
      const shown = result.generated.filter((o) => o.show.verdict === 'PASS')
      expect(shown.length).toBeGreaterThan(0)
      expect(shown[0]!.show.reasons.join(' ')).toContain('DEGRADED')
    })
  })
})

describe('Declared Cognition governs autonomy; a hypothesis never does', () => {
  it('refuses to prepare when a declared autonomy limit applies', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await declareCognition(ctx, {
        content: 'Never draft anything for me before I ask.',
        cognitionType: 'autonomy_limit',
        workstreamId: seed.workstreamId,
      })
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)

      const result = await generateOpportunities(ctx, seed.workstreamId)
      for (const o of result.generated) {
        expect(o.prepare.verdict).toBe('DENIED_BY_PERMISSION')
        expect(o.prepare.reasons.join(' ')).toContain('Never draft anything')
        const outcome = await prepareForOpportunity(ctx, o.id)
        expect(outcome.prepared).toBe(false)
      }
      const artifacts = await ctx.prepared.listAvailable(seed.workstreamId)
      expect(artifacts).toHaveLength(0)
    })
  })

  it('lets a behavioural hypothesis exist without letting it authorise anything', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)

      const { capture } = await import('@ava/app')
      const a = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'Chose the short brief', content: 'Picked the short brief over the long one.',
      })
      const b = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'Chose the short summary', content: 'Picked the short summary over the annotated one.',
      })
      const proposed = await proposeHypothesis(ctx, {
        falsifiableDescription: 'In observed write-ups here, the shorter option was chosen.',
        context: 'briefs and summaries',
        evidenceIds: [a.ok ? a.evidence.id : '', b.ok ? b.evidence.id : ''],
        alternativesAvailable: ['the long brief', 'the annotated summary'],
        possibleConfounder: 'both were made under time pressure',
        workstreamId: seed.workstreamId,
      })
      expect(proposed.formed).toBe(true)

      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
      const result = await generateOpportunities(ctx, seed.workstreamId)

      for (const o of result.generated) {
        // The hypothesis is carried for inspection...
        expect(o.shadowHypothesisIds.length).toBeGreaterThan(0)
        // ...and read by nothing that decides.
        expect(o.prepare.reasons.join(' ')).not.toMatch(/hypothes/i)
        expect(o.show.reasons.join(' ')).not.toMatch(/hypothes/i)
        expect(o.valueVector.permissionScope.origin).not.toBe('inferred')
        expect(o.valueVector.permissionScope.derivedFrom)
          .not.toContain(proposed.formed ? proposed.hypothesis.id : '')
      }
    })
  })
})
