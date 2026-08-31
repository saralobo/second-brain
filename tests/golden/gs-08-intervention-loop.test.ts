import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  ask, buildBriefing, generateOpportunities, interventionHistory, interventionMetrics,
  openCheckpoint, recordFeedback, recordOutcome, recordUserAction, resolveOutcome,
  seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'
import type { AppContext, AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * GS-08 — Opportunity shown → feedback → outcome.
 *
 * The closed loop, plus the two negative cases that matter more than the happy
 * one: `correct + already_known`, where AVA was right and added nothing, and
 * `incorrect + irrelevant`, where AVA was simply wrong. In both, nothing about
 * how AVA decides may change.
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock', caps: undefined }
}

async function shown(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  await generateOpportunities(ctx, seed.workstreamId)
  await buildBriefing(ctx, seed.workstreamId, { deliver: true })
  const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
  const opportunity = all.find(
    (o) => o.shownAt !== null && o.opportunityClass === 'unpropagated_decision')
    ?? all.find((o) => o.shownAt !== null)!
  return { seed, opportunity }
}

describe('GS-08 — the loop closes', () => {
  it('runs generated → shown → correct → valuable → action → resolved', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shown(ctx)

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'valuable',
      })
      await recordUserAction(ctx, {
        opportunityId: opportunity.id, kind: 'reviewed',
        description: 'Reviewed the proposal against architecture B and updated it.',
      })
      const resolution = await resolveOutcome(ctx, opportunity.id)
      expect(resolution.state).toBe('resolved')

      const history = (await interventionHistory(ctx, opportunity.id))!
      expect(history.feedback.epistemic).toBe('correct')
      expect(history.feedback.delivery).toBe('valuable')
      expect(history.actions.map((a) => a.kind)).toContain('reviewed')
      expect(history.outcome?.state).toBe('resolved')
      expect(history.outcome?.resolvedBy).toBe('deterministic_event')

      // Everything stays hung off the original opportunity and its record.
      expect(history.outcome?.opportunityId).toBe(opportunity.id)
      expect(history.outcome?.decisionRecordId).not.toBeNull()

      // The timeline runs from evidence to outcome, with `seen` still absent.
      const t = history.timeline
      expect(t.evidenceArrivedAt!.getTime()).toBeLessThanOrEqual(t.opportunityGeneratedAt.getTime())
      expect(t.opportunityGeneratedAt.getTime()).toBeLessThanOrEqual(t.opportunityShownAt!.getTime())
      expect(t.feedbackAt).not.toBeNull()
      expect(t.userActionAt).not.toBeNull()
      expect(t.outcomeAt).not.toBeNull()
      expect(t.userSeenAt).toBeNull()
    })
  })
})

/**
 * The case that justifies two dimensions existing at all. AVA was right and
 * the user already knew — a system with one rating would have to call that
 * either a success or a failure, and it is neither.
 */
describe('GS-08 negative — correct, but already known', () => {
  it('keeps correctness positive while value is not', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shown(ctx)
      const policiesBefore = JSON.stringify(opportunity.show)
      const declarationsBefore = (await ctx.cognition.listAll()).length
      const hypothesesBefore = (await ctx.hypotheses.list(seed.workstreamId)).length

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'already_known',
      })

      const history = (await interventionHistory(ctx, opportunity.id))!
      expect(history.feedback.epistemic).toBe('correct')
      expect(history.feedback.delivery).toBe('already_known')

      // Nothing about how AVA decides moves.
      const after = await ctx.opportunities.findById(opportunity.id)
      expect(JSON.stringify(after!.show)).toBe(policiesBefore)
      expect((await ctx.cognition.listAll()).length).toBe(declarationsBefore)
      expect((await ctx.hypotheses.list(seed.workstreamId)).length).toBe(hypothesesBefore)

      // And the counts keep the two apart.
      const report = await interventionMetrics(ctx, seed.workstreamId)
      expect(report.counts.epistemic.correct).toBe(1)
      expect(report.counts.delivery.already_known).toBe(1)
      expect(report.counts.delivery.valuable).toBe(0)
    })
  })
})

describe('GS-08 negative — incorrect and irrelevant', () => {
  it('persists the judgement and destroys nothing', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shown(ctx)
      const drBefore = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 100)
      const generationBefore = JSON.stringify(opportunity.generation)

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'incorrect', delivery: 'irrelevant',
        reason: 'the proposal had already been rewritten',
      })

      const history = (await interventionHistory(ctx, opportunity.id))!
      expect(history.feedback.epistemic).toBe('incorrect')
      expect(history.feedback.delivery).toBe('irrelevant')

      // The opportunity, its snapshot and its DecisionRecords are untouched.
      const after = await ctx.opportunities.findById(opportunity.id)
      expect(after).not.toBeNull()
      expect(after!.shownAt).not.toBeNull()
      expect(JSON.stringify(after!.generation)).toBe(generationBefore)

      const drAfter = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 100)
      expect(drAfter.map((d) => d.id).sort()).toEqual(drBefore.map((d) => d.id).sort())
      const generation = drAfter.find((d) => d.scopeMatch.opportunityId === opportunity.id)!
      expect(generation.abstained).toBe(false)
      expect(JSON.stringify(generation)).not.toContain('irrelevant')
    })
  })

  it('does not become a preference about the user', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shown(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'irrelevant',
        reason: 'I never want to hear about this category again',
      })

      // A judgement about one item is not a declaration about the person, and
      // AVA has no route from one to the other. If she wants a principle, she
      // has to declare it.
      expect(await ctx.cognition.listAll()).toHaveLength(0)
      expect(await ctx.hypotheses.list(seed.workstreamId)).toHaveLength(0)
      const observations = await ctx.observations.list(seed.workstreamId)
      expect(observations).toHaveLength(0)
    })
  })
})

describe('GS-08 — ambiguous stays ambiguous', () => {
  it('refuses to force a resolution where causality is not observable', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shown(ctx)
      await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'dismissed' })

      const proposal = await resolveOutcome(ctx, opportunity.id)
      expect(proposal.state).toBe('ambiguous')
      expect(proposal.written).toBeNull()
      expect(proposal.needsReview).toBe(true)

      await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'ambiguous',
        note: 'the proposal changed, but not necessarily because of this',
      })
      const history = (await interventionHistory(ctx, opportunity.id))!
      expect(history.outcome?.state).toBe('ambiguous')
      expect(history.outcome?.resolvedAt).toBeNull()
    })
  })
})

describe('asking AVA what happened', () => {
  it('reports the record without claiming one thing caused another', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shown(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'valuable',
      })
      await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'reviewed' })
      await resolveOutcome(ctx, opportunity.id)

      const answer = await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'Which opportunities did I mark valuable?',
      })
      expect(answer.packet.query.kind).toBe('intervention')
      expect(answer.executionMode).toBe('local_only')
      expect(answer.answer).toContain('you marked this valuable')

      const happened = await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'What happened after this opportunity?',
      })
      expect(happened.answer).toContain('you said correct')
      expect(happened.answer).toContain('outcome resolved')
      expect(happened.uncertainties.join(' ')).toContain('does not claim')
    })
  })

  it('distinguishes "no outcome recorded" from "unresolved"', async () => {
    await withTestContext(async (ctx) => {
      const { seed } = await shown(ctx)
      const answer = await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'Which opportunities remain unresolved?',
      })
      expect(answer.answer).toContain('no outcome recorded — not the same as unresolved')
    })
  })

  it('says plainly when nothing was marked valuable', async () => {
    await withTestContext(async (ctx) => {
      const { seed } = await shown(ctx)
      const answer = await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'Which suggestions did I mark valuable?',
      })
      expect(answer.answer).toBe('You have not marked anything valuable yet.')
    })
  })
})
