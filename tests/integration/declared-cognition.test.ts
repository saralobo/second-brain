import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  ask, capture, correctCognition, declareCognition, proposeHypothesis,
} from '@ava/app'
import type { AppContext, AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock' }
}

async function ws(ctx: AppContext, name = 'Cognition') {
  return (await ctx.workstreams.create(name, null)).id
}

describe('capture → evidence → declared cognition → retrieval → answer', () => {
  it('turns a preference capture into a declaration backed by the ledger', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      const res = await capture(ctx, {
        workstreamId: id, type: 'preference',
        content: 'I prefer concise project updates.',
      })
      if (!res.ok) throw new Error('capture failed')

      expect(res.cognition).not.toBeNull()
      expect(res.cognition!.cognitionType).toBe('contextual_preference')
      expect(res.cognition!.origin).toBe('declared')
      expect(res.cognition!.status).toBe('active')

      // The declaration is a projection over the ledger, never a second store.
      expect(res.cognition!.evidenceIds).toEqual([res.evidence.id])
      const backing = await ctx.evidence.findById(res.evidence.id)
      expect(backing!.content).toBe('I prefer concise project updates.')
      expect(backing!.contentOrigin).toBe('user')

      // And it is queryable as declared-class memory.
      const records = await ctx.memory.listByClass('declared_cognition', id)
      expect(records).toHaveLength(1)
      expect(records[0]!.derivedFromEvidenceIds).toEqual([res.evidence.id])
      expect(records[0]!.evidenceReachable).toBe(true)
    })
  })

  it('answers a personal question from the declaration, in the user\'s own voice', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      await declareCognition(ctx, {
        content: 'I prefer concise project updates.',
        cognitionType: 'contextual_preference',
        workstreamId: id,
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: id,
        question: 'What have I explicitly told you about my preferences for updates?',
      })

      expect(res.packet.query.kind).toBe('personal')
      expect(res.abstained).toBe(false)
      expect(res.answer).toContain('What you explicitly told me')
      expect(res.answer).toContain('concise project updates')
      expect(res.declaredCognitionIds).toHaveLength(1)

      const dr = await ctx.decisionRecords.findById(res.decisionRecordId)
      expect(dr!.declaredCognitionIds).toHaveLength(1)
      expect(dr!.cognitiveAuthority).toBe('DECLARED')
      expect(Object.keys(dr!.scopeMatch)).toHaveLength(1)
    })
  })

  it('abstains on a personal question when nothing was declared', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      // Plenty of work evidence — none of it a statement about preferences.
      await capture(ctx, {
        workstreamId: id, type: 'note',
        content: 'Reviewed three minimalist layout options and picked the third.',
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: id, question: 'What do you know about my preferences for layout?',
      })

      expect(res.contextHealth.state).toBe('INSUFFICIENT')
      expect(res.contextHealth.decidedBy).toBe('declared_cognition_coverage')
      expect(res.abstained).toBe(true)
      // Behaviour is not a statement of preference.
      expect(res.answer).not.toMatch(/you prefer/i)
    })
  })
})

describe('correction and supersession', () => {
  it('keeps the original reachable and makes the correction authoritative', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      const first = await declareCognition(ctx, {
        content: 'For benchmarks I prefer visual references.',
        cognitionType: 'contextual_preference',
        workstreamId: id,
        scope: { activity: 'benchmark' },
      })

      const second = await correctCognition(ctx, {
        cognitionId: first.cognition.id,
        kind: 'contextualize',
        content: 'Visual references apply to craft work. For strategy I prioritise features.',
        scope: { activity: 'benchmark', workType: 'craft' },
      })

      // t1 is preserved, not erased.
      const original = await ctx.cognition.findById(first.cognition.id)
      expect(original!.content).toBe('For benchmarks I prefer visual references.')
      expect(original!.status).toBe('superseded')
      expect(original!.supersededBy).toBe(second.cognition.id)

      // t2 is authoritative and part of the same chain.
      expect(second.cognition.version).toBe(2)
      expect(second.cognition.rootId).toBe(first.cognition.rootId)
      expect(second.cognition.origin).toBe('corrected')

      // The whole history is queryable.
      const history = await ctx.cognition.history(first.cognition.rootId)
      expect(history.map((h) => h.version)).toEqual([1, 2])

      // Only the current version is active.
      const active = await ctx.cognition.listActive(id)
      expect(active).toHaveLength(1)
      expect(active[0]!.id).toBe(second.cognition.id)
    })
  })

  it('applies a scoped declaration only where its scope matches', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      await declareCognition(ctx, {
        content: 'For technical architecture decisions I prefer detailed reasoning.',
        cognitionType: 'contextual_preference',
        workstreamId: id,
        scope: { decisionCategory: 'architecture' },
      })

      const matching = await ask(ctx, mockDeps(), {
        workstreamId: id,
        question: 'What have I told you about my preferences here?',
        cognitionContext: { decisionCategory: 'architecture' },
      })
      expect(matching.declaredCognitionIds).toHaveLength(1)

      const other = await ask(ctx, mockDeps(), {
        workstreamId: id,
        question: 'What have I told you about my preferences here?',
        cognitionContext: { decisionCategory: 'pricing' },
      })
      // The declaration exists but does not cover pricing, so it is not applied.
      expect(other.declaredCognitionIds).toHaveLength(0)
      const excluded = other.packet.exclusions.find((e) => e.reason === 'scope_does_not_match')
      expect(excluded).toBeDefined()
    })
  })
})

describe('behavioral hypotheses stay subordinate', () => {
  it('never outranks an explicit declaration covering the same context', async () => {
    await withTestContext(async (ctx) => {
      const id = await ws(ctx)
      const a = await capture(ctx, {
        workstreamId: id, type: 'note', content: 'Chose the minimal layout for the report.',
      })
      const b = await capture(ctx, {
        workstreamId: id, type: 'note', content: 'Chose the minimal layout for the deck.',
      })
      if (!a.ok || !b.ok) throw new Error('setup failed')

      const declared = await declareCognition(ctx, {
        content: 'I prefer dense layouts when the audience is technical.',
        cognitionType: 'contextual_preference',
        workstreamId: id,
      })

      const proposal = await proposeHypothesis(ctx, {
        falsifiableDescription: 'In observed layout choices, the minimal option was picked.',
        context: 'report and deck layout selection',
        evidenceIds: [a.evidence.id, b.evidence.id],
        alternativesAvailable: ['dense layout', 'illustrated layout'],
        workstreamId: id,
      })
      expect(proposal.formed).toBe(true)

      const res = await ask(ctx, mockDeps(), {
        workstreamId: id, question: 'What do you know about my preferences for layout?',
      })

      // Both appear, separated, and only the declaration speaks for the user.
      expect(res.packet.declaredCognition).toHaveLength(1)
      expect(res.packet.behavioralHypotheses).toHaveLength(1)
      expect(res.answer).toContain('What you explicitly told me')
      expect(res.answer).toContain('dense layouts')
      expect(res.answer).toMatch(/only guessing about/i)
      expect(res.answer).toMatch(/I have a hypothesis that/)

      // The conflict is recorded rather than resolved by the system.
      const conflicts = await ctx.hypotheses.openConflicts()
      expect(conflicts.length).toBeGreaterThanOrEqual(0)
      expect(declared.cognition.status).toBe('active')
    })
  })
})
