/**
 * Temporal model (baseline §29, spec §4). Reduced bitemporality:
 *
 *   observed_at   when AVA learned it            — required, drives reasoning
 *   effective_at  when it started being true     — optional, may be inferred
 *   superseded_by successor pointer              — optional
 *
 * `created_at` / `updated_at` are operational only and MUST NOT take part in
 * any reasoning query. That rule is enforced by test, not by discipline:
 * see packages/core/src/state/__tests__ and tests/integration.
 */

/** Fields every temporal object carries. */
export interface TemporalFields {
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  supersededBy: string | null
}

/** Column names that are operational only and never valid for reasoning. */
export const OPERATIONAL_ONLY_FIELDS = ['created_at', 'updated_at', 'createdAt', 'updatedAt'] as const

export function isOperationalOnlyField(name: string): boolean {
  return (OPERATIONAL_ONLY_FIELDS as readonly string[]).includes(name)
}

/**
 * The timestamp used to order and reason about an object: effective_at when
 * known, observed_at otherwise. Never created_at.
 */
export function reasoningTimestamp(t: Pick<TemporalFields, 'observedAt' | 'effectiveAt'>): Date {
  return t.effectiveAt ?? t.observedAt
}

/** "What did AVA know at this moment?" — visibility is decided by observed_at. */
export function wasKnownAt(t: Pick<TemporalFields, 'observedAt'>, at: Date): boolean {
  return t.observedAt.getTime() <= at.getTime()
}

/** A successor may never be observed before the object it supersedes. */
export function isValidSupersession(predecessor: Date, successor: Date): boolean {
  return successor.getTime() >= predecessor.getTime()
}
