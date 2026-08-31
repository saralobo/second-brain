import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  VALIDATION_SCHEMA_VERSION, buildBriefing, buildValidationExport, capture, contextHealthRecords,
  executionModes, generateOpportunities, interventionRecords, openCheckpoint,
  prepareForOpportunity, recordFeedback, recordUserAction, resolveOutcome,
  seedArchitectureBCorrection, seedProactiveScenario, toJsonl, unraisedChanges,
} from '@ava/app'
import type { AppContext } from '@ava/app'

/**
 * Milestone 6 — Prospective Evidence Trail (S7-T01, S7-T03, S7-T04).
 *
 * The question is not whether AVA is good. It is whether, once AVA is used for
 * real, the record will support finding out.
 *
 * Synthetic scenarios. Technical tests, never product validation evidence.
 */
async function fullLoop(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  await generateOpportunities(ctx, seed.workstreamId)
  await buildBriefing(ctx, seed.workstreamId, { deliver: true })
  const all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
  const opportunity = all.find((o) => o.shownAt !== null)!
  await recordFeedback(ctx, {
    targetType: 'opportunity', targetId: opportunity.id,
    epistemic: 'correct', delivery: 'valuable',
  })
  await recordUserAction(ctx, { opportunityId: opportunity.id, kind: 'reviewed' })
  await resolveOutcome(ctx, opportunity.id)
  return { seed, opportunity }
}

describe('the timeline reconstructs from prospectively written records only', () => {
  it('produces every observable timestamp in order', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      const records = await interventionRecords(ctx, seed.workstreamId)
      const t = records.find((r) => r.opportunityId === opportunity.id)!.timeline

      for (const key of [
        'evidenceArrivedAt', 'changeDetectableAt', 'changeDetectedAt',
        'opportunityGeneratedAt', 'opportunityShownAt', 'feedbackAt',
        'userActionAt', 'outcomeAt',
      ] as const) {
        expect(t[key].value, `${key} missing`).not.toBeNull()
      }

      const ms = (v: string | null) => new Date(v!).getTime()
      expect(ms(t.evidenceArrivedAt.value)).toBeLessThanOrEqual(ms(t.changeDetectedAt.value))
      expect(ms(t.changeDetectableAt.value)).toBeLessThanOrEqual(ms(t.changeDetectedAt.value))
      expect(ms(t.changeDetectedAt.value)).toBeLessThanOrEqual(ms(t.opportunityGeneratedAt.value))
      expect(ms(t.opportunityGeneratedAt.value)).toBeLessThanOrEqual(ms(t.opportunityShownAt.value))
      expect(ms(t.opportunityShownAt.value)).toBeLessThanOrEqual(ms(t.feedbackAt.value))
    })
  })

  /**
   * F-15. Manual capture had no way to say when something actually happened,
   * so `change_detectable_at` was the moment of typing and detection latency
   * was identically zero — a measurement that looked perfect and meant
   * nothing.
   */
  it('measures a real detection latency when the user reports a past event', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Latency', 'synthetic')
      const yesterday = new Date(Date.now() - 86_400_000)
      const out = await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Decided yesterday', content: 'A decision taken yesterday, captured today.',
        observedAt: yesterday,
      })
      expect(out.ok).toBe(true)
      if (!out.ok) return
      expect(out.evidence.observedAt.getTime()).toBe(yesterday.getTime())

      const events = await ctx.db.query<{ event_type: string; occurred_at: string; time_basis: string }>(
        'SELECT event_type, occurred_at, time_basis FROM validation_event ORDER BY occurred_at')
      const detectable = events.rows.find((e) => e.event_type === 'change_detectable_at')!
      const detected = events.rows.find((e) => e.event_type === 'change_detection_triggered')!

      expect(new Date(detectable.occurred_at).getTime()).toBe(yesterday.getTime())
      const latencyMs = new Date(detected.occurred_at).getTime()
        - new Date(detectable.occurred_at).getTime()
      expect(latencyMs).toBeGreaterThan(60_000)

      // And the two kinds of clock are distinguishable.
      expect(detectable.time_basis).toBe('reported')
      expect(detected.time_basis).toBe('system_clock')
    })
  })

  it('still refuses to backdate an event AVA observed herself', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Clock', 'synthetic')
      await expect(ctx.telemetry.record({
        eventType: 'opportunity_generated',
        occurredAt: new Date(Date.now() - 86_400_000),
        subjectType: 'opportunity', subjectId: 'O1', workstreamId: ws.id,
      })).rejects.toThrow()
    })
  })

  it('refuses a future timestamp on either kind of clock', async () => {
    await withTestContext(async (ctx) => {
      await expect(ctx.telemetry.record({
        eventType: 'evidence_arrived',
        occurredAt: new Date(Date.now() + 86_400_000),
        subjectType: 'evidence', subjectId: 'E1',
      })).rejects.toThrow()
    })
  })
})

describe('opportunity_shown_at means delivered, and is written once', () => {
  it('does not stamp on a render that was not delivered', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
      await generateOpportunities(ctx, seed.workstreamId)

      await buildBriefing(ctx, seed.workstreamId, { deliver: false })
      let all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
      expect(all.every((o) => o.shownAt === null)).toBe(true)

      await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      all = await ctx.opportunities.listByWorkstream(seed.workstreamId)
      expect(all.some((o) => o.shownAt !== null)).toBe(true)
    })
  })

  it('keeps the first delivery time across re-renders', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      const first = opportunity.shownAt!.getTime()

      await buildBriefing(ctx, seed.workstreamId, { deliver: true })
      await buildBriefing(ctx, seed.workstreamId, { deliver: true })

      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.shownAt!.getTime()).toBe(first)

      // And exactly one shown event exists for it.
      const events = await ctx.db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM validation_event
         WHERE event_type = 'opportunity_shown' AND subject_id = $1`, [opportunity.id])
      expect(Number(events.rows[0]!.n)).toBe(1)
    })
  })
})

describe('missingness is never zero, epoch or now', () => {
  it('names why each absent timestamp is absent', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
      await generateOpportunities(ctx, seed.workstreamId)

      const records = await interventionRecords(ctx, seed.workstreamId)
      const record = records[0]!
      // Nothing was shown, nothing was answered, nothing happened.
      expect(record.timeline.opportunityShownAt.value).toBeNull()
      expect(record.timeline.opportunityShownAt.missing).toBe('not_observed')
      expect(record.timeline.feedbackAt.missing).toBe('not_provided')
      expect(record.timeline.outcomeAt.missing).toBe('not_observed')
      expect(record.timeline.userSeenAt.missing).toBe('unobservable')

      expect(record.epistemic.value).toBeNull()
      expect(record.epistemic.missing).toBe('not_provided')
      expect(record.outcomeState.missing).toBe('not_observed')

      // No absent value is ever rendered as a number or a date.
      for (const slot of Object.values(record.timeline)) {
        if (slot.value === null) expect(typeof slot.missing).toBe('string')
        else expect(Number.isNaN(Date.parse(slot.value))).toBe(false)
      }
    })
  })

  it('distinguishes not_applicable from not_provided for artifact feedback', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      let records = await interventionRecords(ctx, seed.workstreamId)
      expect(records.find((r) => r.opportunityId === opportunity.id)!.artifactVerdict.missing)
        .toBe('not_applicable')

      const prep = await prepareForOpportunity(ctx, opportunity.id)
      if (!prep.prepared) return
      records = await interventionRecords(ctx, seed.workstreamId)
      expect(records.find((r) => r.opportunityId === opportunity.id)!.artifactVerdict.missing)
        .toBe('not_provided')
    })
  })
})

/**
 * False positives are directly observable. False negatives are not, and the
 * honest position is that the V0 preserves the POPULATION a later
 * investigation would need — not that it detects misses.
 */
describe('false positive and false negative observability', () => {
  it('can identify shown items the user judged wrong or unwanted', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        epistemic: 'incorrect', delivery: 'irrelevant',
      })
      const records = await interventionRecords(ctx, seed.workstreamId)
      const shown = records.filter((r) => r.timeline.opportunityShownAt.value !== null)
      expect(shown.some((r) => r.epistemic.value === 'incorrect')).toBe(true)
      expect(shown.some((r) => r.delivery.value === 'irrelevant')).toBe(true)
    })
  })

  it('keeps a suppressed candidate reachable, with the gate that blocked it', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProactiveScenario(ctx)
      await openCheckpoint(ctx, seed.workstreamId)
      await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)

      // Reclassify everything as restricted: nothing may be surfaced
      // proactively, so every candidate is suppressed by the security gate.
      const evidence = await ctx.evidence.listByWorkstream(seed.workstreamId, 100)
      for (const e of evidence) {
        await ctx.evidence.annotate({
          evidenceId: e.id, sensitivity: 'restricted', reason: 'audit fixture',
        })
      }
      await generateOpportunities(ctx, seed.workstreamId)
      await buildBriefing(ctx, seed.workstreamId, { deliver: true })

      const records = await interventionRecords(ctx, seed.workstreamId)
      const suppressed = records.filter((r) => r.status === 'suppressed')
      expect(suppressed.length).toBeGreaterThan(0)

      for (const r of suppressed) {
        // The candidate survives, and WHY it was withheld is recorded — which
        // is the only material a later look at misses could work from.
        expect(r.timeline.opportunityShownAt.value).toBeNull()
        expect(r.showVerdict).toBeTruthy()
        expect(r.gatesBlockedBy.length).toBeGreaterThan(0)
        expect(r.originEvidenceIds.length).toBeGreaterThan(0)
        expect(r.triggerChangeIds).toBeDefined()
      }
    })
  })

  it('preserves changes that produced no opportunity at all', async () => {
    await withTestContext(async (ctx) => {
      const { seed } = await fullLoop(ctx)
      const unraised = await unraisedChanges(ctx, seed.workstreamId)
      expect(unraised.length).toBeGreaterThan(0)
      for (const c of unraised) {
        expect(c.changeType).toBeTruthy()
        expect(Number.isNaN(Date.parse(c.observedAt))).toBe(false)
        expect(c.raisedOpportunity).toBe(false)
      }
    })
  })
})

describe('novelty is separable into estimate and feedback', () => {
  it('keeps the generation-time estimate distinct from what the user said', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, delivery: 'already_known',
      })
      const record = (await interventionRecords(ctx, seed.workstreamId))
        .find((r) => r.opportunityId === opportunity.id)!

      // AVA estimated `new` at generation; the user later said she knew.
      expect(record.noveltyAtGeneration).toBe('new')
      expect(record.delivery.value).toBe('already_known')
    })
  })
})

describe('execution mode separates a free deterministic run from a missing one', () => {
  it('reports local_only decisions with no ModelRun as intended, not as an error', async () => {
    await withTestContext(async (ctx) => {
      const { seed } = await fullLoop(ctx)
      const modes = await executionModes(ctx, seed.workstreamId)
      const local = modes.find((m) => m.executionMode === 'local_only')!
      expect(local.decisionRecords).toBeGreaterThan(0)
      expect(local.withModelRun).toBe(0)
      expect(local.withoutModelRun).toBe(local.decisionRecords)
    })
  })
})

describe('Context Health at the moment of the decision', () => {
  it('records the health used, and later feedback does not move it', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      const before = opportunity.contextHealth
      const health = await contextHealthRecords(ctx, seed.workstreamId)
      expect(health.some((h) => h.task === 'opportunity_generation')).toBe(true)

      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id, epistemic: 'incorrect',
      })
      const reread = await ctx.opportunities.findById(opportunity.id)
      expect(reread!.contextHealth).toBe(before)
    })
  })
})

describe('the validation export', () => {
  it('carries the schema version, ids, timestamps and missingness', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      const exported = await buildValidationExport(ctx, seed.workstreamId)

      expect(exported.validationSchemaVersion).toBe(VALIDATION_SCHEMA_VERSION)
      expect(exported.interventions.length).toBeGreaterThan(0)
      expect(exported.notes.join(' ')).toContain('no conclusion about correctness')

      const jsonl = toJsonl(exported)
      const lines = jsonl.trim().split('\n').map((l) => JSON.parse(l))
      expect(lines[0].kind).toBe('header')
      for (const line of lines) {
        expect(line.validationSchemaVersion).toBe(VALIDATION_SCHEMA_VERSION)
      }
      expect(lines.some((l) => l.kind === 'intervention')).toBe(true)
      expect(lines.some((l) => l.kind === 'unraised_change')).toBe(true)

      const intervention = lines.find(
        (l) => l.kind === 'intervention' && l.record.opportunityId === opportunity.id)!
      expect(intervention.record.policyVersion).toBeTruthy()
      expect(intervention.record.originEvidenceIds.length).toBeGreaterThan(0)
      expect(intervention.record.timeline.userSeenAt.missing).toBe('unobservable')
    })
  })

  /**
   * The export must not become a second corpus. Content that is reclassified
   * later in the ledger could never be reclassified here.
   */
  it('carries no evidence text, declaration wording or feedback notes', async () => {
    await withTestContext(async (ctx) => {
      const { seed, opportunity } = await fullLoop(ctx)
      await recordFeedback(ctx, {
        targetType: 'opportunity', targetId: opportunity.id,
        delivery: 'irrelevant', reason: 'SECRET-NOTE-DO-NOT-COPY',
      })
      const jsonl = toJsonl(await buildValidationExport(ctx, seed.workstreamId))

      expect(jsonl).not.toContain('SECRET-NOTE-DO-NOT-COPY')
      // Nor the content of the evidence the opportunity rests on.
      const evidence = await ctx.evidence.findByIds(opportunity.originEvidenceIds)
      for (const e of evidence) {
        expect(jsonl).not.toContain(e.content.slice(0, 40))
      }
      // But every id needed to go and read it is there.
      for (const id of opportunity.originEvidenceIds) expect(jsonl).toContain(id)
    })
  })
})
