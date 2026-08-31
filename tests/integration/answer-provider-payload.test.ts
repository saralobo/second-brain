import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, capture } from '@ava/app'
import { ProviderRegistry } from '@ava/llm'
import type {
  GenerateRequest, GenerateResult, ModelProvider, ProviderPolicy, Usage,
} from '@ava/llm'

/**
 * What actually crosses the boundary.
 *
 * The other tests assert on eligibility lists. This one inspects the payload
 * itself: an eligibility list is a claim about the payload, and a claim is
 * not the payload.
 */
class RecordingProvider implements ModelProvider {
  readonly id = 'recording/test/1'
  readonly modelName = 'mock/deterministic/1'
  readonly timeoutMs = 5_000
  readonly maxRetries = 0
  readonly policyMetadata: ProviderPolicy = {
    retention: 'none - test double', usedForTraining: false,
    allowedSensitivity: ['normal', 'sensitive'], region: 'local',
  }
  readonly seen: GenerateRequest[] = []
  private readonly zero: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

  constructor(private readonly reply: unknown) {}

  async generateStructured<T>(
    req: GenerateRequest, validate: (v: unknown) => T | null,
  ): Promise<GenerateResult<T>> {
    this.seen.push(req)
    const value = validate(this.reply)
    if (value === null) {
      return { ok: false, abstained: false, error: 'schema', usage: this.zero, modelId: this.id }
    }
    return { ok: true, value, usage: this.zero, modelId: this.id }
  }

  usage(): Usage { return { ...this.zero } }
}

function payloadOf(p: RecordingProvider): string {
  return p.seen.map((r) => JSON.stringify(r.input)).join('\n')
}

describe('the payload that reaches the provider', () => {
  it('never contains evidence reclassified as restricted (F-01)', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Payload', null)

      const ok = await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Rollout plan', content: 'The rollout plan targets the Helsinki region first.',
      })
      const secret = await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Rollout budget', content: 'The rollout budget includes a CONFIDENTIALFIGURE line.',
      })
      if (!ok.ok || !secret.ok) throw new Error('setup failed')

      // Reclassified AFTER capture. The evidence row itself is untouched.
      await ctx.evidence.annotate({
        evidenceId: secret.evidence.id, sensitivity: 'restricted', reason: 'commercially sensitive',
      })

      const provider = new RecordingProvider({
        answer: `The rollout targets Helsinki first [${ok.evidence.id}]`,
        evidence_ids: [ok.evidence.id],
        uncertainties: [],
        abstained: false,
      })
      const registry = new ProviderRegistry()
      registry.register('spy', { provider, configured: true, enabled: true, local: true })

      const res = await ask(ctx, { registry, providerName: 'spy' }, {
        workstreamId: ws.id, question: 'What do you know about the rollout?',
      })

      expect(provider.seen).toHaveLength(1)
      const payload = payloadOf(provider)

      // The restricted content and its id are both absent from the payload.
      expect(payload).not.toContain('CONFIDENTIALFIGURE')
      expect(payload).not.toContain(secret.evidence.id)
      // The permitted item did travel.
      expect(payload).toContain(ok.evidence.id)
      expect(payload).toContain('Helsinki')

      // Locally, the withheld item is still known and still visible.
      expect(res.packet.retrieved.map((r) => r.evidenceId)).toContain(secret.evidence.id)
      const still = await ctx.evidence.findById(secret.evidence.id)
      expect(still!.content).toContain('CONFIDENTIALFIGURE')
      expect(still!.sensitivity).toBe('normal')
      expect(await ctx.evidence.effectiveSensitivity(secret.evidence.id)).toBe('restricted')
    })
  })

  it('never sends AVA-generated content as evidence', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('SelfRef', null)
      const source = await ctx.sources.ensureManualCapture()
      const user = await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Latency target', content: 'The latency target for search is 200ms.',
      })
      if (!user.ok) throw new Error('setup failed')

      await ctx.evidence.append({
        content: 'AVA earlier concluded the latency target is SYSTEMECHO 200ms.',
        contentOrigin: 'system', sourceRecordId: source.id, workstreamId: ws.id,
        captureType: 'note', title: 'AVA note', observedAt: new Date(),
        effectiveAt: null, effectiveAtInferred: false, strength: 'SUPPORTED',
        sensitivity: 'normal',
        lineage: { rootRunId: null, producedBy: 'ava', derivedFromEvidenceIds: [] },
        fields: {},
      })

      const provider = new RecordingProvider({
        answer: `The latency target is 200ms [${user.evidence.id}]`,
        evidence_ids: [user.evidence.id], uncertainties: [], abstained: false,
      })
      const registry = new ProviderRegistry()
      registry.register('spy', { provider, configured: true, enabled: true, local: true })

      await ask(ctx, { registry, providerName: 'spy' }, {
        workstreamId: ws.id, question: 'What do you know about the latency target?',
      })

      expect(payloadOf(provider)).not.toContain('SYSTEMECHO')
    })
  })

  it('discards an answer that cites evidence it was never given', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Fabricator', null)
      const real = await capture(ctx, {
        workstreamId: ws.id, type: 'note',
        title: 'Vendor', content: 'The vendor confirmed delivery for week 40.',
      })
      if (!real.ok) throw new Error('setup failed')

      const invented = '01ZZZZZZZZZZZZZZZZZZZZZZZZ'
      const provider = new RecordingProvider({
        answer: `Delivery slipped to week 44 [${invented}]`,
        evidence_ids: [invented], uncertainties: [], abstained: false,
      })
      const registry = new ProviderRegistry()
      registry.register('spy', { provider, configured: true, enabled: true, local: true })

      const res = await ask(ctx, { registry, providerName: 'spy' }, {
        workstreamId: ws.id, question: 'What do you know about the vendor delivery?',
      })

      // The fabricated answer is discarded, not shown with a caveat.
      expect(res.rejectedAnswer).toBe(true)
      expect(res.abstained).toBe(true)
      expect(res.answer).not.toContain('week 44')
      expect(res.groundingFailures.map((f) => f.kind)).toContain('unknown_evidence_id')

      const dr = await ctx.decisionRecords.findById(res.decisionRecordId)
      expect(dr!.groundingValid).toBe(false)
      expect(dr!.fallbackUsed).toBe(true)
      // The rejection is a recorded event, not a silent retry.
      const counts = await ctx.telemetry.countByType()
      expect(counts.grounded_answer_rejected).toBe(1)
      expect(counts.grounded_answer_generated).toBeUndefined()
    })
  })
})
