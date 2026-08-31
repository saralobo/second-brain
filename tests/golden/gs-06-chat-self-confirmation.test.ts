import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { ask, capture } from '@ava/app'
import type { AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'
import { countIndependentEvidence } from '@ava/core'

/**
 * GS-06 extended to grounded answering.
 *
 * AVA's own output re-entering the ledger must never corroborate AVA. In
 * Slice 2 this was about evidence diversity; in chat it is stronger — a
 * system-origin item may be visible locally for audit, but it can never be
 * used as the evidence behind a claim, or the system starts citing itself.
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

describe('GS-06 system-origin evidence cannot confirm AVA in chat', () => {
  it('retrieves AVA-generated content locally but never cites it', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Delta', null)
      const source = await ctx.sources.ensureManualCapture()

      const user = await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Adopt the compact index format',
        content: 'We adopt the compact index format for the search layer.',
      })
      if (!user.ok) throw new Error('setup failed')

      // An artifact AVA itself produced, re-entering the ledger.
      const generated = await ctx.evidence.append({
        content: 'Summary produced by AVA: the team adopted the compact index format.',
        contentOrigin: 'system',
        sourceRecordId: source.id,
        workstreamId: ws.id,
        captureType: 'note',
        title: 'AVA summary of the index decision',
        observedAt: new Date(),
        effectiveAt: null,
        effectiveAtInferred: false,
        strength: 'SUPPORTED',
        sensitivity: 'normal',
        lineage: { rootRunId: null, producedBy: 'ava', derivedFromEvidenceIds: [user.evidence.id] },
        fields: {},
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What do you know about the compact index format?',
      })

      // Visible locally — history and audit need it.
      const retrievedIds = res.packet.retrieved.map((r) => r.evidenceId)
      expect(retrievedIds).toContain(generated.id)

      // Never eligible to ground a claim, and never cited.
      expect(res.packet.providerEligibleEvidenceIds).not.toContain(generated.id)
      expect(res.evidence.map((e) => e.evidenceId)).not.toContain(generated.id)

      const exclusion = res.packet.exclusions.find((e) => e.evidenceId === generated.id)
      expect(exclusion!.reason).toBe('system_origin')

      // The claim gained no support from AVA restating it.
      expect(countIndependentEvidence([
        { id: user.evidence.id, contentOrigin: 'user', lineage: user.evidence.lineage },
        { id: generated.id, contentOrigin: 'system', lineage: generated.lineage },
      ])).toBe(1)

      // The DecisionRecord shows the exclusion, so the omission is auditable.
      const dr = await ctx.decisionRecords.findById(res.decisionRecordId)
      expect(dr!.excluded.some((e) => e.evidenceId === generated.id)).toBe(true)
    })
  })
})
