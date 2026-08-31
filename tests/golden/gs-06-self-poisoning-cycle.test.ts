import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import {
  ask, buildView, capture, declareCognition, promoteToStabilized, proposeHypothesis,
} from '@ava/app'
import type { AskDeps } from '@ava/app'
import { MockModelProvider, ProviderRegistry } from '@ava/llm'
import { countIndependentSupport } from '@ava/core'

/**
 * GS-06 extended to memory and cognition.
 *
 * The full cycle this closes:
 *
 *   AVA generates statement X → X is captured as system-origin evidence
 *   → X is retrieved later → X must NOT count as new confirmation of X
 *
 * Left open, this is how a system talks itself into certainty: every restating
 * of a claim looks like another witness to it, and confidence grows with
 * nothing behind it but repetition.
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

describe('GS-06 system-origin content cannot confirm AVA', () => {
  it('does not let AVA restating a claim increase support for it', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('SelfConfirm', null)
      const source = await ctx.sources.ensureManualCapture()

      const user = await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Adopt the compact index',
        content: 'We adopt the compact index format for search.',
      })
      if (!user.ok || !user.change) throw new Error('setup failed')

      const before = countIndependentSupport([
        { id: user.evidence.id, contentOrigin: 'user', lineage: user.evidence.lineage },
      ])

      // AVA states X, and X comes back into the ledger as system-origin.
      const echo = await ctx.evidence.append({
        content: 'AVA concluded: the team adopted the compact index format.',
        contentOrigin: 'system', sourceRecordId: source.id, workstreamId: ws.id,
        captureType: 'note', title: 'AVA summary', observedAt: new Date(),
        effectiveAt: null, effectiveAtInferred: false, strength: 'SUPPORTED',
        sensitivity: 'normal',
        lineage: { rootRunId: null, producedBy: 'ava', derivedFromEvidenceIds: [user.evidence.id] },
        fields: {},
      })

      const after = countIndependentSupport([
        { id: user.evidence.id, contentOrigin: 'user', lineage: user.evidence.lineage },
        { id: echo.id, contentOrigin: 'system', lineage: echo.lineage },
      ])
      expect(after).toBe(before)

      // It cannot stabilize the claim on its own, either.
      const promotion = await promoteToStabilized(ctx, {
        versionId: user.change.version.id,
        title: 'Compact index adopted',
        evidenceIds: [echo.id],
        contextHealth: 'HEALTHY', materialConflicts: 0, scoped: true,
        workstreamId: ws.id,
      })
      expect(promotion.decision.promote).toBe(false)
      expect(promotion.decision.reasons.join(' ')).toContain('cannot corroborate itself')
      expect(promotion.record).toBeNull()

      // And it is retrievable for audit, but never cited.
      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What do you know about the compact index format?',
      })
      expect(res.packet.retrieved.map((r) => r.evidenceId)).toContain(echo.id)
      expect(res.packet.providerEligibleEvidenceIds).not.toContain(echo.id)
      expect(res.evidence.map((e) => e.evidenceId)).not.toContain(echo.id)
    })
  })

  it('does not let AVA\'s own output support a hypothesis about the user', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('NoSelfInfer', null)
      const source = await ctx.sources.ensureManualCapture()

      const real = await capture(ctx, {
        workstreamId: ws.id, type: 'note', content: 'Picked the short summary format.',
      })
      if (!real.ok) throw new Error('setup failed')

      const echo = await ctx.evidence.append({
        content: 'AVA noted that the short format was picked again.',
        contentOrigin: 'system', sourceRecordId: source.id, workstreamId: ws.id,
        captureType: 'note', title: null, observedAt: new Date(),
        effectiveAt: null, effectiveAtInferred: false, strength: 'SUPPORTED',
        sensitivity: 'normal',
        lineage: { rootRunId: null, producedBy: 'ava', derivedFromEvidenceIds: [] },
        fields: {},
      })

      const outcome = await proposeHypothesis(ctx, {
        falsifiableDescription: 'In observed summary choices, the short format was picked.',
        context: 'summary format selection',
        evidenceIds: [real.evidence.id, echo.id],
        alternativesAvailable: ['long format'],
        workstreamId: ws.id,
      })

      expect(outcome.formed).toBe(false)
      if (!outcome.formed) {
        expect(outcome.assessment.rejections.map((r) => r.kind)).toContain('system_origin_evidence')
      }
      expect(await ctx.hypotheses.list(ws.id)).toHaveLength(0)
    })
  })

  it('does not let a summary of a summary strengthen a claim', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('NoRecursion', null)
      const a = await capture(ctx, {
        workstreamId: ws.id, type: 'note', content: 'The migration finished on the 12th.',
      })
      if (!a.ok) throw new Error('setup failed')

      const viewA = await buildView(ctx, {
        title: 'Migration', summary: 'Migration done.', evidenceIds: [a.evidence.id],
        workstreamId: ws.id,
      })
      // A "summary of the summary" still flattens to the same level-zero row.
      const summaryOfView = await buildView(ctx, {
        title: 'Migration (short)', summary: 'Done.',
        evidenceIds: viewA.derivedFromEvidenceIds, workstreamId: ws.id,
      })

      expect(summaryOfView.derivedFromEvidenceIds).toEqual([a.evidence.id])
      expect(countIndependentSupport([
        { id: a.evidence.id, contentOrigin: 'user', lineage: a.evidence.lineage },
        { id: viewA.id, contentOrigin: 'user', lineage: a.evidence.lineage, derivedFromEvidenceIds: viewA.derivedFromEvidenceIds },
        { id: summaryOfView.id, contentOrigin: 'user', lineage: a.evidence.lineage, derivedFromEvidenceIds: summaryOfView.derivedFromEvidenceIds },
      ])).toBe(1)

      // A view is never stronger than what it summarises, and never a source.
      expect(summaryOfView.contentOrigin).toBe('system')
      expect(summaryOfView.strength).toBe(a.evidence.strength)
    })
  })

  it('refuses a memory record whose evidence cannot be reached', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Unreachable', null)
      await expect(ctx.memory.upsert({
        memoryClass: 'semantic_stabilized',
        refId: 'X', refType: 'state_object_version', title: 'Floating claim',
        derivedFromEvidenceIds: ['01ZZZZZZZZZZZZZZZZZZZZZZZZ'],
        strength: 'ESTABLISHED', workstreamId: ws.id,
      })).rejects.toThrow(/not reachable/)

      // And nothing in the table violates the invariant.
      expect(await ctx.memory.unreachableRecords()).toEqual([])
    })
  })

  it('does not let a hypothesis speak in the user\'s voice', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Voice', null)
      const a = await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'Chose the terse variant.' })
      const b = await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'Chose the terse variant again.' })
      if (!a.ok || !b.ok) throw new Error('setup failed')

      await proposeHypothesis(ctx, {
        falsifiableDescription: 'In observed copy choices, the terse variant was picked.',
        context: 'copy selection',
        evidenceIds: [a.evidence.id, b.evidence.id],
        alternativesAvailable: ['verbose variant'],
        workstreamId: ws.id,
      })

      const res = await ask(ctx, mockDeps(), {
        workstreamId: ws.id, question: 'What are you only guessing about me?',
      })

      expect(res.answer).toMatch(/I have a hypothesis that/)
      expect(res.answer).not.toMatch(/\byou prefer\b/i)
      expect(res.answer).not.toMatch(/\byou always\b/i)
      expect(res.hypothesisIds).toHaveLength(1)
      expect(res.declaredCognitionIds).toHaveLength(0)

      // Nothing was declared, so the personal context is not fully healthy.
      expect(res.contextHealth.state).toBe('DEGRADED')
    })
  })

  it('rejects an answer that states a preference the user never declared', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Contract', null)
      const a = await capture(ctx, { workstreamId: ws.id, type: 'note', content: 'Used the compact table.' })
      if (!a.ok) throw new Error('setup failed')

      // A provider that speaks for the user with no declaration behind it.
      const mock = new MockModelProvider()
      mock.setResponse('state_query_answer', {
        answer: 'You prefer compact tables.',
        evidence_ids: [a.evidence.id],
        uncertainties: [],
        abstained: false,
      })
      const registry = new ProviderRegistry()
      registry.register('spy', { provider: mock, configured: true, enabled: true, local: true })

      const res = await ask(ctx, { registry, providerName: 'spy' }, {
        workstreamId: ws.id, question: 'What do you know about the compact table?',
      })

      expect(res.rejectedAnswer).toBe(true)
      expect(res.answer).not.toContain('You prefer compact tables')
      expect(res.groundingFailures.map((f) => f.kind)).toContain('unsupported_preference_claim')
    })
  })
})
