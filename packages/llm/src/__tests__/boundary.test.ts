import { describe, expect, it } from 'vitest'
import { classify, BOUNDARY_RULES, isDenied, requiresPolicyCheck } from '../classification'
import { redactForProvider, minimize } from '../boundary-redaction'
import { evaluatePolicy } from '../policy'
import { costUsd, estimateCostUsd, priceFor, PRICE_TABLE_VERSION } from '../pricing'
import { ANTHROPIC_POLICY } from '../providers/anthropic'

describe('data classification', () => {
  it('maps classes onto the boundary rules the gate decided', () => {
    expect(BOUNDARY_RULES).toEqual({
      CLASS_0: 'ALLOWED',
      CLASS_1: 'ALLOWED_AFTER_MINIMIZATION',
      CLASS_2: 'CONDITIONAL',
      CLASS_3: 'DENIED',
    })
  })

  it('classifies restricted content as CLASS 3 regardless of origin', () => {
    for (const origin of ['user', 'third_party', 'source_system', 'system'] as const) {
      expect(classify({ contentOrigin: origin, sensitivity: 'restricted' })).toBe('CLASS_3')
    }
    expect(isDenied('CLASS_3')).toBe(true)
  })

  it('classifies AVA output as CLASS 3: it cannot corroborate itself', () => {
    expect(classify({ contentOrigin: 'system', sensitivity: 'normal' })).toBe('CLASS_3')
  })

  it('classifies third-party and sensitive content as conditional', () => {
    expect(classify({ contentOrigin: 'third_party', sensitivity: 'normal' })).toBe('CLASS_2')
    expect(classify({ contentOrigin: 'source_system', sensitivity: 'normal' })).toBe('CLASS_2')
    expect(classify({ contentOrigin: 'user', sensitivity: 'sensitive' })).toBe('CLASS_2')
    expect(requiresPolicyCheck('CLASS_2')).toBe(true)
  })

  it('classifies ordinary user content as CLASS 1 and synthetic as CLASS 0', () => {
    expect(classify({ contentOrigin: 'user', sensitivity: 'normal' })).toBe('CLASS_1')
    expect(classify({ contentOrigin: 'user', sensitivity: 'normal', synthetic: true })).toBe('CLASS_0')
  })
})

describe('provider policy gate', () => {
  it('denies CLASS 3 outright, with no override', () => {
    const d = evaluatePolicy({ classes: ['CLASS_1', 'CLASS_3'], policy: ANTHROPIC_POLICY, redactionApplied: true })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.deniedClass).toBe('CLASS_3')
  })

  it('requires redaction before work-context content may be sent', () => {
    const d = evaluatePolicy({ classes: ['CLASS_2'], policy: ANTHROPIC_POLICY, redactionApplied: false })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toContain('redaction')
  })

  it('denies CLASS 2 when the provider trains on submitted data', () => {
    const d = evaluatePolicy({
      classes: ['CLASS_2'],
      policy: { ...ANTHROPIC_POLICY, usedForTraining: true },
      redactionApplied: true,
    })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toContain('trains')
  })

  it('denies CLASS 2 when the training policy is merely unverified', () => {
    const d = evaluatePolicy({
      classes: ['CLASS_2'],
      policy: { ...ANTHROPIC_POLICY, usedForTraining: 'unknown' },
      redactionApplied: true,
    })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toContain('unverified')
  })

  it('allows CLASS 1 without conditions', () => {
    const d = evaluatePolicy({ classes: ['CLASS_1'], policy: ANTHROPIC_POLICY, redactionApplied: false })
    expect(d.allowed).toBe(true)
    if (d.allowed) expect(d.conditional).toBe(false)
  })
})

describe('provider-boundary redaction', () => {
  it('removes contact identifiers while preserving the sentence', () => {
    const r = redactForProvider('Ping ana.souza@empresa.com or +55 (11) 98765-4321 about the spec.')
    expect(r.text).not.toContain('ana.souza@empresa.com')
    expect(r.text).not.toContain('98765')
    expect(r.text).toContain('about the spec')
    expect(r.applied).toContain('email')
    expect(r.applied).toContain('phone')
  })

  it('replaces named third parties with stable role placeholders', () => {
    const r = redactForProvider('Marina rejected the proposal; Marina asked for a rewrite.', {
      thirdPartyNames: ['Marina'],
    })
    expect(r.text).not.toContain('Marina')
    expect(r.text).toContain('[person 1]')
    // The relationship survives: it still reads as one person acting twice.
    expect(r.text.match(/\[person 1\]/g)).toHaveLength(2)
    expect(r.applied).toContain('third_party_name')
  })

  it('strips credentials embedded in URLs', () => {
    const r = redactForProvider('see https://user:s3cret@example.com/doc')
    expect(r.text).not.toContain('s3cret')
    expect(r.applied).toContain('url_credentials')
  })

  it('preserves text that has nothing to remove', () => {
    const original = 'We decided to store annotations locally for the first version.'
    const r = redactForProvider(original)
    expect(r.text).toBe(original)
    expect(r.applied).toEqual([])
    expect(r.degraded).toBe(false)
  })

  it('flags a result as degraded when little meaning survives', () => {
    const r = redactForProvider('a@b.co c@d.co e@f.co g@h.co')
    expect(r.degraded).toBe(true)
  })

  it('differs from logging redaction: it preserves content it is allowed to send', () => {
    const r = redactForProvider('The pricing model changed to per-seat billing.')
    // Logging redaction would reduce this to a length. Boundary redaction keeps it.
    expect(r.text).toContain('per-seat billing')
  })
})

describe('minimization', () => {
  it('caps item count and reports what was dropped', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `E${i}`, content: `item ${i}` }))
    const r = minimize(items, (i) => i.content, { maxItems: 5, maxCharsPerItem: 100 })
    expect(r.kept).toHaveLength(5)
    expect(r.droppedCount).toBe(15)
  })

  it('truncates long items and marks them truncated', () => {
    const r = minimize([{ content: 'x'.repeat(500) }], (i) => i.content, { maxItems: 5, maxCharsPerItem: 100 })
    expect(r.kept[0]?.truncated).toBe(true)
    expect(r.kept[0]?.text.length).toBeLessThanOrEqual(101)
  })
})

describe('price table', () => {
  it('is versioned, so a later price change cannot rewrite recorded costs', () => {
    expect(PRICE_TABLE_VERSION).toBe('2026-08-30')
  })

  it('prices the selected model and the challenger', () => {
    expect(priceFor('claude-sonnet-5')).toEqual({ inputPerMillionUsd: 2, outputPerMillionUsd: 10 })
    expect(priceFor('gpt-5.6-terra')).toEqual({ inputPerMillionUsd: 2, outputPerMillionUsd: 12 })
  })

  it('returns null for an unpriced model rather than guessing zero', () => {
    expect(costUsd('unknown-model', 1000, 1000)).toBeNull()
    expect(estimateCostUsd('unknown-model', 1000, 1000)).toBeNull()
  })

  it('computes cost from tokens', () => {
    // 1M input + 1M output at 2 + 10
    expect(costUsd('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(12, 6)
  })
})

describe('anthropic policy metadata', () => {
  it('records the externally verified facts the policy gate consults', () => {
    expect(ANTHROPIC_POLICY.usedForTraining).toBe(false)
    expect(ANTHROPIC_POLICY.retention).toContain('30 days')
    expect(ANTHROPIC_POLICY.allowedSensitivity).toContain('sensitive')
    expect(ANTHROPIC_POLICY.allowedSensitivity).not.toContain('restricted')
  })
})
