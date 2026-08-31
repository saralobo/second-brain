import type {
  ArtifactVerdict, DeliveryVerdict, EpistemicVerdict, OutcomeState,
} from './types'

/**
 * A read model, not a scoreboard.
 *
 * This counts what was observed. It does not grade AVA, and nothing here may
 * be presented as a result about the product: a rate computed over a handful
 * of synthetic interventions is a number, not evidence. Validation needs a
 * protocol, a sample and a pre-registered threshold, and Slice 7 audits
 * whether the instrumentation can even support one.
 *
 * `NOT PROVIDED` is counted separately everywhere. Folding it into a negative
 * would manufacture opinions the user never gave.
 */
export interface InterventionCounts {
  shown: number
  withFeedback: number
  withoutFeedback: number
  epistemic: Record<EpistemicVerdict | 'not_provided', number>
  delivery: Record<DeliveryVerdict | 'not_provided', number>
  artifact: Record<ArtifactVerdict | 'not_provided', number>
  outcome: Record<OutcomeState | 'not_recorded', number>
  actionsRecorded: number
  preparedArtifacts: number
}

export const EMPTY_COUNTS: InterventionCounts = {
  shown: 0, withFeedback: 0, withoutFeedback: 0,
  epistemic: { correct: 0, partially_correct: 0, incorrect: 0, not_verifiable: 0, not_provided: 0 },
  delivery: { valuable: 0, already_known: 0, irrelevant: 0, too_early: 0, too_late: 0, not_provided: 0 },
  artifact: {
    used_as_is: 0, used_after_edit: 0, not_used: 0, not_shown: 0,
    expired: 0, replaced: 0, not_provided: 0,
  },
  outcome: { resolved: 0, unresolved: 0, expired: 0, ambiguous: 0, not_recorded: 0 },
  actionsRecorded: 0, preparedArtifacts: 0,
}

/**
 * A denominator that says what it excludes.
 *
 * Rates are returned as `{ numerator, denominator }`, never as a percentage.
 * A percentage over four interventions reads as a finding; two integers read
 * as what they are.
 */
export interface Ratio {
  numerator: number
  denominator: number
  /** What the denominator is, in words. */
  basis: string
}

export function ratio(numerator: number, denominator: number, basis: string): Ratio {
  return { numerator, denominator, basis }
}

export interface DerivedObservations {
  valuable: Ratio
  alreadyKnown: Ratio
  incorrect: Ratio
  tooEarly: Ratio
  tooLate: Ratio
  preparedAndUsed: Ratio
  resolved: Ratio
  unresolved: Ratio
  /** Always present, always the same sentence. */
  caveat: string
}

export const NOT_A_RESULT =
  'Observations only. These counts are not a measure of accuracy or usefulness: '
  + 'no validation protocol has been run, no sample size has been justified, and '
  + 'no threshold was registered in advance.'

export function deriveObservations(c: InterventionCounts): DerivedObservations {
  const withDelivery = c.shown - c.delivery.not_provided
  const withEpistemic = c.shown - c.epistemic.not_provided
  const withOutcome = c.shown - c.outcome.not_recorded
  return {
    valuable: ratio(c.delivery.valuable, withDelivery, 'interventions with a delivery verdict'),
    alreadyKnown: ratio(c.delivery.already_known, withDelivery, 'interventions with a delivery verdict'),
    incorrect: ratio(c.epistemic.incorrect, withEpistemic, 'interventions with an epistemic verdict'),
    tooEarly: ratio(c.delivery.too_early, withDelivery, 'interventions with a delivery verdict'),
    tooLate: ratio(c.delivery.too_late, withDelivery, 'interventions with a delivery verdict'),
    preparedAndUsed: ratio(
      c.artifact.used_as_is + c.artifact.used_after_edit,
      c.preparedArtifacts, 'prepared artifacts'),
    resolved: ratio(c.outcome.resolved, withOutcome, 'interventions with a recorded outcome'),
    unresolved: ratio(c.outcome.unresolved, withOutcome, 'interventions with a recorded outcome'),
    caveat: NOT_A_RESULT,
  }
}
