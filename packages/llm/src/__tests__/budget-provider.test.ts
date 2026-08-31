import { describe, expect, it } from 'vitest'
import { BudgetController, UNCONFIGURED_CAPS, capsFromEnv } from '../budget'
import { MockModelProvider } from '../providers/mock'

describe('budget controller (ADR-21 Gate A)', () => {
  it('is closed, not permissive, when no cap is configured', () => {
    const b = new BudgetController(UNCONFIGURED_CAPS)
    const decision = b.authorize(0.001)
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.cap).toBe('unconfigured')
      expect(decision.reason).toContain('ADR-21')
    }
  })

  it('leaves caps unset when the environment does not define them', () => {
    expect(capsFromEnv({})).toEqual(UNCONFIGURED_CAPS)
  })

  it('hard stops on each configured cap', () => {
    const b = new BudgetController({
      perCallUsd: 0.10, perCheckpointUsd: 0.25, dailyUsd: 1, monthlyUsd: 10, maxRetries: 1,
    })
    expect(b.authorize(0.5).allowed).toBe(false)      // per-call
    expect(b.authorize(0.05).allowed).toBe(true)

    b.record({ inputTokens: 0, outputTokens: 0, costUsd: 0.24 })
    const checkpoint = b.authorize(0.05)
    expect(checkpoint.allowed).toBe(false)
    if (!checkpoint.allowed) expect(checkpoint.cap).toBe('perCheckpointUsd')

    b.closeCheckpoint()
    expect(b.authorize(0.05).allowed).toBe(true)
  })

  it('stops retries at the cap', () => {
    const b = new BudgetController({ ...UNCONFIGURED_CAPS, perCallUsd: 1, maxRetries: 1 })
    expect(b.authorizeRetry().allowed).toBe(true)
    b.recordRetry()
    expect(b.authorizeRetry().allowed).toBe(false)
  })
})

describe('mock model provider (ADR-22 gate is open)', () => {
  it('abstains rather than inventing a response', async () => {
    const p = new MockModelProvider()
    const res = await p.generateStructured(
      { archetype: 'state_query_answer', promptId: 'p', promptVersion: 'v1', input: {}, evidenceIds: [], timeoutMs: 100 },
      (v) => v as unknown,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.abstained).toBe(true)
  })

  it('rejects output that fails schema validation instead of repairing it', async () => {
    const p = new MockModelProvider()
    p.setResponse('state_query_answer', { wrong: true })
    const res = await p.generateStructured(
      { archetype: 'state_query_answer', promptId: 'p', promptVersion: 'v1', input: {}, evidenceIds: [], timeoutMs: 100 },
      () => null,
    )
    expect(res.ok).toBe(false)
    if (!res.ok && res.abstained === false) {
      expect(res.error).toContain('schema validation')
    } else {
      throw new Error('expected a schema validation failure, not an abstention')
    }
  })

  it('declares a data policy that can be read in code', () => {
    const p = new MockModelProvider()
    expect(p.policyMetadata.usedForTraining).toBe(false)
    expect(p.policyMetadata.region).toBe('local')
  })

  it('reports zero usage: nothing leaves the process', async () => {
    const p = new MockModelProvider()
    p.setResponse('explanation', { text: 'ok' })
    const res = await p.generateStructured(
      { archetype: 'explanation', promptId: 'p', promptVersion: 'v1', input: {}, evidenceIds: [], timeoutMs: 100 },
      (v) => v as { text: string },
    )
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 })
  })
})
