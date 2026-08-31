import { scopeApplies } from './scope'
import type { CognitionContext } from './scope'
import type { BehavioralHypothesis, DeclaredCognition } from './types'

/**
 * Authority order (baseline §20, spec §15.1).
 *
 *   Declared Cognition  →  Confirmed Personal Knowledge  →  Behavioral
 *   Hypotheses  →  Raw Behavioral Observations
 *
 * IMPORTANT: this ladder ranks claims ABOUT THE PERSON only. Factual evidence
 * about the state of the work is not on it and must never be compared against
 * it — "the release moved to October" and "you prefer concise updates" are
 * different kinds of statement, and a single hierarchy that ordered them
 * would let a preference outrank a fact, or the reverse. Work-state facts
 * keep their own ordinal evidence strength.
 */
export type CognitiveAuthority = 'DECLARED' | 'CONFIRMED' | 'HYPOTHESIS' | 'OBSERVATION' | 'NONE'

export const AUTHORITY_ORDER: readonly CognitiveAuthority[] = [
  'DECLARED', 'CONFIRMED', 'HYPOTHESIS', 'OBSERVATION', 'NONE',
] as const

const RANK: Record<CognitiveAuthority, number> = {
  DECLARED: 0, CONFIRMED: 1, HYPOTHESIS: 2, OBSERVATION: 3, NONE: 4,
}

export function outranks(a: CognitiveAuthority, b: CognitiveAuthority): boolean {
  return RANK[a] < RANK[b]
}

export function authorityOf(item: DeclaredCognition | BehavioralHypothesis): CognitiveAuthority {
  if ('cognitionType' in item) {
    if (item.status !== 'active') return 'NONE'
    return item.origin === 'confirmed' ? 'CONFIRMED' : 'DECLARED'
  }
  // A hypothesis never rises above HYPOTHESIS by its own status. Reaching
  // `confirmed` means a DECLARATION was created from it; the declaration
  // carries the authority, and this row keeps the audit trail.
  return item.status === 'contradicted' || item.status === 'expired' ? 'NONE' : 'HYPOTHESIS'
}

export interface ApplicableCognition {
  declaration: DeclaredCognition
  specificity: number
  reason: string
}

/**
 * The declarations that apply to a context, most specific first.
 *
 * Superseded and revoked declarations are excluded here — they remain fully
 * readable through history, but they are not the current position and must
 * never be applied as if they were.
 */
export function applicableDeclarations(
  declarations: readonly DeclaredCognition[],
  ctx: CognitionContext,
): ApplicableCognition[] {
  const out: ApplicableCognition[] = []
  for (const d of declarations) {
    if (d.status !== 'active') continue
    const match = scopeApplies(d.scope, ctx)
    if (!match.applies) continue
    out.push({ declaration: d, specificity: match.specificity, reason: match.reason })
  }
  // Most specific first; ties broken by the more recent declaration.
  out.sort((a, b) =>
    b.specificity - a.specificity ||
    b.declaration.declaredAt.getTime() - a.declaration.declaredAt.getTime())
  return out
}

/** Hypotheses whose observed context matches. Shadow mode is not relaxed here. */
export function applicableHypotheses(
  hypotheses: readonly BehavioralHypothesis[],
  ctx: CognitionContext,
): BehavioralHypothesis[] {
  return hypotheses.filter((h) => {
    if (h.status === 'contradicted' || h.status === 'expired') return false
    return scopeApplies(h.scope, ctx).applies
  })
}

export interface CognitionConflict {
  hypothesisId: string
  declarationId: string
  detail: string
}

export type ConflictResolution = {
  /** Always the declaration when one applies. */
  winner: 'declaration' | 'hypothesis' | 'none'
  authority: CognitiveAuthority
  conflicts: readonly CognitionConflict[]
}

/**
 * Resolves a hypothesis against the declarations covering the same context.
 *
 * The hypothesis NEVER wins and NEVER overwrites. When it disagrees with a
 * declaration the conflict is recorded so the system can ask later — asking
 * is the only legitimate way a declaration changes (baseline §19).
 */
export function resolveCognitionConflict(
  declarations: readonly DeclaredCognition[],
  hypotheses: readonly BehavioralHypothesis[],
  ctx: CognitionContext,
): ConflictResolution {
  const applicable = applicableDeclarations(declarations, ctx)
  const live = applicableHypotheses(hypotheses, ctx)

  if (applicable.length === 0) {
    return {
      winner: live.length > 0 ? 'hypothesis' : 'none',
      authority: live.length > 0 ? 'HYPOTHESIS' : 'NONE',
      conflicts: [],
    }
  }

  const top = applicable[0]!
  const conflicts: CognitionConflict[] = live.map((h) => ({
    hypothesisId: h.id,
    declarationId: top.declaration.id,
    detail: 'an observed pattern covers the same context as an explicit declaration;' +
      ' the declaration stands and the pattern is recorded, not applied',
  }))

  return { winner: 'declaration', authority: authorityOf(top.declaration), conflicts }
}

/**
 * The language contract (Slice 4 brief §20).
 *
 * AVA may say "you prefer X" only when the user said so. When the only basis
 * is an observed pattern, the sentence must name itself as a guess — otherwise
 * the system launders its own inference into the user's own voice, and the
 * user has no way to tell which of their stated preferences they never stated.
 */
export function phraseFor(authority: CognitiveAuthority): {
  mayAssertAsUserPreference: boolean
  template: string
} {
  switch (authority) {
    case 'DECLARED':
      return {
        mayAssertAsUserPreference: true,
        template: 'You explicitly told me {content} applies in {scope}.',
      }
    case 'CONFIRMED':
      return {
        mayAssertAsUserPreference: true,
        template: 'You confirmed that {content} applies in {scope}.',
      }
    case 'HYPOTHESIS':
      return {
        mayAssertAsUserPreference: false,
        template: 'I have a hypothesis that {content} may apply in {scope}. You have not told me this.',
      }
    case 'OBSERVATION':
      return {
        mayAssertAsUserPreference: false,
        template: 'I observed {content} in {scope}. That is an observation, not a preference.',
      }
    case 'NONE':
      return {
        mayAssertAsUserPreference: false,
        template: 'I do not have anything you told me about {scope}.',
      }
  }
}

/** Guard used by the answer path and by tests: catches trait-claim phrasing. */
const PREFERENCE_ASSERTION = /\byou (?:prefer|always|never|like|want|tend to)\b|\byour (?:principle|preference) is\b/i

export function assertsUserPreference(text: string): boolean {
  return PREFERENCE_ASSERTION.test(text)
}
