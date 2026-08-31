import { describe, expect, it } from 'vitest'
import {
  MAX_PER_BLOCK, MAX_PER_BRIEFING, POLICY_VERSION, VALUE_VECTOR_FACTORS,
  assembleOpportunity, capBriefing, canTransitionOpportunity, checkAssertiveness,
  detectOpportunities, evaluateGates, evaluateInvestigate, evaluatePrepare, evaluateShow,
  factor, hasCompleteProvenance, identityKeyFor, isMateriallyChanged, noveltyFor,
  selectTopK, unknownFactors,
} from '../index'
import type {
  ChangeRecord, DetectedCondition, OpportunityCandidate, Relationship, StateObjectVersion,
  ValueVector,
} from '../index'

const NOW = new Date('2026-03-10T09:00:00Z')

function version(over: Partial<StateObjectVersion> = {}): StateObjectVersion {
  return {
    id: 'V1', objectId: 'O1', type: 'decision', workstreamId: 'W1', version: 1,
    status: 'made', title: 'Use architecture A', fields: {}, evidenceIds: ['E1'],
    strength: 'ESTABLISHED', sensitivity: 'normal',
    observedAt: new Date('2026-03-01T09:00:00Z'), effectiveAt: null,
    effectiveAtInferred: false, supersededBy: null, ...over,
  }
}

function change(over: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: 'C1', objectId: 'O1', objectType: 'decision', workstreamId: 'W1',
    changeType: 'superseded', beforeVersionRef: 'V1', afterVersionRef: 'V2',
    changedFields: ['status'], observedAt: new Date('2026-03-05T09:00:00Z'),
    effectiveAt: null, effectiveAtInferred: false, evidenceIds: ['E2'],
    strength: 'ESTABLISHED', candidateDependencies: [], contradictionFlag: false,
    contextHealthAtDetection: null, detector: 'stage1_identity', detectorVersion: '1.0.0',
    status: 'accepted', ...over,
  }
}

function relationship(over: Partial<Relationship> = {}): Relationship {
  return {
    id: 'R1', fromId: 'O2', fromType: 'artifact', toId: 'O1', toType: 'decision',
    kind: 'depends_on', evidenceIds: ['E3'], ...over,
  }
}

function condition(over: Partial<DetectedCondition> = {}): DetectedCondition {
  return {
    opportunityClass: 'unpropagated_decision',
    ruleId: 'rule/test', ruleVersion: '1.0.0', workstreamId: 'W1',
    subjectObjectId: 'O1', subjectType: 'decision',
    triggerChangeIds: ['C1'], originEvidenceIds: ['E1'],
    affectedObjects: [{ objectId: 'O2', objectType: 'artifact', relation: 'potentially_outdated', viaKind: 'depends_on', depth: 1 }],
    headline: 'The proposal may need review.',
    detail: 'The decision it depends on changed.',
    minimalAction: 'Check the proposal.',
    strength: 'ESTABLISHED', window: null, actionable: true, ...over,
  }
}

function candidate(over: Partial<Parameters<typeof assembleOpportunity>[0]> = {}): OpportunityCandidate {
  return assembleOpportunity({
    condition: condition(), now: NOW, contextHealth: 'HEALTHY', sensitivity: 'normal',
    evidenceExists: true, applicableDeclarations: [], shadowHypothesisIds: [],
    previouslyShown: false, materiallyChangedSinceShown: false, relatedGoalIds: ['G1'],
    budgetAllowed: true, budgetReason: null, structuredOutputValid: true,
    checkpointId: null, knownEvidenceIds: ['E1'], knownStateVersionIds: ['V1'],
    latestEvidenceObservedAt: NOW, ...over,
  })
}

describe('Value Vector', () => {
  it('has no scalar: no field on the vector is a number', () => {
    const v = candidate().valueVector
    for (const key of VALUE_VECTOR_FACTORS) {
      const value = (v[key] as { value: unknown }).value
      expect(typeof value === 'string' || typeof value === 'boolean').toBe(true)
      expect(typeof value).not.toBe('number')
    }
    // And no aggregate exists to be read by mistake.
    expect(Object.keys(v).sort()).toEqual([...VALUE_VECTOR_FACTORS].sort())
    expect((v as unknown as Record<string, unknown>).score).toBeUndefined()
    expect((v as unknown as Record<string, unknown>).confidence).toBeUndefined()
  })

  it('records the origin and basis of every factor', () => {
    const v = candidate().valueVector
    expect(hasCompleteProvenance(v)).toBe(true)
    for (const key of VALUE_VECTOR_FACTORS) {
      const f = v[key] as { origin: string; basis: string }
      expect(['deterministic', 'declared', 'rule', 'inferred']).toContain(f.origin)
      expect(f.basis.length).toBeGreaterThan(0)
    }
  })

  it('reports unknown factors rather than hiding them', () => {
    const v: ValueVector = {
      ...candidate().valueVector,
      consequence: factor('unknown', 'rule', 'could not be determined'),
    }
    expect(unknownFactors(v)).toContain('consequence')
  })

  it('marks a declared factor as declared and names the declaration', () => {
    const c = candidate({
      applicableDeclarations: [{
        id: 'D1', rootId: 'D1', version: 1, content: 'Never draft anything for me unasked.',
        cognitionType: 'autonomy_limit', scope: {}, audience: null,
        declaredAt: NOW, effectiveAt: null, supersededBy: null, status: 'active',
        origin: 'declared', evidenceIds: ['E9'], confirmsHypothesisId: null,
        workstreamId: 'W1', sensitivity: 'normal', strength: 'ESTABLISHED',
      }],
    })
    expect(c.valueVector.permissionScope.origin).toBe('declared')
    expect(c.valueVector.permissionScope.derivedFrom).toContain('D1')
  })
})

describe('novelty', () => {
  it('never claims already_known without an observation that supports it', () => {
    expect(noveltyFor({ previouslyShown: false, materiallyChangedSinceShown: false }).value).toBe('new')
    expect(noveltyFor({ previouslyShown: true, materiallyChangedSinceShown: true }).value).toBe('new')
    expect(noveltyFor({ previouslyShown: true, materiallyChangedSinceShown: false }).value)
      .toBe('already_known')
  })
})

describe('quality gates', () => {
  const base = {
    evidenceIds: ['E1'], evidenceExists: true, strength: 'ESTABLISHED' as const,
    contextHealth: 'HEALTHY' as const, sensitivity: 'normal' as const,
    permissionBlocked: false, permissionDetail: null,
    window: null, now: NOW, structuredOutputValid: true,
  }

  it('passes when everything is in order, and states a reason even then', () => {
    const report = evaluateGates(base)
    expect(report.passed).toBe(true)
    expect(report.results).toHaveLength(6)
    for (const r of report.results) expect(r.reason.length).toBeGreaterThan(0)
  })

  it('blocks an opportunity with no reachable evidence', () => {
    expect(evaluateGates({ ...base, evidenceIds: [] }).blockedBy).toContain('grounding')
    expect(evaluateGates({ ...base, evidenceExists: false }).blockedBy).toContain('grounding')
  })

  it('never surfaces restricted material proactively', () => {
    expect(evaluateGates({ ...base, sensitivity: 'restricted' }).blockedBy).toContain('security')
  })

  it('blocks a window that has already closed', () => {
    const past = { from: null, until: new Date('2026-03-01T00:00:00Z') }
    expect(evaluateGates({ ...base, window: past }).blockedBy).toContain('temporal_validity')
  })

  it('blocks on INSUFFICIENT context', () => {
    expect(evaluateGates({ ...base, contextHealth: 'INSUFFICIENT' }).blockedBy)
      .toContain('context_health')
  })
})

describe('the three policies', () => {
  const gates = evaluateGates({
    evidenceIds: ['E1'], evidenceExists: true, strength: 'ESTABLISHED',
    contextHealth: 'HEALTHY', sensitivity: 'normal', permissionBlocked: false,
    permissionDetail: null, window: null, now: NOW, structuredOutputValid: true,
  })

  it('records the policy version on every outcome', () => {
    const v = candidate().valueVector
    for (const p of [evaluateInvestigate(v, gates), evaluateShow(v, gates)]) {
      expect(p.version).toBe(POLICY_VERSION)
    }
  })

  it('decides independently: show can pass while prepare fails', () => {
    const v = candidate().valueVector
    const show = evaluateShow(v, gates)
    const prepare = evaluatePrepare({
      vector: v, gates, budgetAllowed: false,
      budgetReason: 'no operational safety cap configured',
      autonomyLimits: [], requiresConfirmation: false,
    })
    expect(show.verdict).toBe('PASS')
    expect(prepare.verdict).toBe('DENIED_BY_BUDGET')
  })

  it('decides independently: investigate can pass while show fails', () => {
    const v: ValueVector = {
      ...candidate().valueVector,
      consequence: factor('low', 'rule', 'nothing is lost by waiting'),
      evidenceStrength: factor('SPECULATIVE', 'deterministic', 'one weak signal'),
      timeSensitivity: factor('later', 'rule', 'no window'),
    }
    expect(evaluateInvestigate(v, gates).verdict).toBe('PASS')
    expect(evaluateShow(v, gates).verdict).toBe('FAIL')
  })

  it('blocks prepare on a declared autonomy limit, whatever the value', () => {
    const outcome = evaluatePrepare({
      vector: candidate().valueVector, gates, budgetAllowed: true, budgetReason: null,
      autonomyLimits: [{ cognitionId: 'D1', content: 'Never draft anything for me unasked.' }],
      requiresConfirmation: false,
    })
    expect(outcome.verdict).toBe('DENIED_BY_PERMISSION')
    expect(outcome.reasons.join(' ')).toContain('Never draft anything')
  })

  it('blocks prepare when context is not HEALTHY', () => {
    const v: ValueVector = {
      ...candidate().valueVector,
      contextHealth: factor('DEGRADED', 'deterministic', 'a source is stale'),
    }
    expect(evaluatePrepare({
      vector: v, gates, budgetAllowed: true, budgetReason: null,
      autonomyLimits: [], requiresConfirmation: false,
    }).verdict).toBe('BLOCKED_BY_HEALTH')
  })

  it('still shows a DEGRADED item, with the gap stated', () => {
    const v: ValueVector = {
      ...candidate().valueVector,
      contextHealth: factor('DEGRADED', 'deterministic', 'a source is stale'),
    }
    const show = evaluateShow(v, gates)
    expect(show.verdict).toBe('PASS')
    expect(show.reasons.join(' ')).toContain('DEGRADED')
  })
})

/**
 * The preparation-bias guard (baseline §18). This is the test the brief asks
 * for by name, and it is checked at the type level as well as behaviourally:
 * `evaluateShow` has no parameter through which preparation status could
 * reach it, so there is no code path for sunk cost to buy attention.
 */
describe('show is independent of prepare', () => {
  it('takes exactly two arguments, neither of which carries preparation status', () => {
    expect(evaluateShow.length).toBe(2)
  })

  it('gives the same verdict before and after the item is prepared', () => {
    const c = candidate()
    const before = evaluateShow(c.valueVector, c.gates)
    // Simulate everything a "prepared" item could carry, then re-run Show.
    const prepared = { ...c, status: 'prepared' as const, preparedAt: NOW, prepare: { ...c.prepare, verdict: 'PASS' as const } }
    const after = evaluateShow(prepared.valueVector, prepared.gates)
    expect(after).toEqual(before)
  })

  it('does not read the prepare factors it has no business reading', () => {
    const c = candidate()
    expect(c.show.factorsRead).not.toContain('preparationCost')
    expect(c.show.factorsRead).not.toContain('effort')
  })
})

describe('identity and deduplication', () => {
  it('gives the same key to the same condition seen twice', () => {
    const args = {
      opportunityClass: 'invalidated_work' as const, workstreamId: 'W1',
      subjectObjectId: 'O1', affectedObjectIds: ['O3', 'O2'],
    }
    expect(identityKeyFor(args)).toBe(identityKeyFor({ ...args, affectedObjectIds: ['O2', 'O3'] }))
  })

  it('treats a second look at the same facts as immaterial', () => {
    const first = candidate()
    expect(isMateriallyChanged(first, {
      triggerChangeIds: first.triggerChangeIds,
      affectedObjects: first.affectedObjects,
      strength: first.strength,
    }).changed).toBe(false)
  })

  it('treats a new triggering change as material', () => {
    const first = candidate()
    const moved = isMateriallyChanged(first, {
      triggerChangeIds: ['C1', 'C2'],
      affectedObjects: first.affectedObjects,
      strength: first.strength,
    })
    expect(moved.changed).toBe(true)
    expect(moved.reasons.join(' ')).toContain('C2')
  })
})

describe('lifecycle', () => {
  it('allows candidate → eligible → shown', () => {
    expect(canTransitionOpportunity('candidate', 'eligible').allowed).toBe(true)
    expect(canTransitionOpportunity('eligible', 'shown').allowed).toBe(true)
  })

  it('never revives a superseded or expired opportunity', () => {
    expect(canTransitionOpportunity('superseded', 'eligible').allowed).toBe(false)
    expect(canTransitionOpportunity('expired', 'shown').allowed).toBe(false)
  })

  it('has no Slice 6 states', () => {
    expect(canTransitionOpportunity('shown', 'accepted' as never).allowed).toBe(false)
  })
})

describe('attention: filters + top-k', () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    ({ ...candidate(), id: `O${i}` }))

  it('keeps at most three per block and says why the rest were held back', () => {
    const result = selectTopK(many, MAX_PER_BLOCK, () => ({ keep: true, reason: 'kept' }))
    expect(result.selected).toHaveLength(3)
    expect(result.heldBack).toHaveLength(5)
    expect(result.heldBack[0]?.reason).toContain('ranked below')
  })

  it('records filtered items with their reason instead of dropping them', () => {
    const result = selectTopK(many, MAX_PER_BLOCK, (c) =>
      c.id === 'O0' ? { keep: false, reason: 'show policy returned FAIL' } : { keep: true, reason: 'ok' })
    expect(result.heldBack.some((h) => h.reason.includes('show policy'))).toBe(true)
  })

  it('caps the whole briefing at ten items across blocks', () => {
    const blocks = [
      { id: 'a', items: [1, 2, 3] }, { id: 'b', items: [4, 5, 6] },
      { id: 'c', items: [7, 8, 9] }, { id: 'd', items: [10, 11, 12] },
    ]
    const capped = capBriefing(blocks, MAX_PER_BRIEFING)
    expect(capped.blocks.reduce((n, b) => n + b.items.length, 0)).toBe(10)
    expect(capped.dropped).toBe(2)
  })
})

describe('proactive language', () => {
  it('accepts the hedged form the evidence supports', () => {
    const check = checkAssertiveness(
      'Proposal may need review because the decision it depends on changed.',
      'ESTABLISHED', 'HEALTHY')
    expect(check.acceptable).toBe(true)
  })

  it('rejects an imperative AVA has no basis for', () => {
    const check = checkAssertiveness('You need to redo Artifact X.', 'ESTABLISHED', 'HEALTHY')
    expect(check.acceptable).toBe(false)
    expect(check.problems.join(' ')).toContain('must do')
  })

  it('rejects a claim of definitive invalidation', () => {
    const check = checkAssertiveness('Artifact X is now invalid.', 'ESTABLISHED', 'HEALTHY')
    expect(check.acceptable).toBe(false)
  })

  it('requires hedging when the evidence is speculative', () => {
    expect(checkAssertiveness('The proposal conflicts with the new decision.',
      'SPECULATIVE', 'HEALTHY').acceptable).toBe(false)
  })

  it('holds for every headline the detection rules produce', () => {
    const conditions = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [version({ status: 'superseded' }), version({ id: 'V2', objectId: 'O2', type: 'artifact', status: 'draft', title: 'Proposal based on architecture A' })],
      changes: [change()], relationships: [relationship()], since: null,
    })
    expect(conditions.length).toBeGreaterThan(0)
    for (const c of conditions) {
      const check = checkAssertiveness(`${c.headline} ${c.detail}`, c.strength, 'HEALTHY')
      expect(check.problems).toEqual([])
    }
  })
})

describe('detection rules', () => {
  const artifact = version({
    id: 'V2', objectId: 'O2', type: 'artifact', status: 'draft',
    title: 'Proposal based on architecture A',
    observedAt: new Date('2026-03-02T09:00:00Z'),
  })

  it('finds an unpropagated decision when the dependent has not caught up', () => {
    const found = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [version({ status: 'superseded' }), artifact],
      changes: [change()], relationships: [relationship()], since: null,
    })
    expect(found.map((f) => f.opportunityClass)).toContain('unpropagated_decision')
  })

  it('stays quiet when the dependent was already revised after the change', () => {
    const found = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [version({ status: 'superseded' }),
        { ...artifact, observedAt: new Date('2026-03-06T09:00:00Z') }],
      changes: [change()], relationships: [relationship()], since: null,
    })
    expect(found.map((f) => f.opportunityClass)).not.toContain('unpropagated_decision')
  })

  it('follows only declared relations — nothing is inferred', () => {
    const found = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [version({ status: 'superseded' }), artifact],
      changes: [change()], relationships: [], since: null,
    })
    expect(found).toHaveLength(0)
  })

  it('does not create urgency from a date alone', () => {
    const commitment = version({
      id: 'V3', objectId: 'O3', type: 'commitment', status: 'open',
      title: 'Present the plan',
      fields: { dueAt: new Date(NOW.getTime() + 86_400_000).toISOString() },
    })
    const withNothingToPrepare = detectOpportunities({
      workstreamId: 'W1', now: NOW, current: [commitment],
      changes: [], relationships: [], since: null,
    })
    expect(withNothingToPrepare).toHaveLength(0)

    const withUnfinishedWork = detectOpportunities({
      workstreamId: 'W1', now: NOW, current: [commitment, artifact],
      changes: [],
      relationships: [relationship({ id: 'R2', fromId: 'O2', toId: 'O3', kind: 'part_of' })],
      since: null,
    })
    expect(withUnfinishedWork.map((f) => f.opportunityClass)).toContain('upcoming_commitment')
  })

  it('does not turn every open question into a notification', () => {
    const question = version({
      id: 'V4', objectId: 'O4', type: 'question', status: 'open',
      title: 'Do users need multi-device sync?',
    })
    const alone = detectOpportunities({
      workstreamId: 'W1', now: NOW, current: [question],
      changes: [], relationships: [], since: null,
    })
    expect(alone).toHaveLength(0)
  })

  it('raises a question only once it becomes relevant', () => {
    const question = version({
      id: 'V4', objectId: 'O4', type: 'question', status: 'open',
      title: 'Do users need multi-device sync?',
    })
    const found = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [question, version({ status: 'superseded' })],
      changes: [change()],
      relationships: [relationship({ id: 'R3', fromId: 'O4', fromType: 'question', toId: 'O1' })],
      since: null,
    })
    expect(found.map((f) => f.opportunityClass)).toContain('unresolved_question')
  })

  it('raises a closing risk only inside its window', () => {
    const near = version({
      id: 'V5', objectId: 'O5', type: 'risk', status: 'identified', title: 'Devices reimaged',
      fields: { mitigationUntil: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() },
    })
    const far = version({
      ...near, fields: { mitigationUntil: new Date(NOW.getTime() + 90 * 86_400_000).toISOString() },
    })
    expect(detectOpportunities({
      workstreamId: 'W1', now: NOW, current: [near], changes: [], relationships: [], since: null,
    }).map((f) => f.opportunityClass)).toContain('closing_risk')
    expect(detectOpportunities({
      workstreamId: 'W1', now: NOW, current: [far], changes: [], relationships: [], since: null,
    })).toHaveLength(0)
  })

  it('distinguishes potential impact from definitive invalidation', () => {
    const found = detectOpportunities({
      workstreamId: 'W1', now: NOW,
      current: [version({ status: 'invalidated' }), artifact],
      changes: [change({ changeType: 'invalidated' })],
      relationships: [relationship()], since: null,
    })
    const invalidated = found.find((f) => f.opportunityClass === 'invalidated_work')
    expect(invalidated).toBeDefined()
    expect(invalidated?.detail).toContain('not a finding that the work is wrong')
  })
})

describe('assembly', () => {
  it('marks the opportunity as system-origin', () => {
    expect(candidate().contentOrigin).toBe('system')
  })

  it('suppresses rather than deletes when a gate blocks', () => {
    const c = candidate({ sensitivity: 'restricted' })
    expect(c.status).toBe('suppressed')
    expect(c.gates.blockedBy).toContain('security')
    // Still fully inspectable.
    expect(c.headline.length).toBeGreaterThan(0)
    expect(c.originEvidenceIds).toEqual(['E1'])
  })

  it('records what was known at generation time', () => {
    const c = candidate()
    expect(c.generation.knownEvidenceIds).toEqual(['E1'])
    expect(c.generation.generatedAt).toEqual(NOW)
  })
})
