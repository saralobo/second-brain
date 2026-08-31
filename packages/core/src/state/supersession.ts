import { isValidSupersession } from '../primitives/time'
import type { StateObjectVersion } from './types'

export type SupersessionResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * A successor version must belong to the same object, come next in sequence,
 * and never be observed before the version it replaces.
 */
export function validateSupersession(
  predecessor: StateObjectVersion,
  successor: StateObjectVersion,
): SupersessionResult {
  if (predecessor.objectId !== successor.objectId) {
    return { ok: false, reason: 'supersession must stay within the same object' }
  }
  if (successor.version !== predecessor.version + 1) {
    return { ok: false, reason: 'successor version must follow the predecessor' }
  }
  if (!isValidSupersession(predecessor.observedAt, successor.observedAt)) {
    return { ok: false, reason: 'successor cannot be observed before its predecessor' }
  }
  return { ok: true }
}

/**
 * Follows a supersession chain to the version current at `at`.
 * Versions observed after `at` are invisible — this is how AVA answers
 * "what did you know at this moment?".
 */
export function currentVersionAt(
  versions: readonly StateObjectVersion[],
  at: Date,
): StateObjectVersion | null {
  const visible = versions
    .filter((v) => v.observedAt.getTime() <= at.getTime())
    .sort((a, b) => a.version - b.version)
  if (visible.length === 0) return null
  const last = visible[visible.length - 1]
  return last ?? null
}

/** Every version that has been replaced, oldest first. */
export function supersededVersions(
  versions: readonly StateObjectVersion[],
  at: Date,
): StateObjectVersion[] {
  const current = currentVersionAt(versions, at)
  if (current === null) return []
  return versions
    .filter((v) => v.observedAt.getTime() <= at.getTime() && v.version < current.version)
    .sort((a, b) => a.version - b.version)
}
