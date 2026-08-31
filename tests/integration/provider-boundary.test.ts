import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { capture, callThroughBoundary, buildProviderRegistry, MOCK_PROVIDER } from '@ava/app'
import type { AppContext } from '@ava/app'
import {
  BudgetController, MockModelProvider, ProviderRegistry, classify, evaluatePolicy,
  redactForProvider, minimize, costUsd, PRICE_TABLE_VERSION,
} from '@ava/llm'

const CAPS = {
  perCallUsd: 0.15, perCheckpointUsd: 0.50, dailyUsd: 2.00, monthlyUsd: 20.00, maxRetries: 1,
}

async function seedEvidence(ctx: AppContext, content: string, type = 'note') {
  const ws = await ctx.workstreams.create('Alpha')
  const out = await capture(ctx, { workstreamId: ws.id, type, content })
  if (!out.ok) throw new Error('capture failed')
  return out.evidence
}

function registryWith(mock: MockModelProvider): ProviderRegistry {
  const r = new ProviderRegistry()
  r.register(MOCK_PROVIDER, { provider: mock, configured: true, enabled: true, local: true })
  return r
}

/**
 * The same double, registered as a NETWORK-CAPABLE provider.
 *
 * The budget gate is skipped for `local: true` entries — an in-process call
 * has no spend to control. Exercising the ADR-21 caps therefore requires a
 * provider the registry believes can reach the network, or the test would
 * pass by taking the path that has no cap in it.
 */
function externalRegistryWith(mock: MockModelProvider): ProviderRegistry {
  const r = new ProviderRegistry()
  r.register(MOCK_PROVIDER, { provider: mock, configured: true, enabled: true, local: false })
  return r
}

const REQ = {
  archetype: 'state_query_answer' as const,
  purpose: 'gate verification',
  promptId: 'gate.smoke',
  promptVersion: 'v1',
  providerName: MOCK_PROVIDER,
  system: 'Answer only from the evidence provided.',
  buildUserMessage: (items: { id: string; text: string }[]) =>
    items.map((i) => `[${i.id}] ${i.text}`).join('\n'),
  validate: (v: unknown) => (v && typeof v === 'object' ? (v as { ok: boolean }) : null),
}

describe('F-01 effective sensitivity', () => {
  it('reads the latest annotation, not the value stored at capture', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'ordinary content')
      expect(await ctx.evidence.effectiveSensitivity(e.id)).toBe('normal')

      await ctx.evidence.annotate({
        evidenceId: e.id, sensitivity: 'restricted', reason: 'contains a salary figure',
      })
      expect(await ctx.evidence.effectiveSensitivity(e.id)).toBe('restricted')

      // The evidence row itself is untouched.
      const raw = await ctx.evidence.findById(e.id)
      expect(raw?.sensitivity).toBe('normal')
      expect(raw?.content).toBe('ordinary content')
    })
  })

  it('follows a chain of reclassifications to the most recent', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      await ctx.evidence.annotate({ evidenceId: e.id, sensitivity: 'restricted', reason: 'first' })
      await ctx.evidence.annotate({ evidenceId: e.id, sensitivity: 'sensitive', reason: 'reviewed' })
      expect(await ctx.evidence.effectiveSensitivity(e.id)).toBe('sensitive')
    })
  })

  it('serves the boundary with effective sensitivity resolved', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      await ctx.evidence.annotate({ evidenceId: e.id, sensitivity: 'restricted', reason: 'x' })
      const [forBoundary] = await ctx.evidence.findForBoundary([e.id])
      expect(forBoundary?.sensitivity).toBe('restricted')
    })
  })

  it('denies the external call after reclassification to restricted', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'ordinary content that later turns out to be restricted')
      const mock = new MockModelProvider()
      mock.setResponse('state_query_answer', { ok: true })
      const deps = { registry: registryWith(mock), caps: CAPS }

      // Allowed while normal.
      const before = await callThroughBoundary(ctx, deps, { ...REQ, evidenceIds: [e.id] })
      expect(before.ok).toBe(true)

      await ctx.evidence.annotate({ evidenceId: e.id, sensitivity: 'restricted', reason: 'review' })

      const after = await callThroughBoundary(ctx, deps, { ...REQ, evidenceIds: [e.id] })
      expect(after.ok).toBe(false)
      if (!after.ok) {
        expect(after.stage).toBe('sensitivity')
        expect(after.abstained).toBe(true)
        expect(after.reason).toContain('restricted')
        // Denied before any ModelRun was opened: no call was ever prepared.
        expect(after.modelRunId).toBeNull()
      }
    })
  })
})

describe('F-02 provider registry', () => {
  it('refuses an unregistered provider', () => {
    const r = new ProviderRegistry()
    const res = r.resolve('anthropic')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failedAt).toBe('registered')
  })

  it('refuses a registered but unconfigured provider', () => {
    const r = new ProviderRegistry()
    r.register('anthropic', { provider: new MockModelProvider(), configured: false, enabled: false, local: false })
    const res = r.resolve('anthropic')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failedAt).toBe('configured')
  })

  it('refuses a configured but not enabled provider', () => {
    const r = new ProviderRegistry()
    r.register('anthropic', { provider: new MockModelProvider(), configured: true, enabled: false, local: false })
    const res = r.resolve('anthropic')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failedAt).toBe('enabled')
  })

  it('will not enable a provider that is not configured', () => {
    const r = new ProviderRegistry()
    r.register('anthropic', { provider: new MockModelProvider(), configured: false, enabled: false, local: false })
    expect(() => r.enable('anthropic')).toThrow(/not configured/)
  })

  it('registers only the mock when no provider is selected', async () => {
    const setup = await buildProviderRegistry({} as NodeJS.ProcessEnv)
    expect(setup.active).toBe(MOCK_PROVIDER)
    expect(setup.registry.names()).toEqual([MOCK_PROVIDER])
  })

  it('falls back to the mock when anthropic is selected without a key', async () => {
    const setup = await buildProviderRegistry({ AVA_MODEL_PROVIDER: 'anthropic' } as NodeJS.ProcessEnv)
    expect(setup.active).toBe(MOCK_PROVIDER)
    expect(setup.registry.isEnabled('anthropic')).toBe(false)
    expect(setup.notes.join(' ')).toContain('ANTHROPIC_API_KEY is absent')
  })

  it('denies the boundary call when the provider is disabled', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const r = new ProviderRegistry()
      r.register(MOCK_PROVIDER, { provider: new MockModelProvider(), configured: true, enabled: false, local: true })
      const out = await callThroughBoundary(ctx, { registry: r, caps: CAPS }, { ...REQ, evidenceIds: [e.id] })
      expect(out.ok).toBe(false)
      if (!out.ok) expect(out.stage).toBe('provider_resolution')
    })
  })
})

describe('budget gate (ADR-21 operational safety caps)', () => {
  it('denies and records when the per-call cap would be exceeded', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'x'.repeat(4_000))
      // Priced as the real model so the cost path is genuinely exercised.
      const mock = new MockModelProvider(new Map(), 'claude-sonnet-5')
      mock.setResponse('state_query_answer', { ok: true })
      const tiny = { ...CAPS, perCallUsd: 0.0001 }
      const out = await callThroughBoundary(ctx, { registry: externalRegistryWith(mock), caps: tiny },
        { ...REQ, evidenceIds: [e.id] })

      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.stage).toBe('budget')
        expect(out.modelRunId).not.toBeNull()
        const run = await ctx.modelRuns.findById(out.modelRunId!)
        expect(run?.status).toBe('DENIED')
        expect(run?.denial_reason).toContain('perCallUsd')
        expect(run?.response_completed_at).not.toBeNull()
      }
    })
  })

  it('denies when the daily cap is already consumed', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const mock = new MockModelProvider()
      mock.setResponse('state_query_answer', { ok: true })

      // A settled run that has already spent the whole day's allowance.
      const spent = await ctx.modelRuns.begin({
        provider: 'anthropic/claude-sonnet-5', model: 'claude-sonnet-5',
        archetype: 'state_query_answer', purpose: 'earlier', promptId: 'p', promptVersion: 'v1',
        evidenceIds: [], sensitivitySummary: {}, redactionApplied: [],
        estimatedCostUsd: 2.00, priceTableVersion: PRICE_TABLE_VERSION, requestStartedAt: new Date(),
      })
      await ctx.modelRuns.finish(spent, { status: 'COMPLETE', actualCostUsd: 2.00 })

      // The cap is lower than what has already been spent today.
      const out = await callThroughBoundary(ctx,
        { registry: externalRegistryWith(mock), caps: { ...CAPS, dailyUsd: 1.00 } },
        { ...REQ, evidenceIds: [e.id] })
      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.stage).toBe('budget')
        expect(out.reason).toContain('daily')
        const run = await ctx.modelRuns.findById(out.modelRunId!)
        expect(run?.status).toBe('DENIED')
      }
    })
  })

  it('is closed when no cap is configured', () => {
    const b = new BudgetController()
    const d = b.authorize(0.000001)
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.cap).toBe('unconfigured')
  })

  it('stops retries at the configured cap', () => {
    const b = new BudgetController(CAPS)
    expect(b.authorizeRetry().allowed).toBe(true)
    b.recordRetry()
    expect(b.authorizeRetry().allowed).toBe(false)
  })
})

describe('ModelRun lifecycle', () => {
  it('opens the run in PENDING before the provider is called', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content for the run')
      let statusDuringCall: string | null = null

      // A provider that inspects the database while the call is in flight.
      const observing = new MockModelProvider()
      observing.setResponse('state_query_answer', { ok: true })
      const original = observing.generateStructured.bind(observing)
      observing.generateStructured = async (req, validate) => {
        const rows = await ctx.modelRuns.list(1)
        statusDuringCall = rows[0]?.status ?? null
        return original(req, validate)
      }

      const out = await callThroughBoundary(ctx, { registry: registryWith(observing), caps: CAPS },
        { ...REQ, evidenceIds: [e.id] })

      expect(out.ok).toBe(true)
      // The record already existed, in PENDING, while the provider was running.
      expect(statusDuringCall).toBe('PENDING')
      if (out.ok) {
        const run = await ctx.modelRuns.findById(out.modelRunId)
        expect(run?.status).toBe('COMPLETE')
        expect(run?.latency_ms).not.toBeNull()
        expect(run?.prompt_id).toBe('gate.smoke')
        expect(run?.prompt_version).toBe('v1')
        expect(run?.evidence_ids).toContain(e.id)
        expect(run?.price_table_version).toBe(PRICE_TABLE_VERSION)
      }
    })
  })

  it('records a failed call rather than losing it', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const failing = new MockModelProvider()
      failing.setResponse('state_query_answer', { malformed: true })

      const out = await callThroughBoundary(ctx, { registry: registryWith(failing), caps: CAPS },
        { ...REQ, evidenceIds: [e.id], validate: () => null })

      expect(out.ok).toBe(false)
      if (!out.ok) {
        const run = await ctx.modelRuns.findById(out.modelRunId!)
        expect(run?.status).toBe('FAILED')
        expect(run?.error_kind).toBe('call_failed')
        expect(run?.response_completed_at).not.toBeNull()
      }
    })
  })

  it('records an abstention as ABORTED, distinct from a failure', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      // No canned response: the mock abstains.
      const abstaining = new MockModelProvider()
      const out = await callThroughBoundary(ctx, { registry: registryWith(abstaining), caps: CAPS },
        { ...REQ, evidenceIds: [e.id] })

      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.abstained).toBe(true)
        const run = await ctx.modelRuns.findById(out.modelRunId!)
        expect(run?.status).toBe('ABORTED')
        expect(run?.error_kind).toBe('abstained')
      }
    })
  })

  it('records unknown token usage as NULL, never as zero', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const failing = new MockModelProvider()
      failing.setResponse('state_query_answer', { x: 1 })
      const out = await callThroughBoundary(ctx, { registry: registryWith(failing), caps: CAPS },
        { ...REQ, evidenceIds: [e.id], validate: () => null })
      if (!out.ok) {
        const run = await ctx.modelRuns.findById(out.modelRunId!)
        expect(run?.input_tokens).toBeNull()
        expect(run?.output_tokens).toBeNull()
      }
    })
  })
})

describe('structured validation', () => {
  it('rejects output that fails the local schema check, even from a compliant provider', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const mock = new MockModelProvider()
      mock.setResponse('state_query_answer', { unexpected: 'shape' })

      const out = await callThroughBoundary(ctx, { registry: registryWith(mock), caps: CAPS }, {
        ...REQ,
        evidenceIds: [e.id],
        validate: (v: unknown) => {
          const o = v as Record<string, unknown>
          return typeof o?.answer === 'string' ? (o as { answer: string }) : null
        },
      })

      expect(out.ok).toBe(false)
      if (!out.ok) expect(out.stage).toBe('structured_validation')
    })
  })

  it('accepts output that satisfies the schema', async () => {
    await withTestContext(async (ctx) => {
      const e = await seedEvidence(ctx, 'content')
      const mock = new MockModelProvider()
      mock.setResponse('state_query_answer', { answer: 'grounded', evidence_ids: [] })

      const out = await callThroughBoundary(ctx, { registry: registryWith(mock), caps: CAPS }, {
        ...REQ,
        evidenceIds: [e.id],
        validate: (v: unknown) => {
          const o = v as Record<string, unknown>
          return typeof o?.answer === 'string' ? (o as { answer: string }) : null
        },
      })
      expect(out.ok).toBe(true)
      if (out.ok) expect(out.value.answer).toBe('grounded')
    })
  })
})
