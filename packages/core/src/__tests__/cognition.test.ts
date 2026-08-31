import { describe, expect, it } from 'vitest'
import {
  applicableDeclarations, assertsUserPreference, assessHypothesis, authorityOf,
  countIndependentSupport, describeScope, evaluatePromotion, evidenceReachable,
  isGlobalScope, outranks, phraseFor, resolveCognitionConflict, scopeApplies,
  strengthOfView,
} from '../index'
import type {
  BehavioralHypothesis, CognitionScope, DeclaredCognition, SupportItem,
} from '../index'

const T = new Date('2026-08-30T12:00:00Z')

function declaration(over: Partial<DeclaredCognition> = {}): DeclaredCognition {
  return {
    id: 'C1', rootId: 'C1', version: 1,
    content: 'I prefer concise updates.',
    cognitionType: 'contextual_preference',
    scope: {}, audience: null,
    declaredAt: T, effectiveAt: null, supersededBy: null,
    status: 'active', origin: 'declared',
    evidenceIds: ['E1'], confirmsHypothesisId: null,
    workstreamId: null, sensitivity: 'normal', strength: 'ESTABLISHED',
    ...over,
  }
}

function hypothesis(over: Partial<BehavioralHypothesis> = {}): BehavioralHypothesis {
  return {
    id: 'H1',
    falsifiableDescription: 'In observed updates, the shorter draft was sent.',
    knowledgeOrigin: 'observed', context: 'weekly updates', scope: {},
    evidenceIds: ['E2', 'E3'], counterEvidenceIds: [],
    confirmationOpportunitiesObserved: 2,
    alternativesAvailable: ['long draft'], possibleConfounder: null,
    status: 'candidate', strength: 'SPECULATIVE', costOfMisapplication: 'low',
    shadowMode: true, workstreamId: null, sensitivity: 'sensitive',
    createdAt: T, confirmedByCognitionId: null, rejectedReason: null,
    ...over,
  }
}

describe('scope matching', () => {
  it('applies an unscoped declaration everywhere', () => {
    const m = scopeApplies({}, { workType: 'craft' })
    expect(m.applies).toBe(true)
    if (m.applies) expect(m.specificity).toBe(0)
  })

  it('applies a scoped declaration only where the scope matches', () => {
    const scope: CognitionScope = { workType: 'craft' }
    expect(scopeApplies(scope, { workType: 'craft' }).applies).toBe(true)
    expect(scopeApplies(scope, { workType: 'strategy' }).applies).toBe(false)
  })

  it('does NOT apply a scoped declaration when the context is unknown', () => {
    // The conservative reading. Guessing here is exactly how a contextual
    // preference silently becomes a global one.
    const m = scopeApplies({ workType: 'craft' }, {})
    expect(m.applies).toBe(false)
    expect(m.reason).toContain('workType')
  })

  it('honours an explicit exception over the rule it carves out of', () => {
    const scope: CognitionScope = {
      activity: 'benchmark',
      exceptions: [{ activity: 'benchmark', workType: 'strategy' }],
    }
    expect(scopeApplies(scope, { activity: 'benchmark', workType: 'craft' }).applies).toBe(true)
    expect(scopeApplies(scope, { activity: 'benchmark', workType: 'strategy' }).applies).toBe(false)
  })

  it('respects temporal validity without treating absence as expiry', () => {
    const past: CognitionScope = { validUntil: new Date('2026-01-01T00:00:00Z') }
    expect(scopeApplies(past, { at: T }).applies).toBe(false)
    // No dates at all means "until superseded", never "expired".
    expect(scopeApplies({}, { at: T }).applies).toBe(true)
  })

  it('describes scope in words and recognises a global one', () => {
    expect(isGlobalScope({})).toBe(true)
    expect(isGlobalScope({ workType: 'craft' })).toBe(false)
    expect(describeScope({})).toContain('no scope declared')
    expect(describeScope({ workType: 'craft' })).toContain('craft')
  })
})

describe('authority precedence', () => {
  it('orders declared above hypothesis above observation', () => {
    expect(outranks('DECLARED', 'HYPOTHESIS')).toBe(true)
    expect(outranks('CONFIRMED', 'HYPOTHESIS')).toBe(true)
    expect(outranks('HYPOTHESIS', 'OBSERVATION')).toBe(true)
    expect(outranks('HYPOTHESIS', 'DECLARED')).toBe(false)
  })

  it('gives a superseded declaration no authority at all', () => {
    expect(authorityOf(declaration({ status: 'superseded' }))).toBe('NONE')
    expect(authorityOf(declaration({ status: 'revoked' }))).toBe('NONE')
  })

  it('never lifts a hypothesis above HYPOTHESIS, even when confirmed', () => {
    // Reaching `confirmed` means a DECLARATION was created from it. The
    // declaration carries the authority; this row keeps the audit trail.
    expect(authorityOf(hypothesis({ status: 'confirmed' }))).toBe('HYPOTHESIS')
    expect(authorityOf(hypothesis({ status: 'supported' }))).toBe('HYPOTHESIS')
    expect(authorityOf(hypothesis({ status: 'contradicted' }))).toBe('NONE')
  })

  it('lets the declaration win and records the conflict rather than resolving it', () => {
    const r = resolveCognitionConflict([declaration()], [hypothesis()], {})
    expect(r.winner).toBe('declaration')
    expect(r.authority).toBe('DECLARED')
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]!.detail).toContain('the declaration stands')
  })

  it('leaves a hypothesis standing alone when nothing was declared', () => {
    const r = resolveCognitionConflict([], [hypothesis()], {})
    expect(r.winner).toBe('hypothesis')
    expect(r.authority).toBe('HYPOTHESIS')
  })

  it('prefers the more specific declaration when two apply', () => {
    const broad = declaration({ id: 'BROAD' })
    const narrow = declaration({ id: 'NARROW', scope: { workType: 'craft' } })
    const applicable = applicableDeclarations([broad, narrow], { workType: 'craft' })
    expect(applicable[0]!.declaration.id).toBe('NARROW')
  })

  it('excludes superseded declarations from what applies', () => {
    const old = declaration({ id: 'OLD', status: 'superseded' })
    expect(applicableDeclarations([old], {})).toHaveLength(0)
  })
})

describe('language contract', () => {
  it('lets AVA speak for the user only when the user spoke', () => {
    expect(phraseFor('DECLARED').mayAssertAsUserPreference).toBe(true)
    expect(phraseFor('CONFIRMED').mayAssertAsUserPreference).toBe(true)
    expect(phraseFor('HYPOTHESIS').mayAssertAsUserPreference).toBe(false)
    expect(phraseFor('OBSERVATION').mayAssertAsUserPreference).toBe(false)
  })

  it('phrases a hypothesis as a hypothesis', () => {
    expect(phraseFor('HYPOTHESIS').template).toContain('I have a hypothesis')
    expect(phraseFor('HYPOTHESIS').template).toContain('have not told me')
    expect(phraseFor('DECLARED').template).toContain('You explicitly told me')
  })

  it('detects a sentence that speaks for the user', () => {
    expect(assertsUserPreference('You prefer minimalist layouts.')).toBe(true)
    expect(assertsUserPreference('You always ship on Fridays.')).toBe(true)
    expect(assertsUserPreference('Your principle is to ship early.')).toBe(true)
    expect(assertsUserPreference('I have a hypothesis that shorter drafts were chosen.')).toBe(false)
    expect(assertsUserPreference('You explicitly told me concise updates apply here.')).toBe(false)
  })
})

describe('hypothesis admissibility', () => {
  const base = {
    falsifiableDescription: 'In observed layout choices, the minimal option was picked.',
    context: 'report layout',
    evidenceOrigins: ['user', 'user'] as const,
    alternativesAvailable: ['dense layout'],
    neverInferSubjects: [] as string[],
    aboutThirdParty: false,
  }

  it('accepts a situated, falsifiable observation with alternatives', () => {
    expect(assessHypothesis({ ...base }).admissible).toBe(true)
  })

  it('refuses when no alternative was available', () => {
    const r = assessHypothesis({ ...base, alternativesAvailable: [] })
    expect(r.admissible).toBe(false)
    expect(r.rejections.map((x) => x.kind)).toContain('no_alternatives')
  })

  it('refuses to profile a third party', () => {
    const r = assessHypothesis({ ...base, aboutThirdParty: true })
    expect(r.admissible).toBe(false)
    expect(r.rejections.map((x) => x.kind)).toContain('third_party_subject')
  })

  it('refuses to build on AVA\'s own output', () => {
    const r = assessHypothesis({ ...base, evidenceOrigins: ['user', 'system'] })
    expect(r.admissible).toBe(false)
    expect(r.rejections.map((x) => x.kind)).toContain('system_origin_evidence')
  })

  it('honours never_infer_subject', () => {
    const r = assessHypothesis({ ...base, neverInferSubjects: ['layout'] })
    expect(r.admissible).toBe(false)
    expect(r.rejections.map((x) => x.kind)).toContain('never_infer_subject')
  })

  it('refuses a trait claim, and requires the situation to be stated', () => {
    const trait = assessHypothesis({
      ...base, falsifiableDescription: 'The user always picks minimal layouts.',
    })
    expect(trait.admissible).toBe(false)
    expect(trait.rejections.map((x) => x.kind)).toContain('trait_claim')

    const unsituated = assessHypothesis({
      ...base, falsifiableDescription: 'Minimal layouts get picked.',
    })
    expect(unsituated.admissible).toBe(false)
  })

  it('requires more than a single observation', () => {
    const r = assessHypothesis({ ...base, evidenceOrigins: ['user'] })
    expect(r.admissible).toBe(false)
    expect(r.rejections.map((x) => x.kind)).toContain('insufficient_evidence')
  })
})

describe('no recursive summarization', () => {
  const lineage = { rootRunId: null, producedBy: null, derivedFromEvidenceIds: [] }

  it('counts a source and a summary of it as ONE piece of evidence', () => {
    const source: SupportItem = { id: 'E1', contentOrigin: 'user', lineage }
    const view: SupportItem = {
      id: 'V1', contentOrigin: 'user', lineage, derivedFromEvidenceIds: ['E1'],
    }
    expect(countIndependentSupport([source])).toBe(1)
    expect(countIndependentSupport([source, view])).toBe(1)
  })

  it('gains nothing from a summary of a summary', () => {
    // Evidence A → Memory View A → Summary of Memory View A.
    // The last object must not increase support for the claim.
    const a: SupportItem = { id: 'E1', contentOrigin: 'user', lineage }
    const viewA: SupportItem = { id: 'V1', contentOrigin: 'user', lineage, derivedFromEvidenceIds: ['E1'] }
    const summaryOfView: SupportItem = { id: 'V2', contentOrigin: 'user', lineage, derivedFromEvidenceIds: ['E1'] }
    expect(countIndependentSupport([a, viewA, summaryOfView])).toBe(1)
  })

  it('never counts AVA\'s own output', () => {
    const own: SupportItem = { id: 'S1', contentOrigin: 'system', lineage }
    expect(countIndependentSupport([own])).toBe(0)
  })

  it('deduplicates by lineage root', () => {
    const root = { rootRunId: 'RUN1', producedBy: 'x', derivedFromEvidenceIds: [] }
    expect(countIndependentSupport([
      { id: 'E1', contentOrigin: 'user', lineage: root },
      { id: 'E2', contentOrigin: 'user', lineage: root },
    ])).toBe(1)
  })

  it('never lets a view be stronger than its weakest source', () => {
    expect(strengthOfView(['ESTABLISHED', 'SUPPORTED'])).toBe('SUPPORTED')
    expect(strengthOfView(['ESTABLISHED'])).toBe('ESTABLISHED')
    expect(strengthOfView([])).toBe('SPECULATIVE')
  })
})

describe('evidence reachability', () => {
  it('is false when the evidence is missing or absent entirely', () => {
    expect(evidenceReachable([], new Set(['E1']))).toBe(false)
    expect(evidenceReachable(['E1', 'E2'], new Set(['E1']))).toBe(false)
    expect(evidenceReachable(['E1'], new Set(['E1']))).toBe(true)
  })
})

describe('promotion to stabilized knowledge', () => {
  const lineage = { rootRunId: null, producedBy: null, derivedFromEvidenceIds: [] }
  const twoSources: SupportItem[] = [
    { id: 'E1', contentOrigin: 'user', lineage },
    { id: 'E2', contentOrigin: 'third_party', lineage },
  ]
  const healthy = {
    support: twoSources,
    strengths: ['ESTABLISHED', 'ESTABLISHED'] as const,
    contextHealth: 'HEALTHY' as const,
    materialConflicts: 0,
    scoped: true,
    riskOfMisapplication: 'low' as const,
  }

  it('promotes when every rule is satisfied', () => {
    const d = evaluatePromotion({ ...healthy })
    expect(d.promote).toBe(true)
  })

  it('refuses on a single source', () => {
    const d = evaluatePromotion({ ...healthy, support: [twoSources[0]!], strengths: ['ESTABLISHED'] })
    expect(d.promote).toBe(false)
    expect(d.reasons.join(' ')).toContain('independent source')
  })

  it('refuses when all support is AVA\'s own output', () => {
    const d = evaluatePromotion({
      ...healthy,
      support: [
        { id: 'S1', contentOrigin: 'system', lineage },
        { id: 'S2', contentOrigin: 'system', lineage },
      ],
    })
    expect(d.promote).toBe(false)
    expect(d.reasons.join(' ')).toContain('cannot corroborate itself')
  })

  it('refuses when context health is not HEALTHY', () => {
    expect(evaluatePromotion({ ...healthy, contextHealth: 'DEGRADED' }).promote).toBe(false)
  })

  it('refuses on unresolved conflict, missing scope, or weak evidence', () => {
    expect(evaluatePromotion({ ...healthy, materialConflicts: 1 }).promote).toBe(false)
    expect(evaluatePromotion({ ...healthy, scoped: false }).promote).toBe(false)
    expect(evaluatePromotion({ ...healthy, strengths: ['SPECULATIVE', 'ESTABLISHED'] }).promote).toBe(false)
  })

  it('requires ESTABLISHED evidence for a high-risk claim', () => {
    expect(evaluatePromotion({
      ...healthy, strengths: ['SUPPORTED', 'SUPPORTED'], riskOfMisapplication: 'high',
    }).promote).toBe(false)
  })
})
