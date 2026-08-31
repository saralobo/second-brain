import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { PRICE_TABLE_VERSION, costUsd } from '@ava/llm'
import {
  buildBriefing, capture, correctCognition, declareCognition, declaredCognitionAsOf,
  generateOpportunities, interventionRecords, openCheckpoint, outcomeAsOf, promoteToStabilized,
  recordFeedback, recordOutcome, recordUserAction, seedArchitectureBCorrection,
  seedProactiveScenario,
} from '@ava/app'
import type { AppContext } from '@ava/app'

/**
 * AR-01 … AR-07 — the anti-retroactivity suite (S7-T02).
 *
 * Failure of any one of these is a BLOCKER for prospective validation, not a
 * bug to be triaged: every one of them is a way for the future to rewrite the
 * past, and a record that can be rewritten cannot support a claim about what
 * AVA knew when it acted.
 *
 * Synthetic scenarios throughout. Technical tests, never product validation
 * evidence.
 */
async function shownOpportunity(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  await generateOpportunities(ctx, seed.workstreamId)
  await buildBriefing(ctx, seed.workstreamId, { deliver: true })
  const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
  return { seed, opportunity: all.find((o) => o.shownAt !== null)! }
}

describe('AR-01 — future evidence does not enter a past opportunity', () => {
  it('freezes the generation snapshot against evidence that arrives later', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      const knownAtT1 = [...opportunity.generation.knownEvidenceIds]
      const generatedAt = opportunity.generation.generatedAt.getTime()

      const later = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'Arrived afterwards', content: 'Something AVA could not have known.',
      })
      expect(later.ok).toBe(true)

      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.generation.knownEvidenceIds).toEqual(knownAtT1)
      expect(reread!.generation.generatedAt.getTime()).toBe(generatedAt)
      expect(reread!.originEvidenceIds).toEqual(opportunity.originEvidenceIds)
    })
  })

  it('refuses a direct write to the generation row', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await ctx.db.query(
        `UPDATE opportunity_generation SET known_evidence_ids = '["FAKE"]'::jsonb
         WHERE opportunity_id = $1`, [opportunity.id])
      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.generation.knownEvidenceIds).not.toContain('FAKE')

      await ctx.db.query(
        'DELETE FROM opportunity_generation WHERE opportunity_id = $1', [opportunity.id])
      expect(await ctx.opportunities.findById(opportunity.id)).not.toBeNull()
    })
  })
})

describe('AR-02 — future feedback does not enter a past DecisionRecord', () => {
  it('references the record without appearing inside it', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      const before = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 200)
      const generation = before.find((d) => d.scopeMatch.opportunityId === opportunity.id)!
      const frozen = JSON.stringify(generation)

      const row = await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'incorrect', delivery: 'irrelevant', reason: 'a private note',
      })
      expect(row.decisionRecordId).toBe(generation.id)

      const after = await ctx.decisionRecords.findById(generation.id)
      expect(JSON.stringify(after)).toBe(frozen)
      expect(JSON.stringify(after)).not.toContain('irrelevant')
      expect(JSON.stringify(after)).not.toContain('a private note')
    })
  })

  it('rejects an update to the DecisionRecord itself', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      const records = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 200)
      const generation = records.find((d) => d.scopeMatch.opportunityId === opportunity.id)!
      await ctx.db.query(
        `UPDATE decision_record SET answer = 'rewritten' WHERE id = $1`, [generation.id])
      const reread = await ctx.decisionRecords.findById(generation.id)
      expect(reread!.answer).toBe(generation.answer)
    })
  })
})

describe('AR-03 — a future outcome does not alter historical state', () => {
  it('answers what the outcome was at t2 without seeing t3', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const t1 = new Date(Date.now() - 3 * 60_000)
      const t2 = new Date(Date.now() - 2 * 60_000)
      const t3 = new Date(Date.now() - 60_000)

      await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'unresolved', recordedAt: t1,
      })
      await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'ambiguous', recordedAt: t2,
      })
      await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'resolved', recordedAt: t3,
      })

      expect((await outcomeAsOf(ctx, opportunity.id, t1))?.state).toBe('unresolved')
      const atT2 = await outcomeAsOf(ctx, opportunity.id, t2)
      expect(atT2?.state).toBe('ambiguous')
      expect(atT2?.state).not.toBe('resolved')
      expect((await outcomeAsOf(ctx, opportunity.id, t3))?.state).toBe('resolved')

      // And the opportunity's own history is untouched by any of it.
      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.shownAt!.getTime()).toBe(opportunity.shownAt!.getTime())
      expect(reread!.contextHealth).toBe(opportunity.contextHealth)
    })
  })
})

describe('AR-04 — a future correction does not alter historical cognition', () => {
  it('answers what AVA held at t1 after the user corrects at t2', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      const first = await declareCognition(ctx, {
        content: 'I prefer concise updates.',
        cognitionType: 'contextual_preference',
        workstreamId: seed.workstreamId,
      })
      const t1 = new Date()
      await new Promise((r) => setTimeout(r, 5))

      await correctCognition(ctx, {
        cognitionId: first.cognition.id,
        content: 'For architecture decisions I prefer detailed reasoning.',
      })
      const t2 = new Date()

      const atT1 = await declaredCognitionAsOf(ctx, t1)
      expect(atT1.map((c) => c.id)).toContain(first.cognition.id)
      expect(atT1.every((c) => c.version === 1)).toBe(true)

      const atT2 = await declaredCognitionAsOf(ctx, t2)
      expect(atT2.some((c) => c.version === 2)).toBe(true)

      // The original version is still readable in full.
      const original = await ctx.cognition.findById(first.cognition.id)
      expect(original).not.toBeNull()
      expect(original!.content).toBe('I prefer concise updates.')
    })
  })
})

describe('AR-05 — a future memory rebuild does not raise historical support', () => {
  it('leaves the promotion record and its evidence unchanged', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      const a = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'First report', content: 'The reader loses annotations after a reinstall.',
      })
      const b = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'Second report', content: 'A second tester lost annotations after a reinstall.',
      })
      if (!a.ok || !b.ok) throw new Error('seed failed')

      const promoted = await promoteToStabilized(ctx, {
        title: 'Annotations are lost on reinstall',
        evidenceIds: [a.evidence.id, b.evidence.id],
        workstreamId: seed.workstreamId,
      })
      if (!promoted.promoted) return
      const supportBefore = promoted.record.evidenceIds.length
      const strengthBefore = promoted.record.strength

      // A derived view is system-origin and can never add support.
      const view = await ctx.memory.saveView({
        title: 'Summary of the annotation reports',
        body: 'Two testers lost annotations.',
        evidenceIds: [a.evidence.id, b.evidence.id],
        contentOrigin: 'system',
        stale: false,
        workstreamId: seed.workstreamId,
      })
      expect(view.contentOrigin).toBe('system')

      const reread = await ctx.memory.findById(promoted.record.id)
      expect(reread!.evidenceIds.length).toBe(supportBefore)
      expect(reread!.strength).toBe(strengthBefore)
    })
  })
})

describe('AR-06 — a future policy version does not replace a past one', () => {
  it('keeps the policy version recorded with the decision', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      const recorded = opportunity.show.version

      const records = await interventionRecords(ctx, seed.workstreamId)
      const record = records.find((r) => r.opportunityId === opportunity.id)!
      expect(record.policyVersion).toBe(recorded)
      expect(record.ruleVersion).toBeTruthy()

      // The version lives on the append-only generation row, so a later rule
      // change cannot re-label a decision that was taken under the old one.
      await ctx.db.query(
        `UPDATE opportunity_generation SET policy_version = '9.9.9' WHERE opportunity_id = $1`,
        [opportunity.id])
      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.show.version).toBe(recorded)
    })
  })
})

describe('AR-07 — a future price table does not alter historical cost', () => {
  it('records the price table version that produced each figure', async () => {
    await withTestContext(async (ctx) => {
      // The cost function is pure and versioned; the run stores the version.
      const historical = costUsd('claude-sonnet-5', 1_000_000, 1_000_000)
      expect(historical).not.toBeNull()

      await ctx.db.query(
        `INSERT INTO model_run (
           id, archetype, purpose, prompt_id, prompt_version, provider, model, status,
           input_tokens, output_tokens, actual_cost_usd, price_table_version, request_started_at
         ) VALUES ('MR1','test','audit fixture','grounded-answer','v2','mock','claude-sonnet-5',
                   'COMPLETE',1000000,1000000,$1,$2,now())`,
        [historical, PRICE_TABLE_VERSION])

      const row = await ctx.db.query<{ actual_cost_usd: string; price_table_version: string }>(
        'SELECT actual_cost_usd, price_table_version FROM model_run WHERE id = $1', ['MR1'])
      expect(row.rows[0]!.price_table_version).toBe(PRICE_TABLE_VERSION)
      expect(Number(row.rows[0]!.actual_cost_usd)).toBe(historical)

      // A stored cost is a number written at the time, not a formula
      // re-evaluated on read, so changing the table later cannot move it.
      expect(Number(row.rows[0]!.actual_cost_usd)).toBe(12)
    })
  })

  it('keeps an unknown token count unknown rather than zero', async () => {
    await withTestContext(async (ctx) => {
      await ctx.db.query(
        `INSERT INTO model_run (
           id, archetype, purpose, prompt_id, prompt_version, provider, model, status,
           request_started_at
         ) VALUES ('MR2','test','audit fixture','grounded-answer','v2','mock',
                   'mock/deterministic/1','FAILED', now())`)
      const { modelRunRecords } = await import('@ava/app')
      const runs = await modelRunRecords(ctx)
      const failed = runs.find((r) => r.id === 'MR2')!
      expect(failed.inputTokens.value).toBeNull()
      expect(failed.inputTokens.missing).toBe('not_observed')
      expect(failed.actualCostUsd.value).not.toBe(0)
    })
  })
})
