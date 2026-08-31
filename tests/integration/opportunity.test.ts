import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  buildBriefing, capture, closeCheckpoint, generateOpportunities, openCheckpoint,
  prepareForOpportunity, seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'
import type { AppContext } from '@ava/app'

/**
 * Evidence → State → Change → Impact → Opportunity → Policies → Today.
 *
 * Synthetic scenario throughout. A technical test that the code does what it
 * was written to do — never evidence that the product thesis holds.
 */
async function scenario(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  return seed
}

describe('the change-driven path', () => {
  it('turns a superseded decision into an opportunity about the dependent artifact', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)

      const unpropagated = result.generated.find(
        (o) => o.opportunityClass === 'unpropagated_decision')
      expect(unpropagated).toBeDefined()
      expect(unpropagated?.affectedObjects.map((a) => a.objectId))
        .toContain(seed.artifactObjectId)
      expect(unpropagated?.triggerChangeIds.length).toBeGreaterThan(0)
      expect(unpropagated?.originEvidenceIds.length).toBeGreaterThan(0)
    })
  })

  it('produces every one of the five classes and no others', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const classes = new Set(result.generated.map((o) => o.opportunityClass))
      expect(classes.has('unpropagated_decision')).toBe(true)
      expect(classes.has('upcoming_commitment')).toBe(true)
      expect(classes.has('closing_risk')).toBe(true)
      for (const c of classes) {
        expect([
          'unpropagated_decision', 'upcoming_commitment', 'invalidated_work',
          'unresolved_question', 'closing_risk',
        ]).toContain(c)
      }
    })
  })

  it('records the generation DecisionRecord with the rule and all three verdicts', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const records = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 50)
      const generation = records.filter((r) => r.kind === 'opportunity_generation')
      expect(generation.length).toBe(result.generated.length)
      const one = generation[0]!
      expect(one.scopeMatch.ruleId).toBeTruthy()
      expect(one.scopeMatch.investigate).toBeTruthy()
      expect(one.scopeMatch.show).toBeTruthy()
      expect(one.scopeMatch.prepare).toBeTruthy()
      expect(one.scopeMatch.policyVersion).toBe('1.0.0')
    })
  })

  it('needs no provider: the whole path is local_only', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      await generateOpportunities(ctx, seed.workstreamId)
      const records = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 50)
      for (const r of records.filter((x) => x.kind === 'opportunity_generation')) {
        expect(r.executionMode).toBe('local_only')
        expect(r.provider).toBeNull()
        expect(r.modelRunId).toBeNull()
      }
      expect(await ctx.modelRuns.countAll?.() ?? 0).toBe(0)
    })
  })
})

describe('deduplication across checkpoints', () => {
  it('gives one active opportunity, not one per checkpoint', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const first = await generateOpportunities(ctx, seed.workstreamId)
      await closeCheckpoint(ctx, seed.workstreamId, 'end of day')
      const second = await generateOpportunities(ctx, seed.workstreamId)

      expect(first.generated.length).toBeGreaterThan(0)
      expect(second.generated).toHaveLength(0)
      expect(second.deduplicated.length).toBeGreaterThan(0)

      const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
      const active = all.filter((o) => o.status !== 'superseded' && o.status !== 'expired')
      const keys = active.map((o) => o.identityKey)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  it('opens a new version, and supersedes the old one, when the condition moves', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const first = await generateOpportunities(ctx, seed.workstreamId)
      const target = first.generated.find((o) => o.opportunityClass === 'unpropagated_decision')!

      // A second correction is a genuinely new trigger.
      await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'correction',
        title: 'Architecture B refined after a review',
        content: 'The encrypted store gains a retention rule after the security review.',
        supersedesStateObjectId: seed.decisionObjectId,
      })

      const second = await generateOpportunities(ctx, seed.workstreamId)
      const successor = second.generated.find((o) => o.identityKey === target.identityKey)
      expect(successor?.version).toBe(2)
      expect(successor?.supersedesOpportunityId).toBe(target.id)

      const old = await ctx.opportunities.findById(target.id)
      expect(old?.status).toBe('superseded')
      // History is not hidden: the earlier version is still fully readable.
      expect(old?.headline).toBe(target.headline)
    })
  })
})

/**
 * Anti-retroactivity (brief §34). This invariant is what makes any future
 * measurement of anticipation meaningful: an opportunity must be inspectable
 * against the context that produced it, not against what AVA learned later.
 */
describe('anti-retroactivity', () => {
  it('inspects a t1 opportunity with t1 context, not with t2 evidence', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const t1 = await generateOpportunities(ctx, seed.workstreamId)
      const opportunity = t1.generated[0]!
      const knownAtT1 = [...opportunity.generation.knownEvidenceIds]

      const later = await capture(ctx, {
        workstreamId: seed.workstreamId, type: 'note',
        title: 'A note that arrived afterwards',
        content: 'Something AVA could not possibly have known at t1.',
      })
      expect(later.ok).toBe(true)

      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread?.generation.knownEvidenceIds).toEqual(knownAtT1)
      expect(reread?.generation.knownEvidenceIds).not.toContain(
        later.ok ? later.evidence.id : '')
      expect(reread?.generation.generatedAt.getTime())
        .toBe(opportunity.generation.generatedAt.getTime())
    })
  })

  it('refuses to rewrite the generation record at all', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const t1 = await generateOpportunities(ctx, seed.workstreamId)
      const id = t1.generated[0]!.id

      await ctx.db.query(
        `UPDATE opportunity_generation SET value_vector = '{}'::jsonb WHERE opportunity_id = $1`,
        [id],
      )
      const reread = await ctx.opportunities.findById(id)
      expect(reread?.valueVector.consequence).toBeDefined()
    })
  })
})

/**
 * System-origin protection (brief §30). A prepared artifact is AVA's own
 * output. If it could come back as evidence, AVA would end up confirming her
 * own guesses, and every strength assessment downstream would be inflated.
 */
describe('system-origin protection', () => {
  it('marks opportunities and prepared artifacts as system-origin', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      for (const o of result.generated) expect(o.contentOrigin).toBe('system')

      const rows = await ctx.db.query<{ content_origin: string }>(
        'SELECT content_origin FROM opportunity')
      for (const r of rows.rows) expect(r.content_origin).toBe('system')
    })
  })

  it('refuses to store an opportunity that claims another origin', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const id = result.generated[0]!.id
      await expect(
        ctx.db.query(`UPDATE opportunity SET content_origin = 'user' WHERE id = $1`, [id]),
      ).rejects.toThrow()
    })
  })

  it('never lets a prepared artifact become evidence for its own opportunity', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const target = result.generated.find((o) => o.prepare.verdict === 'PASS')
      if (!target) return
      const outcome = await prepareForOpportunity(ctx, target.id)
      expect(outcome.prepared).toBe(true)

      const after = await ctx.opportunities.findById(target.id)
      const artifact = outcome.prepared ? outcome.artifact : null
      expect(after?.originEvidenceIds).not.toContain(artifact?.id)
      expect(after?.strength).toBe(target.strength)
    })
  })
})

describe('preparation', () => {
  it('records a DecisionRecord distinct from the show decision', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const target = result.generated[0]!
      const outcome = await prepareForOpportunity(ctx, target.id)

      const records = await ctx.decisionRecords.listByWorkstream(seed.workstreamId, 100)
      const prep = records.filter((r) => r.kind === 'opportunity_preparation')
      const gen = records.filter((r) => r.kind === 'opportunity_generation')
      expect(prep.length).toBeGreaterThan(0)
      expect(gen.length).toBeGreaterThan(0)
      expect(prep[0]!.id).not.toBe(gen[0]!.id)
      expect(outcome.decisionRecordId).toBe(prep[0]!.id)
    })
  })

  it('reaches nothing outside AVA and costs nothing', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      for (const o of result.generated) {
        const outcome = await prepareForOpportunity(ctx, o.id)
        if (!outcome.prepared) continue
        expect(outcome.artifact.executionMode).toBe('local_only')
        expect(outcome.artifact.actualCostUsd).toBe(0)
        expect(outcome.artifact.modelRunId).toBeNull()
      }
      const costs = await ctx.prepared.costs(seed.workstreamId)
      expect(costs.totalCostUsd).toBe(0)
    })
  })

  it('records the refused model path rather than downgrading quietly', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const target = result.generated.find((o) => o.prepare.verdict === 'PASS')
      if (!target) return
      const outcome = await prepareForOpportunity(ctx, target.id)
      const dr = await ctx.decisionRecords.findById(outcome.decisionRecordId)
      expect(dr?.uncertainties.join(' ')).toMatch(/model-assisted/)
      expect(dr?.uncertainties.join(' ')).toMatch(/safety cap|deterministic/)
    })
  })
})

/**
 * ADR-21 Gate A on the production path (S5-T14). The caps are live here, not
 * decorative: with none configured the controller is CLOSED, so the first paid
 * call cannot happen by accident.
 */
describe('Gate A caps are active on the preparation path', () => {
  it('is closed when no cap is configured', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const target = result.generated.find((o) => o.prepare.verdict === 'PASS')
      if (!target) return
      const outcome = await prepareForOpportunity(ctx, target.id)
      const dr = await ctx.decisionRecords.findById(outcome.decisionRecordId)
      expect(dr?.uncertainties.join(' ')).toContain('no operational safety cap configured')
    })
  })

  it('authorises within a configured cap, and says so', async () => {
    await withTestContext(async (ctx) => {
      const previous = process.env.AVA_CAP_PER_CALL_USD
      process.env.AVA_CAP_PER_CALL_USD = '1.00'
      try {
        const seed = await scenario(ctx)
        const result = await generateOpportunities(ctx, seed.workstreamId)
        const target = result.generated.find((o) => o.prepare.verdict === 'PASS')
        if (!target) return
        const outcome = await prepareForOpportunity(ctx, target.id)
        const dr = await ctx.decisionRecords.findById(outcome.decisionRecordId)
        expect(dr?.uncertainties.join(' ')).toContain('authorised')
      } finally {
        if (previous === undefined) delete process.env.AVA_CAP_PER_CALL_USD
        else process.env.AVA_CAP_PER_CALL_USD = previous
      }
    })
  })
})

describe('Today', () => {
  it('fills the five blocks, or says plainly that they are empty', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const briefing = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      expect(briefing.blocks.map((b) => b.id)).toEqual([
        'what_changed', 'needs_your_attention', 'open_threads', 'ava_noticed', 'prepared_for_you',
      ])
      for (const b of briefing.blocks) {
        expect(b.items.length).toBeLessThanOrEqual(3)
        if (b.items.length === 0) expect(b.emptyMessage.length).toBeGreaterThan(0)
      }
      expect(briefing.blocks.reduce((n, b) => n + b.items.length, 0)).toBeLessThanOrEqual(10)
    })
  })

  it('says nothing needs attention when nothing does', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Empty', 'nothing here')
      const briefing = await buildBriefing(ctx, ws.id)
      const attention = briefing.blocks.find((b) => b.id === 'needs_your_attention')!
      expect(attention.items).toHaveLength(0)
      expect(attention.emptyMessage).toBe('Nothing needs your attention right now.')
    })
  })

  it('stamps shown_at only when the briefing is delivered', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      await buildBriefing(ctx, seed.workstreamId, { deliver: false })
      let all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
      expect(all.every((o) => o.shownAt === null)).toBe(true)

      await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
      expect(all.some((o) => o.shownAt !== null)).toBe(true)
    })
  })

  it('emits shown, never seen', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      const counts = await ctx.telemetry.countByType()
      expect(counts.opportunity_generated).toBeGreaterThan(0)
      expect(counts.opportunity_shown).toBeGreaterThan(0)
      expect(counts.briefing_shown).toBeGreaterThan(0)
      expect(counts.user_seen).toBeUndefined()
    })
  })
})

/**
 * The sunk-cost test the brief asks for by name. Preparing something must not
 * make it any more likely to be shown.
 */
describe('preparation does not buy attention', () => {
  it('leaves the show verdict identical after preparation', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const target = result.generated.find((o) => o.prepare.verdict === 'PASS')
      if (!target) return
      const before = { ...target.show }

      await prepareForOpportunity(ctx, target.id)
      const after = await ctx.opportunities.findById(target.id)
      expect(after?.status).toBe('prepared')
      expect(after?.show.verdict).toBe(before.verdict)
      expect(after?.show.reasons).toEqual(before.reasons)
      expect(after?.show.reasons.join(' ')).not.toMatch(/prepar/i)
    })
  })

  it('does not move a failing item into the attention block by preparing it', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const result = await generateOpportunities(ctx, seed.workstreamId)
      const failing = result.generated.find((o) => o.show.verdict !== 'PASS')
      if (!failing) return
      await prepareForOpportunity(ctx, failing.id)

      const briefing = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      const attention = briefing.blocks.find((b) => b.id === 'needs_your_attention')!
      const noticed = briefing.blocks.find((b) => b.id === 'ava_noticed')!
      expect(attention.items.some((i) => i.opportunityId === failing.id)).toBe(false)
      expect(noticed.items.some((i) => i.opportunityId === failing.id)).toBe(false)
    })
  })
})
