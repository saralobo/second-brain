import type { CognitionScope } from './types'

/**
 * Scope matching (Slice 4 brief §10).
 *
 * The rule this file exists to enforce: a contextual preference must not
 * become a global one. "For benchmarks I prefer visual references" is a
 * statement about benchmarks. Applying it to everything is the single most
 * damaging thing a personal-memory system can do, because the user cannot
 * tell which of their own words the system over-generalised.
 */
export interface CognitionContext {
  workType?: string | null
  workstreamId?: string | null
  activity?: string | null
  decisionCategory?: string | null
  artifactType?: string | null
  at?: Date
}

export type ScopeMatch =
  | { applies: true; specificity: number; reason: string }
  | { applies: false; reason: string }

const DIMENSIONS = ['workType', 'workstreamId', 'activity', 'decisionCategory', 'artifactType'] as const
type Dimension = (typeof DIMENSIONS)[number]

function normalise(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return t === '' ? null : t
}

/**
 * One dimension.
 *
 * A constrained dimension with NO value in the asking context does not match.
 * That is deliberate and conservative: if the user scoped something to
 * strategy work and we do not know what kind of work this is, we do not know
 * that the declaration applies — and guessing is how a scoped preference
 * silently becomes a global one.
 */
function dimensionMatches(
  declared: string | null | undefined,
  asked: string | null | undefined,
): 'unconstrained' | 'match' | 'mismatch' {
  const d = normalise(declared)
  if (d === null) return 'unconstrained'
  const a = normalise(asked)
  if (a === null) return 'mismatch'
  return d === a ? 'match' : 'mismatch'
}

/** True when every constrained dimension of `scope` matches the context. */
function structurallyApplies(scope: CognitionScope, ctx: CognitionContext): {
  ok: boolean
  matched: number
  failedOn: Dimension | null
} {
  let matched = 0
  for (const dim of DIMENSIONS) {
    const verdict = dimensionMatches(scope[dim], ctx[dim])
    if (verdict === 'mismatch') return { ok: false, matched, failedOn: dim }
    if (verdict === 'match') matched += 1
  }
  return { ok: true, matched, failedOn: null }
}

/**
 * Does this declaration apply to the situation being asked about?
 *
 * `specificity` counts the dimensions that actually matched. It orders
 * competing declarations — the narrower statement wins over the broader one,
 * because the user wrote the narrow one to carve out exactly this case.
 * It is a count of constraints, never a confidence score.
 */
export function scopeApplies(scope: CognitionScope, ctx: CognitionContext): ScopeMatch {
  const at = ctx.at ?? new Date()

  if (scope.validFrom && at < scope.validFrom) {
    return { applies: false, reason: `not yet valid; starts ${scope.validFrom.toISOString()}` }
  }
  if (scope.validUntil && at > scope.validUntil) {
    return { applies: false, reason: `expired ${scope.validUntil.toISOString()}` }
  }

  // An exception blocks the declaration wherever it matches. Checked first:
  // a carve-out the user wrote must beat the rule it carves out of.
  for (const exception of scope.exceptions ?? []) {
    const hit = structurallyApplies(exception, ctx)
    if (hit.ok && hit.matched > 0) {
      return { applies: false, reason: 'an explicit exception covers this context' }
    }
  }

  const result = structurallyApplies(scope, ctx)
  if (!result.ok) {
    return { applies: false, reason: `scope constrains ${result.failedOn}, which does not match here` }
  }

  return {
    applies: true,
    specificity: result.matched,
    reason: result.matched === 0
      ? 'declared without scope constraints'
      : `scope matches on ${result.matched} dimension(s)`,
  }
}

/** Human-readable scope, for the UI and the Why surface. */
export function describeScope(scope: CognitionScope): string {
  const parts: string[] = []
  for (const dim of DIMENSIONS) {
    const v = scope[dim]
    if (typeof v === 'string' && v.trim() !== '') parts.push(`${dim}: ${v.trim()}`)
  }
  if (scope.validFrom) parts.push(`from ${scope.validFrom.toISOString().slice(0, 10)}`)
  if (scope.validUntil) parts.push(`until ${scope.validUntil.toISOString().slice(0, 10)}`)
  if ((scope.exceptions ?? []).length > 0) {
    parts.push(`${scope.exceptions!.length} exception(s)`)
  }
  return parts.length === 0 ? 'everywhere (no scope declared)' : parts.join(' · ')
}

/** True when the scope constrains nothing at all. */
export function isGlobalScope(scope: CognitionScope): boolean {
  return DIMENSIONS.every((d) => normalise(scope[d]) === null) &&
    !scope.validFrom && !scope.validUntil && (scope.exceptions ?? []).length === 0
}
