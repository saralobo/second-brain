import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, capture } from '@ava/app'
import type { AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * GS-05 — Insufficient Context → Abstention.
 *
 * The plan calls this "the test easiest to let pass by accident and the most
 * important to keep". Passing means AVA REFUSES, not that it answers with a
 * warning attached: a plausible answer carrying a disclaimer is still a
 * plausible answer, and that is the failure this scenario exists to catch.
 *
 * Synthetic scenario. A technical test, never evidence of product validation.
 */
function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock' }
}

describe('GS-05 insufficient context produces a real abstention', () => {
  it('abstains, names the gap, and never contacts a provider', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Alpha', null)
      // Evidence exists — but about something else entirely.
      await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Office move', content: 'The team moves to the second floor in September.',
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id,
        question: 'What did we decide about the vendor contract renewal terms?',
      })

      // 1. It is an abstention, not a hedged answer.
      expect(res.abstained).toBe(true)
      expect(res.contextHealth.state).toBe('INSUFFICIENT')
      expect(res.answer).toMatch(/do not have enough evidence/i)

      // 2. It names what is missing and what would fix it.
      expect(res.answer).toMatch(/missing|found no evidence/i)
      expect(res.answer).toMatch(/Capturing the missing information/i)

      // 3. It asserts nothing about the vendor contract.
      expect(res.answer.toLowerCase()).not.toContain('vendor contract is')
      expect(res.evidence.every((e) => !/vendor|contract/i.test(e.excerpt))).toBe(true)

      // 4. No provider was contacted and no cost was incurred.
      expect(res.executionMode).toBe('local_only')
      expect(res.modelRunId).toBeNull()
      const runs = await ctx.db.query<{ n: string }>('SELECT count(*)::text AS n FROM model_run')
      expect(Number(runs.rows[0]!.n)).toBe(0)

      // 5. The abstention is recorded, with the reason and the health that caused it.
      const dr = await ctx.decisionRecords.findById(res.decisionRecordId)
      expect(dr!.abstained).toBe(true)
      expect(dr!.contextHealthState).toBe('INSUFFICIENT')
      expect(dr!.abstentionReason).toMatch(/INSUFFICIENT/)
      expect(dr!.executionMode).toBe('local_only')

      // 6. The health assessment behind it is retrievable months later.
      const counts = await ctx.telemetry.countByType()
      expect(counts.abstention_shown).toBe(1)
      expect(counts.grounded_answer_generated).toBeUndefined()
    })
  })

  it('abstains when the only relevant evidence may not be used', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Beta', null)
      const c = await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Salary banding', content: 'Salary banding for the platform team was revised.',
      })
      if (!c.ok) throw new Error('setup failed')

      // Later reclassification. The evidence stays in the ledger, untouched.
      await ctx.evidence.annotate({
        evidenceId: c.evidence.id, sensitivity: 'restricted', reason: 'contains compensation data',
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What do you know about salary banding?',
      })

      expect(res.abstained).toBe(true)
      expect(res.contextHealth.state).toBe('INSUFFICIENT')
      expect(res.contextHealth.decidedBy).toBe('permission_blocked_coverage')

      // Local retrieval still found it — knowledge is not erased because a
      // provider may not receive it.
      expect(res.packet.retrieved.map((r) => r.evidenceId)).toContain(c.evidence.id)
      // But it is not eligible to cross the boundary.
      expect(res.packet.providerEligibleEvidenceIds).not.toContain(c.evidence.id)
      // And the exclusion is named without revealing what was withheld.
      const ex = res.packet.exclusions.find((e) => e.evidenceId === c.evidence.id)
      expect(ex!.reason).toBe('restricted_sensitivity')
      expect(ex!.detail).not.toMatch(/salary|banding/i)
    })
  })
})
