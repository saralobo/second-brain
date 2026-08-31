import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, capture, seedProjectAlpha } from '@ava/app'
import type { AppContext, AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'

/**
 * question → retrieval → Context Packet → Context Health → provider
 * → grounding validation → response → DecisionRecord
 *
 * Runs entirely in mock mode: no API key, no network, no external call.
 */
function mockDeps(): AskDeps {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })
  return { registry, providerName: 'mock' }
}

async function seeded(ctx: AppContext) {
  const seed = await seedProjectAlpha(ctx)
  return seed
}

describe('grounded answering, end to end in mock mode', () => {
  it('answers "what changed" from evidence and change records, and records the decision', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seeded(ctx)

      const res = await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'What changed in this project?',
      })

      expect(res.abstained).toBe(false)
      expect(res.packet.query.kind).toBe('change')
      expect(res.evidence.length).toBeGreaterThan(0)
      expect(res.executionMode).toBe('mock')

      // Every reference shown survived validation against the packet.
      const eligible = new Set(res.packet.providerEligibleEvidenceIds)
      for (const e of res.evidence) expect(eligible.has(e.evidenceId)).toBe(true)

      const dr = await ctx.decisionRecords.findById(res.decisionRecordId)
      expect(dr).not.toBeNull()
      expect(dr!.groundingValid).toBe(true)
      expect(dr!.promptId).toBe('grounded-answer')
      expect(dr!.promptVersion).toBe('v2')
      expect(dr!.contextHealthState).toBe(res.contextHealth.state)
      expect(dr!.modelRunId).not.toBeNull()

      // The ModelRun exists and settled.
      const run = await ctx.modelRuns.findById(dr!.modelRunId!)
      expect(run?.status).toBe('COMPLETE')
    })
  })

  it('emits the slice 3 telemetry chain', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seeded(ctx)
      await ask(ctx, mockDeps(), {
        workstreamId: seed.workstreamId,
        question: 'What do you know about this project?',
      })
      const counts = await ctx.telemetry.countByType()
      for (const ev of [
        'question_received', 'retrieval_started', 'retrieval_completed',
        'context_packet_created', 'provider_call_authorized',
        'grounded_answer_generated', 'answer_shown',
      ]) {
        expect(counts[ev], `missing telemetry event ${ev}`).toBeGreaterThan(0)
      }
      // Delivery is not readership: `user_seen` stays unemitted.
      expect(counts.user_seen).toBeUndefined()
    })
  })

  it('distinguishes the current decision from the one it replaced', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Temporal', null)
      const a = await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Decision A: quarterly billing',
        content: 'Billing runs quarterly because finance reconciles quarterly.',
      })
      if (!a.ok || !a.change) throw new Error('setup failed')

      await capture(ctx, {
        workstreamId: ws.id, type: 'correction',
        title: 'Decision B: monthly billing',
        content: 'Billing moves to monthly. This replaces the quarterly billing decision.',
        supersedesStateObjectId: a.change.objectId,
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What decisions did I make about billing?',
      })
      expect(res.abstained).toBe(false)

      // The superseded version is present and explicitly marked as such —
      // reachable as history, never presented as the current position.
      const versions = await ctx.state.versionsOfObject(a.change.objectId)
      expect(versions).toHaveLength(2)
      expect(versions[0]!.supersededBy).toBe(versions[1]!.id)
      expect(versions[1]!.status).toBe('superseded')

      // The live version is NOT marked superseded, and the replaced one is
      // present separately — the distinction the answer depends on.
      const decisions = res.packet.currentState.filter((s) => s.type === 'decision')
      expect(decisions).toHaveLength(1)
      expect(decisions[0]!.superseded).toBe(false)
      expect(decisions[0]!.title).toContain('monthly')

      expect(res.packet.supersededState).toHaveLength(1)
      expect(res.packet.supersededState[0]!.title).toContain('quarterly')

      // And the answer says which is current without presenting the old one as such.
      expect(res.answer).toContain('monthly')
    })
  })

  it('never contacts a provider when retrieval is empty', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Empty', null)
      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What did we decide about the pricing model?',
      })

      expect(res.abstained).toBe(true)
      expect(res.contextHealth.state).toBe('INSUFFICIENT')
      expect(res.executionMode).toBe('local_only')
      expect(res.modelRunId).toBeNull()

      // No ModelRun of any status: the call was never even prepared.
      const runs = await ctx.db.query<{ n: string }>('SELECT count(*)::text AS n FROM model_run')
      expect(Number(runs.rows[0]!.n)).toBe(0)

      const counts = await ctx.telemetry.countByType()
      expect(counts.abstention_shown).toBe(1)
      expect(counts.provider_call_authorized).toBeUndefined()
    })
  })
})
