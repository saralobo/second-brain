import { describe, expect, it } from 'vitest'
import { aVersion } from '@ava/test-support'
import { canTransition, isValidStatus, LIFECYCLES } from '../state/types'
import { currentVersionAt, supersededVersions, validateSupersession } from '../state/supersession'
import { canonicalise, projectCurrentState, unresolvedEntries } from '../state/projector'
import { detectChange } from '../change/detect'
import { CHANGE_TYPES } from '../change/types'
import { propagateImpact, newRelationship } from '../impact/propagate'

const T0 = new Date('2026-03-01T10:00:00Z')
const T1 = new Date('2026-03-05T10:00:00Z')
const T2 = new Date('2026-03-09T10:00:00Z')
const LATER = new Date('2026-04-01T00:00:00Z')

describe('lifecycles', () => {
  it('defines a lifecycle for every state object type', () => {
    for (const [type, statuses] of Object.entries(LIFECYCLES)) {
      expect(statuses.length, type).toBeGreaterThan(1)
    }
  })

  it('accepts valid transitions and rejects invalid ones', () => {
    expect(canTransition('decision', 'made', 'superseded')).toBe(true)
    expect(canTransition('decision', 'superseded', 'made')).toBe(false)
    expect(canTransition('commitment', 'open', 'met')).toBe(true)
    expect(canTransition('commitment', 'met', 'open')).toBe(false)
    expect(canTransition('question', 'answered', 'reopened')).toBe(true)
    expect(isValidStatus('risk', 'materialized')).toBe(true)
    expect(isValidStatus('risk', 'nonsense')).toBe(false)
  })
})

describe('supersession', () => {
  it('requires the successor to follow in sequence and in time', () => {
    const v1 = aVersion({ version: 1, observedAt: T0 })
    const v2 = aVersion({ version: 2, observedAt: T1 })
    expect(validateSupersession(v1, v2).ok).toBe(true)

    const backwards = aVersion({ version: 2, observedAt: new Date('2026-02-01T00:00:00Z') })
    expect(validateSupersession(v1, backwards).ok).toBe(false)

    const skipped = aVersion({ version: 3, observedAt: T1 })
    expect(validateSupersession(v1, skipped).ok).toBe(false)

    const otherObject = aVersion({ objectId: 'OTHER', version: 2, observedAt: T1 })
    expect(validateSupersession(v1, otherObject).ok).toBe(false)
  })

  it('keeps superseded versions reachable rather than deleting them', () => {
    const versions = [
      aVersion({ version: 1, observedAt: T0, title: 'local only' }),
      aVersion({ version: 2, observedAt: T1, title: 'encrypted sync' }),
    ]
    expect(currentVersionAt(versions, LATER)?.title).toBe('encrypted sync')
    const old = supersededVersions(versions, LATER)
    expect(old).toHaveLength(1)
    expect(old[0]?.title).toBe('local only')
  })

  it('answers what was current at an earlier moment', () => {
    const versions = [
      aVersion({ version: 1, observedAt: T0, title: 'local only' }),
      aVersion({ version: 2, observedAt: T2, title: 'encrypted sync' }),
    ]
    expect(currentVersionAt(versions, T1)?.title).toBe('local only')
    expect(supersededVersions(versions, T1)).toHaveLength(0)
  })
})

describe('current state projection', () => {
  const versions = [
    aVersion({ objectId: 'A', version: 1, observedAt: T0, title: 'decision one' }),
    aVersion({ objectId: 'A', version: 2, observedAt: T1, title: 'decision one revised' }),
    aVersion({ objectId: 'B', type: 'question', status: 'open', observedAt: T0, title: 'open question' }),
  ]

  it('projects one current entry per object', () => {
    const view = projectCurrentState({ workstreamId: 'WS00000000000000000000001', versions, at: LATER })
    expect(view.entries).toHaveLength(2)
    const a = view.entries.find((e) => e.objectId === 'A')
    expect(a?.current.title).toBe('decision one revised')
    expect(a?.superseded).toHaveLength(1)
  })

  it('is deterministic: the same ledger yields an identical projection', () => {
    const one = projectCurrentState({ workstreamId: 'WS00000000000000000000001', versions, at: LATER })
    const shuffled = [...versions].reverse()
    const two = projectCurrentState({ workstreamId: 'WS00000000000000000000001', versions: shuffled, at: LATER })
    expect(canonicalise(one)).toBe(canonicalise(two))
  })

  it('reports what is still unresolved', () => {
    const view = projectCurrentState({ workstreamId: 'WS00000000000000000000001', versions, at: LATER })
    expect(unresolvedEntries(view).map((e) => e.objectId)).toEqual(['B'])
  })
})

describe('deterministic change detection', () => {
  it('exposes exactly the nine change types', () => {
    expect(CHANGE_TYPES).toEqual([
      'created', 'modified', 'removed', 'status_changed', 'superseded',
      'invalidated', 'dependency_impacted', 'not_propagated', 'unknown_change',
    ])
  })

  it('detects creation when there is no previous version', () => {
    const c = detectChange(null, aVersion(), ['EV1'], ['ESTABLISHED'])
    expect(c?.changeType).toBe('created')
    expect(c?.detector).toBe('stage1_identity')
    expect(c?.beforeVersionRef).toBeNull()
  })

  it('detects supersession through the pointer, not through content', () => {
    const v2 = aVersion({ version: 2, observedAt: T1 })
    const v1 = aVersion({ version: 1, observedAt: T0, supersededBy: v2.id })
    const c = detectChange(v1, v2, ['EV2'], ['ESTABLISHED'])
    expect(c?.changeType).toBe('superseded')
    expect(c?.detector).toBe('stage3_rules')
  })

  it('detects status change, invalidation and removal by rule', () => {
    const before = aVersion({ status: 'made' })
    const invalidated = aVersion({ version: 2, status: 'invalidated', observedAt: T1 })
    expect(detectChange(before, invalidated, [], ['ESTABLISHED'])?.changeType).toBe('invalidated')

    const q1 = aVersion({ type: 'question', status: 'open' })
    const q2 = aVersion({ type: 'question', status: 'answered', version: 2, observedAt: T1 })
    expect(detectChange(q1, q2, [], ['ESTABLISHED'])?.changeType).toBe('status_changed')

    const c1 = aVersion({ type: 'commitment', status: 'open' })
    const c2 = aVersion({ type: 'commitment', status: 'cancelled', version: 2, observedAt: T1 })
    expect(detectChange(c1, c2, [], ['ESTABLISHED'])?.changeType).toBe('removed')
  })

  it('detects structured field modification before falling back to text', () => {
    const before = aVersion({ fields: { owner: 'sara' } })
    const after = aVersion({ version: 2, observedAt: T1, fields: { owner: 'alex' } })
    const c = detectChange(before, after, [], ['ESTABLISHED'])
    expect(c?.changeType).toBe('modified')
    expect(c?.detector).toBe('stage2_structured')
    expect(c?.changedFields).toContain('fields.owner')
  })

  it('uses lexical diff only when structured comparison finds nothing', () => {
    const before = aVersion({ title: 'store locally' })
    const after = aVersion({ version: 2, observedAt: T1, title: 'store locally, encrypted' })
    const c = detectChange(before, after, [], ['ESTABLISHED'])
    expect(c?.detector).toBe('stage4_lexical')
    expect(c?.changedFields).toEqual(['title'])
  })

  it('returns null when nothing changed', () => {
    const v = aVersion()
    expect(detectChange(v, v, [], ['ESTABLISHED'])).toBeNull()
  })

  it('abstains instead of deciding when impact is high and evidence weak', () => {
    const before = aVersion({ fields: { owner: 'sara' } })
    const after = aVersion({ version: 2, observedAt: T1, fields: { owner: 'alex' }, strength: 'SPECULATIVE' })
    const c = detectChange(before, after, [], ['SPECULATIVE'], {
      highImpactObjectIds: new Set([after.objectId]),
    })
    expect(c?.changeType).toBe('unknown_change')
    expect(c?.detector).toBe('stage6_abstained')
    expect(c?.status).toBe('candidate')
  })

  it('never reaches the semantic stage: no model participates', () => {
    const before = aVersion({ title: 'a' })
    const after = aVersion({ version: 2, observedAt: T1, title: 'b' })
    const c = detectChange(before, after, [], ['ESTABLISHED'])
    expect(c?.detector).not.toBe('stage5_semantic')
  })

  it('records before and after as references, never as content copies', () => {
    const before = aVersion({ title: 'confidential wording' })
    const after = aVersion({ version: 2, observedAt: T1, title: 'revised wording' })
    const c = detectChange(before, after, [], ['ESTABLISHED'])
    const serialised = JSON.stringify(c)
    expect(serialised).not.toContain('confidential wording')
    expect(c?.beforeVersionRef).toBe(before.id)
    expect(c?.afterVersionRef).toBe(after.id)
  })
})

describe('impact propagation', () => {
  it('marks a dependent object as potentially outdated, without a graph', () => {
    const v2 = aVersion({ objectId: 'DEC', version: 2, observedAt: T1 })
    const v1 = aVersion({ objectId: 'DEC', version: 1, observedAt: T0, supersededBy: v2.id })
    const change = detectChange(v1, v2, ['EV'], ['ESTABLISHED'])
    const rels = [newRelationship('ART', 'artifact', 'DEC', 'decision', 'depends_on', ['EV'])]
    const impacted = propagateImpact(change!, rels)
    expect(impacted).toHaveLength(1)
    expect(impacted[0]?.objectId).toBe('ART')
    expect(impacted[0]?.reason).toBe('potentially_outdated')
    expect(impacted[0]?.depth).toBe(1)
  })

  it('stops at the configured depth instead of inferring a deep chain', () => {
    const v2 = aVersion({ objectId: 'A', version: 2, observedAt: T1 })
    const v1 = aVersion({ objectId: 'A', version: 1, observedAt: T0, supersededBy: v2.id })
    const change = detectChange(v1, v2, [], ['ESTABLISHED'])
    const rels = [
      newRelationship('B', 'artifact', 'A', 'decision', 'depends_on', []),
      newRelationship('C', 'artifact', 'B', 'artifact', 'depends_on', []),
      newRelationship('D', 'artifact', 'C', 'artifact', 'depends_on', []),
    ]
    expect(propagateImpact(change!, rels, 2).map((i) => i.objectId)).toEqual(['B', 'C'])
    expect(propagateImpact(change!, rels, 1).map((i) => i.objectId)).toEqual(['B'])
  })

  it('does not propagate from a plain creation', () => {
    const change = detectChange(null, aVersion({ objectId: 'A' }), [], ['ESTABLISHED'])
    const rels = [newRelationship('B', 'artifact', 'A', 'decision', 'depends_on', [])]
    expect(propagateImpact(change!, rels)).toEqual([])
  })
})
