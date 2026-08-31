import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, capture } from '@ava/app'
import type { AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * GS-03 — Unresolved Question, in the chat surface.
 *
 * The Slice 5 half of GS-03 turns this into an Opportunity. Here it must hold
 * in conversation: AVA can name what is still open WITHOUT inventing a
 * resolution for it.
 *
 * Synthetic scenario. A technical test, never product validation evidence.
 */
function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock' }
}

describe('GS-03 open questions are reported, not resolved', () => {
  it('names the open question and invents no answer for it', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Gamma', null)

      await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Ship the reader in October',
        content: 'The reader ships in October, feature-frozen at the end of September.',
      })
      await capture(ctx, {
        workstreamId: ws.id, type: 'question',
        title: 'Who owns the migration script?',
        content: 'Nobody has been named owner of the data migration script yet.',
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What is still unresolved?',
      })

      expect(res.abstained).toBe(false)
      expect(res.answer).toContain('Who owns the migration script?')

      // The open question is present in state, still open.
      const open = res.packet.currentState.filter((s) => s.type === 'question')
      expect(open).toHaveLength(1)
      expect(open[0]!.status).toBe('open')

      // No owner was invented. The answer reports the gap and stops there.
      expect(res.answer).not.toMatch(/owned by|the owner is|assigned to/i)

      // Every reference shown is real and was in the packet.
      const eligible = new Set(res.packet.providerEligibleEvidenceIds)
      expect(res.evidence.length).toBeGreaterThan(0)
      for (const e of res.evidence) expect(eligible.has(e.evidenceId)).toBe(true)
    })
  })
})
