import type { ContextHealthState } from '../context/health'
import type { EvidenceStrength } from '../primitives/evidence-strength'

/**
 * Proactive language must not outrun the evidence (brief §37).
 *
 * The system knows that a dependency existed and that one end of it changed.
 * It does not know that the dependent work is wrong. "Artifact X may need
 * review because the decision it depends on changed" is what the evidence
 * supports; "You need to redo Artifact X" is a fact AVA does not have.
 *
 * This is enforced, not merely recommended: `overAssertive` fails the golden
 * tests, so a phrasing change cannot quietly upgrade a maybe into a must.
 */
const IMPERATIVE = /\byou (?:need to|must|have to|should)\b|\bredo\b|\brewrite\b/i
const DEFINITIVE = /\b(?:is|are|has been|have been) (?:now )?(?:invalid|wrong|broken|obsolete|out of date)\b/i
const CERTAIN = /\b(?:definitely|certainly|clearly|obviously|proves?|guarantees?)\b/i

export interface AssertivenessCheck {
  acceptable: boolean
  problems: string[]
}

/**
 * Checks a user-facing proactive sentence against what the evidence licenses.
 *
 * `ESTABLISHED` evidence in a `HEALTHY` context still does not license an
 * imperative: knowing that something changed is not knowing what the person
 * should do about it.
 */
export function checkAssertiveness(
  text: string,
  strength: EvidenceStrength,
  health: ContextHealthState,
): AssertivenessCheck {
  const problems: string[] = []
  if (IMPERATIVE.test(text)) {
    problems.push('tells the user what they must do; AVA knows a dependency changed, not what the right response is')
  }
  if (DEFINITIVE.test(text)) {
    problems.push('asserts definitive invalidation where the relation only suggests potential impact')
  }
  if (CERTAIN.test(text)) {
    problems.push('claims certainty that ordinal evidence strength does not carry')
  }
  if (strength === 'SPECULATIVE' && !/\bmay\b|\bmight\b|\bcould\b|\bpossibl/i.test(text)) {
    problems.push('speculative evidence stated without hedging')
  }
  if (health !== 'HEALTHY' && !/\bmay\b|\bmight\b|\bcould\b|\bnot\b/i.test(text)) {
    problems.push(`context is ${health} but the wording carries full assertiveness`)
  }
  return { acceptable: problems.length === 0, problems }
}

/**
 * The qualifier a surface should carry, given what AVA can see. Shown next to
 * the item rather than folded into the sentence, so the hedge is legible as a
 * property of the evidence and not as verbal softening.
 */
export function assertivenessNote(
  strength: EvidenceStrength, health: ContextHealthState,
): string | null {
  if (health === 'INSUFFICIENT') return 'AVA does not have enough context to state this proactively.'
  if (health === 'DEGRADED') return 'Context is incomplete — see the gaps before acting on this.'
  if (strength === 'SPECULATIVE') return 'This rests on speculative evidence and needs confirmation.'
  if (strength === 'SUPPORTED') return 'Supported by evidence that is clear but incomplete.'
  return null
}
