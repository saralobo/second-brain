import { ulid } from '../primitives/id'
import type { Relationship } from '../state/types'
import type { ChangeRecord } from '../change/types'

/**
 * Impact is NOT Change (spec §10). Change is an observed delta; Impact is a
 * consequence on other objects.
 *
 * Batch 1 uses simple deterministic relations traversed to a small, explicit
 * depth. There is no Work Graph and no graph technology: relations are rows.
 */
export const DEFAULT_MAX_DEPTH = 2

export interface ImpactedObject {
  objectId: string
  objectType: string
  depth: number
  viaKind: string
  reason: 'potentially_impacted' | 'potentially_outdated'
}

/** Kinds along which impact propagates. Others are recorded but inert. */
const PROPAGATING_KINDS = new Set(['depends_on', 'produces', 'updates', 'affects', 'part_of'])

/**
 * Finds objects potentially impacted by a change.
 *
 * `potentially_` is deliberate: this marks candidates for attention, never
 * asserts that downstream work is actually wrong.
 */
export function propagateImpact(
  change: ChangeRecord,
  relationships: readonly Relationship[],
  maxDepth: number = DEFAULT_MAX_DEPTH,
): ImpactedObject[] {
  const impactful = new Set(['superseded', 'invalidated', 'modified', 'removed', 'status_changed'])
  if (!impactful.has(change.changeType)) return []

  const found = new Map<string, ImpactedObject>()
  let frontier: string[] = [change.objectId]
  const seen = new Set<string>([change.objectId])

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = []
    for (const rel of relationships) {
      if (!PROPAGATING_KINDS.has(rel.kind)) continue
      // An object that depends on the changed one is the impacted side.
      if (!frontier.includes(rel.toId)) continue
      if (seen.has(rel.fromId)) continue
      seen.add(rel.fromId)
      next.push(rel.fromId)
      found.set(rel.fromId, {
        objectId: rel.fromId,
        objectType: rel.fromType,
        depth,
        viaKind: rel.kind,
        reason:
          change.changeType === 'superseded' || change.changeType === 'invalidated'
            ? 'potentially_outdated'
            : 'potentially_impacted',
      })
    }
    if (next.length === 0) break
    frontier = next
  }

  return [...found.values()].sort((a, b) => a.depth - b.depth || (a.objectId < b.objectId ? -1 : 1))
}

/** Records impact on a change as candidate dependencies. */
export function withCandidateDependencies(
  change: ChangeRecord,
  impacted: readonly ImpactedObject[],
): ChangeRecord {
  return { ...change, candidateDependencies: impacted.map((i) => i.objectId) }
}

export function newRelationship(
  fromId: string, fromType: string, toId: string, toType: string,
  kind: Relationship['kind'], evidenceIds: string[],
): Relationship {
  return { id: ulid(), fromId, fromType, toId, toType, kind, evidenceIds }
}
