import { describe, expect, it } from 'vitest'
import { isUlid, ulid } from '../primitives/id'
import {
  isStrongerThan, weakestOf, EVIDENCE_STRENGTHS,
} from '../primitives/evidence-strength'
import {
  isOperationalOnlyField, reasoningTimestamp, wasKnownAt, isValidSupersession,
} from '../primitives/time'
import { countIndependentEvidence, canCorroborate, EMPTY_LINEAGE } from '../primitives/origin'

describe('ulid', () => {
  it('produces sortable, well-formed ids', () => {
    const a = ulid(1_000)
    const b = ulid(2_000)
    expect(isUlid(a)).toBe(true)
    expect(isUlid(b)).toBe(true)
    expect(a < b).toBe(true)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => ulid()))
    expect(ids.size).toBe(500)
  })
})

describe('ordinal evidence strength', () => {
  it('exposes exactly three levels and no numeric confidence', () => {
    expect(EVIDENCE_STRENGTHS).toEqual(['ESTABLISHED', 'SUPPORTED', 'SPECULATIVE'])
  })

  it('orders levels without arithmetic', () => {
    expect(isStrongerThan('ESTABLISHED', 'SUPPORTED')).toBe(true)
    expect(isStrongerThan('SUPPORTED', 'SPECULATIVE')).toBe(true)
    expect(isStrongerThan('SPECULATIVE', 'ESTABLISHED')).toBe(false)
  })

  it('never increases strength by composition: derived inherits the weakest link', () => {
    expect(weakestOf(['ESTABLISHED', 'ESTABLISHED'])).toBe('ESTABLISHED')
    expect(weakestOf(['ESTABLISHED', 'SPECULATIVE'])).toBe('SPECULATIVE')
    expect(weakestOf(['SUPPORTED', 'ESTABLISHED'])).toBe('SUPPORTED')
    // Three established items do not add up to something stronger.
    expect(weakestOf(['ESTABLISHED', 'ESTABLISHED', 'ESTABLISHED'])).toBe('ESTABLISHED')
  })

  it('treats an empty basis as speculative, never as established', () => {
    expect(weakestOf([])).toBe('SPECULATIVE')
  })
})

describe('temporal model', () => {
  it('marks created_at and updated_at as operational only', () => {
    expect(isOperationalOnlyField('created_at')).toBe(true)
    expect(isOperationalOnlyField('updated_at')).toBe(true)
    expect(isOperationalOnlyField('observed_at')).toBe(false)
    expect(isOperationalOnlyField('effective_at')).toBe(false)
  })

  it('reasons with effective_at when known, observed_at otherwise', () => {
    const observedAt = new Date('2026-03-10T00:00:00Z')
    const effectiveAt = new Date('2026-03-01T00:00:00Z')
    expect(reasoningTimestamp({ observedAt, effectiveAt })).toEqual(effectiveAt)
    expect(reasoningTimestamp({ observedAt, effectiveAt: null })).toEqual(observedAt)
  })

  it('answers what was known at a moment using observed_at', () => {
    const o = { observedAt: new Date('2026-03-10T00:00:00Z') }
    expect(wasKnownAt(o, new Date('2026-03-09T00:00:00Z'))).toBe(false)
    expect(wasKnownAt(o, new Date('2026-03-11T00:00:00Z'))).toBe(true)
  })

  it('refuses a successor observed before its predecessor', () => {
    const older = new Date('2026-03-10T00:00:00Z')
    const newer = new Date('2026-03-11T00:00:00Z')
    expect(isValidSupersession(older, newer)).toBe(true)
    expect(isValidSupersession(newer, older)).toBe(false)
  })
})

describe('evidence diversity', () => {
  const item = (id: string, origin: 'user' | 'system', root: string | null) => ({
    id, contentOrigin: origin, lineage: { ...EMPTY_LINEAGE, rootRunId: root },
  })

  it('does not let AVA output corroborate AVA', () => {
    expect(canCorroborate(item('a', 'system', null))).toBe(false)
    expect(canCorroborate(item('a', 'user', null))).toBe(true)
    expect(countIndependentEvidence([item('a', 'system', null), item('b', 'system', null)])).toBe(0)
  })

  it('counts the same causal origin once, however many rows it occupies', () => {
    const sameRoot = [item('a', 'user', 'run-1'), item('b', 'user', 'run-1'), item('c', 'user', 'run-1')]
    expect(countIndependentEvidence(sameRoot)).toBe(1)
  })

  it('counts genuinely independent observations separately', () => {
    expect(countIndependentEvidence([item('a', 'user', null), item('b', 'user', null)])).toBe(2)
  })
})
