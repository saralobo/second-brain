import { describe, expect, it } from 'vitest'
import { assessHealth } from '../health'
import type { HealthInput } from '../health'
import type { RetrievalResult } from '@ava/core'
import type { HealthSignals } from '@ava/db'

const NOW = new Date('2026-08-30T12:00:00Z')

const cleanSignals: HealthSignals = {
  sourcesAvailable: 1, sourcesPartial: 0, sourcesUnavailable: 0,
  rejectedInputs: 0, unresolvedEntities: 0, outdatedArtifacts: 0,
  contradictionFlags: 0, systemEvidenceWithoutLineage: 0,
  evidenceCount: 4,
  oldestObservedAt: new Date('2026-08-01T12:00:00Z'),
  newestObservedAt: new Date('2026-08-29T12:00:00Z'),
}

const hit = (id: string): RetrievalResult => ({ evidenceId: id } as RetrievalResult)

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    queryKind: 'state',
    signals: cleanSignals,
    retrieved: [hit('A')],
    withheldCount: 0,
    withheldMaterial: false,
    declaredCognitionCount: 0,
    hypothesisCount: 0,
    now: NOW,
    ...over,
  }
}

describe('context health dimensions', () => {
  it('computes all ten dimensions, always', () => {
    const r = assessHealth(input())
    expect(r.dimensions).toHaveLength(11)
    expect(r.state).toBe('HEALTHY')
  })

  it('is INSUFFICIENT when retrieval found nothing', () => {
    const r = assessHealth(input({ retrieved: [] }))
    expect(r.state).toBe('INSUFFICIENT')
    expect(r.decidedBy).toBe('expected_sources_available')
  })

  it('is INSUFFICIENT when policy removed the evidence the question needed', () => {
    const r = assessHealth(input({ withheldCount: 2, withheldMaterial: true }))
    expect(r.state).toBe('INSUFFICIENT')
    expect(r.decidedBy).toBe('permission_blocked_coverage')
  })

  it('is DEGRADED when something was withheld but the rest still covers it', () => {
    const r = assessHealth(input({ withheldCount: 1, withheldMaterial: false }))
    expect(r.state).toBe('DEGRADED')
    expect(r.gaps.join(' ')).toContain('withheld')
  })

  it('is DEGRADED when a source is unavailable', () => {
    const r = assessHealth(input({ signals: { ...cleanSignals, sourcesUnavailable: 1 } }))
    expect(r.state).toBe('DEGRADED')
  })

  it('is DEGRADED when a contradiction is unresolved', () => {
    const r = assessHealth(input({ signals: { ...cleanSignals, contradictionFlags: 2 } }))
    expect(r.state).toBe('DEGRADED')
    expect(r.decidedBy).toBe('unresolved_contradictions')
  })

  it('treats a single-instant corpus as insufficient for a change question only', () => {
    const single: HealthSignals = {
      ...cleanSignals, evidenceCount: 1,
      oldestObservedAt: NOW, newestObservedAt: NOW,
    }
    expect(assessHealth(input({ signals: single, queryKind: 'change' })).state).toBe('INSUFFICIENT')
    // The same corpus answers "what do you know" perfectly well. This is what
    // task-specific health means, and why a global number cannot exist.
    expect(assessHealth(input({ signals: single, queryKind: 'state' })).state).toBe('HEALTHY')
  })

  it('reports stale evidence without blocking the answer', () => {
    const stale = { ...cleanSignals, newestObservedAt: new Date('2026-01-01T00:00:00Z') }
    const r = assessHealth(input({ signals: stale }))
    const freshness = r.dimensions.find((d) => d.id === 'source_freshness')!
    expect(freshness.verdict).toBe('degraded')
    expect(freshness.material).toBe(false)
    expect(r.state).toBe('HEALTHY')
  })
})
