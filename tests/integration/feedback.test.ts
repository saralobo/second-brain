import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  buildBriefing, correctFeedback, generateOpportunities, interventionHistory,
  interventionMetrics, openCheckpoint, prepareForOpportunity, recordFeedback, recordOutcome,
  recordUserAction, resolveOutcome, seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'
import type { AppContext } from '@ava/app'

/**
 * Opportunity → Show → Feedback → Action → Outcome, against the database.
 *
 * Synthetic scenario throughout. A technical test that the loop closes and
 * stays honest — never evidence that the product thesis holds.
 */
async function shownOpportunity(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  await generateOpportunities(ctx, seed.workstreamId)
  await buildBriefing(ctx, seed.workstreamId, { deliver: true })
  const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
  const opportunity = all.find((o) => o.shownAt !== null)
  if (!opportunity) throw new Error('nothing was shown')
  return { seed, opportunity }
}

describe('feedback is target-linked and never rewrites the past', () => {
  it('links to the opportunity and references the DecisionRecord', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const row = await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'valuable',
      })
      expect(row.opportunityId).toBe(opportunity.id)
      expect(row.decisionRecordId).not.toBeNull()

      const dr = await ctx.decisionRecords.findById(row.decisionRecordId!)
      expect(dr?.kind).toBe('opportunity_generation')
      // Referenced, not edited: the record still says exactly what it said.
      expect(dr?.scopeMatch.opportunityId).toBe(opportunity.id)
      expect(JSON.stringify(dr)).not.toContain('valuable')
    })
  })

  it('refuses feedback with no target', async () => {
    await withTestContext(async (ctx) => {
      await expect(recordFeedback(ctx, {
        targetType: 'opportunity', targetId: 'nope', epistemic: 'correct',
      })).rejects.toThrow(/no such opportunity/)
    })
  })

  it('refuses a row that says nothing on any dimension', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await expect(recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
      })).rejects.toThrow(/at least one dimension/)
    })
  })

  it('cannot be deleted', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const row = await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'valuable',
      })
      await ctx.db.query('DELETE FROM feedback WHERE id = $1', [row.id])
      expect(await ctx.feedback.findById(row.id)).not.toBeNull()
    })
  })

  it('keeps the earlier judgement when the user changes their mind', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const first = await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'already_known',
      })
      const second = await correctFeedback(ctx, first.id, { delivery: 'valuable' })

      const history = await interventionHistory(ctx, opportunity.id)
      expect(history?.feedback.delivery).toBe('valuable')
      // The correctness verdict from the first row survives the correction.
      expect(history?.feedback.epistemic).toBe('correct')
      expect(history?.feedback.history.map((f) => f.id)).toContain(first.id)
      expect(second.correctsFeedbackId).toBe(first.id)

      await expect(correctFeedback(ctx, first.id, { delivery: 'irrelevant' }))
        .rejects.toThrow(/already corrected/)
    })
  })
})

describe('artifact feedback is a third axis', () => {
  it('records used_after_edit alongside correct and valuable', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const prep = await prepareForOpportunity(ctx, opportunity.id)
      if (!prep.prepared) return

      await recordFeedback(ctx, {
        targetType: 'prepared_artifact', targetId: prep.artifact.id,
        epistemic: 'correct', delivery: 'valuable', artifact: 'used_after_edit',
      })

      const history = await interventionHistory(ctx, opportunity.id)
      expect(history?.feedback.epistemic).toBe('correct')
      expect(history?.feedback.delivery).toBe('valuable')
      expect(history?.feedback.artifact).toBe('used_after_edit')
    })
  })

  /**
   * Using something is not the same as it being true. A used checklist is
   * evidence that it was used, and nothing more — the self-poisoning
   * protection has to survive the feedback loop.
   */
  it('does not turn a used artifact into evidence for the opportunity', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const prep = await prepareForOpportunity(ctx, opportunity.id)
      if (!prep.prepared) return
      await recordFeedback(ctx, {
        targetType: 'prepared_artifact', targetId: prep.artifact.id, artifact: 'used_as_is',
      })

      const after = await ctx.opportunities.findById(opportunity.id)
      expect(after?.originEvidenceIds).toEqual(opportunity.originEvidenceIds)
      expect(after?.strength).toBe(opportunity.strength)
      const rows = await ctx.db.query<{ content_origin: string }>(
        'SELECT content_origin FROM prepared_artifact WHERE id = $1', [prep.artifact.id])
      expect(rows.rows[0]?.content_origin).toBe('system')
    })
  })
})

describe('actions and outcomes', () => {
  it('records an action and lets it settle the outcome', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const before = await resolveOutcome(ctx, opportunity.id)
      expect(before.state).toBe('unresolved')
      expect(before.written).toBeNull()
      expect(before.needsReview).toBe(true)

      await recordUserAction(ctx, {
        opportunityId: opportunity.id, kind: 'reviewed',
        description: 'Reviewed the proposal and updated it.',
      })
      const after = await resolveOutcome(ctx, opportunity.id)
      expect(after.state).toBe('resolved')
      expect(after.written?.resolvedBy).toBe('deterministic_event')
    })
  })

  it('never writes an outcome from silence', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const result = await resolveOutcome(ctx, opportunity.id)
      expect(result.written).toBeNull()
      const history = await ctx.outcomes.historyFor(opportunity.id)
      expect(history).toHaveLength(0)
    })
  })

  it('keeps unresolved at t1 readable after resolving at t2', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const t1 = await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'unresolved', note: 'nothing has happened yet',
      })
      await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'resolved', note: 'reviewed and updated',
      })

      const history = await ctx.outcomes.historyFor(opportunity.id)
      expect(history).toHaveLength(2)
      expect(history[0]?.state).toBe('unresolved')
      const reread = history.find((o) => o.id === t1.id)
      expect(reread?.supersededByOutcomeId).not.toBeNull()
      // And the outcome as it stood at t1 is still recoverable.
      const current = await interventionHistory(ctx, opportunity.id)
      expect(current?.outcome?.state).toBe('resolved')
      expect(current?.outcomeHistory[0]?.state).toBe('unresolved')
    })
  })

  it('gives resolved a time and the other three states none', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const ambiguous = await recordOutcome(ctx, {
        opportunityId: opportunity.id, state: 'ambiguous', note: 'cannot tell what caused what',
      })
      expect(ambiguous.resolvedAt).toBeNull()
      await expect(ctx.db.query(
        `UPDATE outcome SET resolved_at = now() WHERE id = $1`, [ambiguous.id],
      )).rejects.toThrow()
    })
  })

  it('records unknown as unknown rather than inferring an action', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'unknown' })
      const result = await resolveOutcome(ctx, opportunity.id)
      expect(result.state).toBe('unresolved')
      expect(result.written).toBeNull()
    })
  })
})

/**
 * The boundary this slice exists to hold. Feedback is data; it is not policy,
 * and it is not something the user declared about themselves.
 */
describe('feedback changes nothing about how AVA decides', () => {
  it('leaves the policies, the vector and the gates untouched', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const before = JSON.stringify({
        show: opportunity.show, prepare: opportunity.prepare,
        investigate: opportunity.investigate, vector: opportunity.valueVector,
        gates: opportunity.gates,
      })

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'incorrect', delivery: 'irrelevant',
      })
      await recordOutcome(ctx, { opportunityId: opportunity.id, state: 'ambiguous' })

      const after = await ctx.opportunities.findById(opportunity.id)
      expect(JSON.stringify({
        show: after!.show, prepare: after!.prepare, investigate: after!.investigate,
        vector: after!.valueVector, gates: after!.gates,
      })).toBe(before)
      expect(after!.show.version).toBe(opportunity.show.version)
    })
  })

  it('creates no Declared Cognition and promotes no hypothesis', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      const declarationsBefore = await ctx.cognition.listAll()
      const hypothesesBefore = await ctx.hypotheses.list(seed.workstreamId)

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'irrelevant',
        reason: 'I never care about this sort of thing',
      })

      // Even a note that reads like a preference stays feedback. Turning it
      // into a declaration would put words in the user's mouth.
      expect(await ctx.cognition.listAll()).toHaveLength(declarationsBefore.length)
      expect(await ctx.hypotheses.list(seed.workstreamId)).toHaveLength(hypothesesBefore.length)
    })
  })

  it('does not reorder or hide anything in the next briefing', async () => {
    await withTestContext(async (ctx) => {
      const { seed } = await shownOpportunity(ctx)
      const first = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      const order = first.blocks.flatMap((b) => b.items.map((i) => i.id))

      for (const block of first.blocks) {
        for (const item of block.items) {
          if (item.opportunityId === null) continue
          await recordFeedback(ctx, {
            targetType: 'opportunity', targetId: item.opportunityId, delivery: 'irrelevant',
          })
        }
      }

      const second = await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      expect(second.blocks.flatMap((b) => b.items.map((i) => i.id))).toEqual(order)
    })
  })
})

describe('anti-retroactivity survives the loop', () => {
  it('leaves the t1 generation snapshot untouched by t3 feedback and t4 outcome', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      const snapshot = JSON.stringify(opportunity.generation)
      const health = opportunity.contextHealth

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, epistemic: 'incorrect',
      })
      await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'dismissed' })
      await recordOutcome(ctx, { opportunityId: opportunity.id, state: 'ambiguous' })

      const after = await ctx.opportunities.findById(opportunity.id)
      expect(JSON.stringify(after!.generation)).toBe(snapshot)
      // Context Health at generation is a record of what AVA could see then.
      expect(after!.contextHealth).toBe(health)
    })
  })

  it('does not undo the fact that the opportunity was shown', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'irrelevant',
      })
      const after = await ctx.opportunities.findById(opportunity.id)
      expect(after!.shownAt).not.toBeNull()
      expect(after!.shownAt!.getTime()).toBe(opportunity.shownAt!.getTime())
    })
  })
})

describe('the timeline', () => {
  it('fills what happened and leaves user_seen_at null', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'valuable',
      })
      await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'reviewed' })
      await resolveOutcome(ctx, opportunity.id)

      const t = (await interventionHistory(ctx, opportunity.id))!.timeline
      expect(t.evidenceArrivedAt).not.toBeNull()
      expect(t.changeDetectableAt).not.toBeNull()
      expect(t.opportunityGeneratedAt).not.toBeNull()
      expect(t.opportunityShownAt).not.toBeNull()
      expect(t.feedbackAt).not.toBeNull()
      expect(t.userActionAt).not.toBeNull()
      expect(t.outcomeAt).not.toBeNull()
      expect(t.userSeenAt).toBeNull()
    })
  })

  it('still refuses to emit user_seen', async () => {
    await withTestContext(async (ctx) => {
      const { opportunity } = await shownOpportunity(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'valuable',
      })
      const counts = await ctx.telemetry.countByType()
      expect(counts.feedback_delivery_recorded).toBeGreaterThan(0)
      expect(counts.user_seen).toBeUndefined()
      await expect(ctx.telemetry.record({
        eventType: 'user_seen', occurredAt: new Date(),
        subjectType: 'opportunity', subjectId: opportunity.id,
      })).rejects.toThrow(/later slice/)
    })
  })
})

describe('the metrics read model', () => {
  it('counts what was observed, and says it is not a result', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await shownOpportunity(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'correct', delivery: 'already_known',
      })
      await recordOutcome(ctx, { opportunityId: opportunity.id, state: 'unresolved' })

      const report = await interventionMetrics(ctx, seed.workstreamId)
      expect(report.counts.shown).toBeGreaterThan(0)
      expect(report.counts.epistemic.correct).toBe(1)
      expect(report.counts.delivery.already_known).toBe(1)
      expect(report.counts.outcome.unresolved).toBe(1)
      // Everything else shown but unanswered is counted as not provided.
      expect(report.counts.delivery.not_provided).toBe(report.counts.shown - 1)
      expect(report.observations.caveat).toMatch(/not a measure of accuracy/)
    })
  })
})
