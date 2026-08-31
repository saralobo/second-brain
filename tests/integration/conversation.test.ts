import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  buildGlobalBriefing, buildBriefing, commitPendingWrite, generateOpportunities,
  handleTurn, openCheckpoint, seedArchitectureBCorrection, seedProactiveScenario,
} from '@ava/app'
import type { AppContext, AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * Conversational capture and the global surfaces.
 *
 * The invariant under test throughout: voice and typing are two transports into
 * one brain. Neither can write without confirmation, neither has a private
 * write path, and neither can reach evidence outside its workstream.
 *
 * Synthetic scenarios. Technical tests, never product validation evidence.
 */
function deps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock', caps: undefined }
}

async function scenario(ctx: AppContext) {
  const seed = await seedProactiveScenario(ctx)
  await openCheckpoint(ctx, seed.workstreamId)
  await seedArchitectureBCorrection(ctx, seed.workstreamId, seed.decisionObjectId)
  await generateOpportunities(ctx, seed.workstreamId)
  return seed
}

describe('a turn never writes without confirmation', () => {
  it('proposes a decision and writes nothing yet', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const before = (await ctx.state.allVersions(seed.workstreamId)).length

      const outcome = await handleTurn(ctx, deps(), {
        text: 'Record that we decided to go with option B.',
        workstreamId: seed.workstreamId,
      })

      expect(outcome.kind).toBe('confirm')
      if (outcome.kind !== 'confirm') return
      // The confirmation is specific enough to catch a mis-transcription.
      expect(outcome.text).toContain('decision')
      expect(outcome.text).toContain('option B')
      expect(outcome.text).toMatch(/confirm\?$/i)
      // And nothing has been written.
      expect((await ctx.state.allVersions(seed.workstreamId)).length).toBe(before)
    })
  })

  it('writes only after the pending write is committed', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const proposed = await handleTurn(ctx, deps(), {
        text: 'Record that we decided to go with option B.',
        workstreamId: seed.workstreamId,
      })
      if (proposed.kind !== 'confirm') throw new Error('expected a confirmation')

      const done = await commitPendingWrite(ctx, proposed.pending)
      expect(done.kind).toBe('recorded')

      const versions = await ctx.state.allVersions(seed.workstreamId)
      const decision = versions.find((v) => v.title.includes('option B'))
      expect(decision).toBeDefined()
      expect(decision!.type).toBe('decision')
    })
  })

  it('asks rather than guessing when it cannot tell what was meant', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const before = (await ctx.evidence.listByWorkstream(seed.workstreamId, 200)).length

      const outcome = await handleTurn(ctx, deps(), {
        text: 'The launch date thing',
        workstreamId: seed.workstreamId,
      })
      expect(outcome.kind).toBe('clarify')
      expect((await ctx.evidence.listByWorkstream(seed.workstreamId, 200)).length).toBe(before)
    })
  })
})

/**
 * F-15 discipline, carried into conversation. Dating a past event as "now"
 * would make detection latency identically zero, which is the defect Slice 7
 * had to fix at the schema level.
 */
describe('temporal capture through conversation', () => {
  it('asks when it happened rather than dating it now', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const outcome = await handleTurn(ctx, deps(), {
        text: 'Yesterday we changed the launch date to Friday.',
        workstreamId: seed.workstreamId,
      })
      expect(outcome.kind).toBe('needs_time')
      if (outcome.kind !== 'needs_time') return
      expect(outcome.text).toBe('When did that happen?')
      expect(outcome.pending.observedAt).toBeNull()
    })
  })

  it('records the supplied past date, not the write time', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const yesterday = new Date(Date.now() - 86_400_000).toISOString()

      const proposed = await handleTurn(ctx, deps(), {
        text: 'Yesterday we changed the launch date to Friday.',
        workstreamId: seed.workstreamId,
        observedAt: yesterday,
      })
      if (proposed.kind !== 'confirm') throw new Error('expected a confirmation')
      await commitPendingWrite(ctx, proposed.pending)

      const evidence = await ctx.evidence.listByWorkstream(seed.workstreamId, 200)
      const recorded = evidence.find((e) => e.content.includes('launch date'))
      expect(recorded).toBeDefined()
      expect(recorded!.observedAt.getTime()).toBeCloseTo(new Date(yesterday).getTime(), -3)
      expect(Date.now() - recorded!.observedAt.getTime()).toBeGreaterThan(60_000)
    })
  })
})

describe('conversation cannot bypass the pipeline', () => {
  it('routes a spoken capture through the ledger like any other', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const proposed = await handleTurn(ctx, deps(), {
        text: 'Record that we shipped the pilot build.',
        workstreamId: seed.workstreamId,
      })
      if (proposed.kind !== 'confirm') throw new Error('expected a confirmation')
      await commitPendingWrite(ctx, proposed.pending)

      const evidence = await ctx.evidence.listByWorkstream(seed.workstreamId, 200)
      const row = evidence.find((e) => e.content.includes('pilot build'))
      expect(row).toBeDefined()
      // Same provenance as a typed capture: user origin, real source record.
      expect(row!.contentOrigin).toBe('user')
      expect(row!.sourceRecordId).toBeTruthy()
    })
  })

  it('creates no declaration or hypothesis from a question', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const before = (await ctx.cognition.listAll()).length
      await handleTurn(ctx, deps(), {
        text: 'What changed in this project?',
        workstreamId: seed.workstreamId,
      })
      expect((await ctx.cognition.listAll()).length).toBe(before)
      expect(await ctx.hypotheses.list(seed.workstreamId)).toHaveLength(0)
    })
  })

  it('produces the same DecisionRecord a typed question would', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const outcome = await handleTurn(ctx, deps(), {
        text: 'What changed in this project?',
        workstreamId: seed.workstreamId,
      })
      expect(outcome.kind).toBe('answer')
      if (outcome.kind !== 'answer') return
      const dr = await ctx.decisionRecords.findById(outcome.decisionRecordId)
      expect(dr).not.toBeNull()
      expect(dr!.executionMode).toBe('mock')
    })
  })
})

describe('the cross-workstream boundary holds in conversation', () => {
  it('refuses a question that would need evidence from several projects', async () => {
    await withTestContext(async (ctx) => {
      await scenario(ctx)
      const outcome = await handleTurn(ctx, deps(), {
        text: 'Compare all architectural decisions across my projects and tell me the pattern.',
        workstreamId: null,
      })
      expect(outcome.kind).toBe('refused')
      if (outcome.kind !== 'refused') return
      // It explains the limit rather than answering from one project.
      expect(outcome.text).toContain('cannot yet reason across them')
      expect(outcome.text).toContain('own boundary')
    })
  })

  it('refuses to write without knowing which project it belongs to', async () => {
    await withTestContext(async (ctx) => {
      await scenario(ctx)
      const outcome = await handleTurn(ctx, deps(), {
        text: 'Record that we decided to go with option B.',
        workstreamId: null,
      })
      expect(outcome.kind).toBe('refused')
    })
  })
})

describe('Global Today aggregates without crossing boundaries', () => {
  it('carries the originating workstream on every item', async () => {
    await withTestContext(async (ctx) => {
      await scenario(ctx)
      await scenario(ctx)
      const briefing = await buildGlobalBriefing(ctx, { deliver: true })

      expect(briefing.workstreams.length).toBe(2)
      const items = briefing.blocks.flatMap((b) => b.items)
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        expect(item.workstreamId).toBeTruthy()
        expect(item.workstreamName).toBeTruthy()
        expect(['HEALTHY', 'DEGRADED', 'INSUFFICIENT']).toContain(item.contextHealth)
      }
    })
  })

  it('holds the attention caps across the union, not per workstream', async () => {
    await withTestContext(async (ctx) => {
      for (let i = 0; i < 3; i++) await scenario(ctx)
      const briefing = await buildGlobalBriefing(ctx, { deliver: true })
      for (const block of briefing.blocks) expect(block.items.length).toBeLessThanOrEqual(3)
      expect(briefing.blocks.reduce((n, b) => n + b.items.length, 0)).toBeLessThanOrEqual(10)
    })
  })

  it('produces no global health and no global score', async () => {
    await withTestContext(async (ctx) => {
      await scenario(ctx)
      const briefing = await buildGlobalBriefing(ctx, { deliver: false })
      const shape = briefing as unknown as Record<string, unknown>
      expect(shape.contextHealth).toBeUndefined()
      expect(shape.score).toBeUndefined()
      // Health lives per workstream, where the specification puts it.
      expect(briefing.workstreams.every((w) => typeof w.contextHealth === 'string')).toBe(true)
    })
  })

  it('leaves the per-workstream briefing behaviour untouched', async () => {
    await withTestContext(async (ctx) => {
      const seed = await scenario(ctx)
      const local = await buildBriefing(ctx, seed.workstreamId, { deliver: false })
      expect(local.blocks.map((b) => b.id)).toEqual([
        'what_changed', 'needs_your_attention', 'open_threads', 'ava_noticed', 'prepared_for_you',
      ])
      expect(local.workstreamId).toBe(seed.workstreamId)
    })
  })
})
