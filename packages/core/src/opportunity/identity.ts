import type { OpportunityCandidate, OpportunityClass, OpportunityStatus } from './types'

/**
 * Opportunity identity and deduplication (brief §28).
 *
 * The same unresolved condition observed at two checkpoints is ONE
 * opportunity, not two. Identity is therefore the condition — class,
 * workstream and the objects involved — never the run that noticed it.
 */
export function identityKeyFor(input: {
  opportunityClass: OpportunityClass
  workstreamId: string
  subjectObjectId: string
  affectedObjectIds: readonly string[]
}): string {
  // Deduplicated: the same object reached by two relations is one object,
  // and a key that counted it twice would make identity depend on the path.
  const affected = [...new Set(input.affectedObjectIds)].sort().join(',')
  return `${input.opportunityClass}|${input.workstreamId}|${input.subjectObjectId}|${affected}`
}

/**
 * Whether the condition changed enough to warrant a new version.
 *
 * A new trigger change, a different set of affected objects or a different
 * strength is material. A second look at the same facts is not: re-versioning
 * on every checkpoint would turn history into noise and reset novelty, which
 * is how a system starts spamming.
 */
export function isMateriallyChanged(
  previous: OpportunityCandidate,
  next: Pick<OpportunityCandidate, 'triggerChangeIds' | 'affectedObjects' | 'strength'>,
): { changed: boolean; reasons: string[] } {
  const reasons: string[] = []
  const prevTriggers = new Set(previous.triggerChangeIds)
  const newTriggers = next.triggerChangeIds.filter((t) => !prevTriggers.has(t))
  if (newTriggers.length > 0) reasons.push(`new triggering change: ${newTriggers.join(', ')}`)

  const prevAffected = [...previous.affectedObjects.map((a) => a.objectId)].sort().join(',')
  const nextAffected = [...next.affectedObjects.map((a) => a.objectId)].sort().join(',')
  if (prevAffected !== nextAffected) reasons.push('the set of affected objects changed')

  if (previous.strength !== next.strength) {
    reasons.push(`evidence strength moved from ${previous.strength} to ${next.strength}`)
  }
  return { changed: reasons.length > 0, reasons }
}

/**
 * Terminal states. An opportunity in one of these is history and is never
 * revived in place — a returning condition opens a new version instead.
 */
const TERMINAL: readonly OpportunityStatus[] = ['superseded', 'expired'] as const

export function isTerminal(status: OpportunityStatus): boolean {
  return TERMINAL.includes(status)
}

/**
 * States that still occupy the present. `suppressed` counts as active: the
 * condition is live, AVA simply decided not to say anything about it, and a
 * later checkpoint must not treat it as new.
 */
export function isActive(status: OpportunityStatus): boolean {
  return !isTerminal(status)
}

export type LifecycleTransition = {
  from: OpportunityStatus
  to: OpportunityStatus
  allowed: boolean
  reason: string
}

const ALLOWED: Record<OpportunityStatus, readonly OpportunityStatus[]> = {
  candidate: ['eligible', 'suppressed', 'superseded', 'expired'],
  eligible: ['shown', 'prepared', 'suppressed', 'superseded', 'expired'],
  shown: ['prepared', 'suppressed', 'superseded', 'expired'],
  prepared: ['shown', 'suppressed', 'superseded', 'expired'],
  suppressed: ['eligible', 'superseded', 'expired'],
  superseded: [],
  expired: [],
}

export function canTransitionOpportunity(from: OpportunityStatus, to: OpportunityStatus): LifecycleTransition {
  const allowed = ALLOWED[from].includes(to)
  return {
    from, to, allowed,
    reason: allowed ? `${from} → ${to}` : `${from} → ${to} is not a defined transition`,
  }
}

/**
 * `prepared → shown` is allowed as a state move, but it is NOT a promotion
 * path: reaching `shown` still requires the Show Policy to pass on its own.
 * The transition table records what may happen, not what justifies it.
 */
export const PREPARED_DOES_NOT_IMPLY_SHOWN = true
