import type { StateObjectVersion, StateObjectType } from './types'
import { currentVersionAt, supersededVersions } from './supersession'

/**
 * Current State is a PROJECTION, never a second truth (baseline §13).
 * It is rebuilt from the ledger and, if deleted, must reconstruct identically.
 */
export interface CurrentStateEntry {
  objectId: string
  type: StateObjectType
  current: StateObjectVersion
  superseded: StateObjectVersion[]
  contradiction: boolean
}

export interface CurrentStateView {
  at: Date
  workstreamId: string
  entries: CurrentStateEntry[]
}

export interface ProjectInput {
  workstreamId: string
  versions: readonly StateObjectVersion[]
  at?: Date
  /** Object ids flagged as having unresolved contradictions. */
  contradictions?: ReadonlySet<string>
}

/**
 * Builds the current view.
 *
 * Deterministic and pure: same ledger + same `at` yields the same projection,
 * which is what makes the reconstruction test meaningful.
 */
export function projectCurrentState(input: ProjectInput): CurrentStateView {
  const at = input.at ?? new Date()
  const contradictions = input.contradictions ?? new Set<string>()

  const byObject = new Map<string, StateObjectVersion[]>()
  for (const v of input.versions) {
    if (v.workstreamId !== input.workstreamId) continue
    const list = byObject.get(v.objectId)
    if (list) list.push(v)
    else byObject.set(v.objectId, [v])
  }

  const entries: CurrentStateEntry[] = []
  for (const [objectId, versions] of byObject) {
    const current = currentVersionAt(versions, at)
    if (current === null) continue
    entries.push({
      objectId,
      type: current.type,
      current,
      superseded: supersededVersions(versions, at),
      contradiction: contradictions.has(objectId),
    })
  }

  // Stable ordering so two reconstructions compare byte for byte.
  entries.sort((a, b) => (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0))
  return { at, workstreamId: input.workstreamId, entries }
}

/** Objects whose current version is still open, by lifecycle. */
const OPEN_STATUSES: Record<StateObjectType, readonly string[]> = {
  decision: ['proposed'],
  commitment: ['open'],
  question: ['open', 'reopened'],
  risk: ['identified', 'mitigated'],
  artifact: ['draft'],
  goal: ['active'],
}

export function unresolvedEntries(view: CurrentStateView): CurrentStateEntry[] {
  return view.entries.filter((e) => OPEN_STATUSES[e.type].includes(e.current.status))
}

export function conflictingEntries(view: CurrentStateView): CurrentStateEntry[] {
  return view.entries.filter((e) => e.contradiction)
}

/** Evidence supporting each current state, deduplicated per object. */
export function evidenceSupporting(view: CurrentStateView): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of view.entries) out.set(e.objectId, [...new Set(e.current.evidenceIds)])
  return out
}

/**
 * Canonical serialisation used by the reconstruction test. Deliberately omits
 * operational fields: a projection rebuilt later must be identical, and
 * created_at would differ while meaning nothing.
 */
export function canonicalise(view: CurrentStateView): string {
  return JSON.stringify({
    workstreamId: view.workstreamId,
    entries: view.entries.map((e) => ({
      objectId: e.objectId,
      type: e.type,
      version: e.current.version,
      status: e.current.status,
      title: e.current.title,
      fields: e.current.fields,
      evidenceIds: [...e.current.evidenceIds].sort(),
      strength: e.current.strength,
      observedAt: e.current.observedAt.toISOString(),
      effectiveAt: e.current.effectiveAt?.toISOString() ?? null,
      supersededCount: e.superseded.length,
      contradiction: e.contradiction,
    })),
  })
}
