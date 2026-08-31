import { assessHypothesis } from '@ava/core'
import type {
  AdmissibilityResult, BehavioralHypothesis, CognitionScope, ContentOrigin,
} from '@ava/core'
import type { AppContext } from './context'

/**
 * Behavioral Hypothesis formation (S4-T07, S4-T08).
 *
 * Deliberately rule-based rather than model-driven. Every input is an explicit
 * observation the system already recorded, and admissibility is decided by
 * `assessHypothesis` in core — so "AVA never invents a preference" is a
 * property of the code path, not a prompt instruction a model may ignore.
 *
 * A hypothesis that is formed still governs nothing. It is shadow mode by
 * schema constraint, it cannot outrank a declaration, and it never becomes a
 * principle without the user saying so.
 */
export interface ProposeHypothesisRequest {
  falsifiableDescription: string
  context: string
  scope?: CognitionScope
  evidenceIds: readonly string[]
  alternativesAvailable: readonly string[]
  possibleConfounder?: string | null
  costOfMisapplication?: 'low' | 'medium' | 'high'
  workstreamId?: string | null
  /** Set by the caller when the behaviour observed belongs to someone else. */
  aboutThirdParty?: boolean
}

export type ProposeOutcome =
  | { formed: true; hypothesis: BehavioralHypothesis }
  | { formed: false; assessment: AdmissibilityResult }

export async function proposeHypothesis(
  ctx: AppContext, req: ProposeHypothesisRequest,
): Promise<ProposeOutcome> {
  const evidence = await ctx.evidence.findByIds(req.evidenceIds)
  const origins: ContentOrigin[] = evidence.map((e) => e.contentOrigin)

  // Subjects the user placed out of bounds. Read at formation time, so a
  // later `never_infer_subject` declaration takes effect immediately.
  const neverInfer = await ctx.cognition.neverInferSubjects()

  const assessment = assessHypothesis({
    falsifiableDescription: req.falsifiableDescription,
    context: req.context,
    evidenceOrigins: origins,
    alternativesAvailable: req.alternativesAvailable,
    neverInferSubjects: neverInfer,
    // Third-party evidence is treated as third-party subject matter unless
    // the caller says otherwise: AVA does not profile other people.
    aboutThirdParty: req.aboutThirdParty ?? origins.includes('third_party'),
  })

  if (!assessment.admissible) return { formed: false, assessment }

  const hypothesis = await ctx.hypotheses.create({
    falsifiableDescription: req.falsifiableDescription,
    context: req.context,
    scope: req.scope ?? {},
    evidenceIds: req.evidenceIds,
    alternativesAvailable: req.alternativesAvailable,
    possibleConfounder: req.possibleConfounder ?? null,
    costOfMisapplication: req.costOfMisapplication ?? 'low',
    workstreamId: req.workstreamId ?? null,
    confirmationOpportunitiesObserved: evidence.length,
  })

  await ctx.telemetry.record({
    eventType: 'hypothesis_created', occurredAt: new Date(),
    subjectType: 'behavioral_hypothesis', subjectId: hypothesis.id,
    workstreamId: req.workstreamId ?? null, evidenceStrength: 'SPECULATIVE',
    payload: {
      evidenceCount: req.evidenceIds.length,
      alternatives: req.alternativesAvailable.length,
    },
  })

  return { formed: true, hypothesis }
}
