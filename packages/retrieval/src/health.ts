import { HEALTH_DIMENSIONS, aggregateHealth } from '@ava/core'
import type {
  ContextHealthResult, HealthDimension, HealthDimensionId, QueryKind, RetrievalResult,
} from '@ava/core'
import type { HealthSignals } from '@ava/db'

/**
 * Context Health dimension assembly (S3-T04).
 *
 * Every dimension is computed from storage signals or from the retrieval
 * result. None of them consults a model — a model cannot report what is
 * absent from its own input, which is exactly what these measure.
 */

/**
 * Which dimensions can decide the aggregate, per question type.
 *
 * Materiality is the whole point of task-specific health: a stale calendar is
 * fatal to "what is on my plate this week" and irrelevant to "what did I
 * decide in March". A single global health number would have to be wrong for
 * one of them.
 */
const MATERIAL: Record<QueryKind, readonly HealthDimensionId[]> = {
  // A personal question turns on what the user actually declared. Retrieval
  // over work evidence is NOT a substitute: behaviour is not a statement of
  // preference, and answering from it would put words in her mouth.
  personal: ['declared_cognition_coverage', 'permission_blocked_coverage', 'unresolved_contradictions'],
  state: ['expected_sources_available', 'permission_blocked_coverage', 'unresolved_contradictions', 'ingestion_success'],
  change: ['expected_sources_available', 'permission_blocked_coverage', 'temporal_coverage', 'unresolved_contradictions'],
  decision: ['expected_sources_available', 'permission_blocked_coverage', 'unresolved_contradictions'],
  unresolved: ['expected_sources_available', 'permission_blocked_coverage', 'unresolved_contradictions'],
  evidence: ['expected_sources_available', 'permission_blocked_coverage', 'lineage_completeness'],
  uncertainty: ['expected_sources_available', 'permission_blocked_coverage'],
  unknown: ['expected_sources_available', 'permission_blocked_coverage'],
}

export interface HealthInput {
  queryKind: QueryKind
  signals: HealthSignals
  retrieved: readonly RetrievalResult[]
  /** Items retrieved locally but withheld from the provider. */
  withheldCount: number
  /** Items withheld that the question specifically needed. */
  withheldMaterial: boolean
  /** Declarations that actually apply to the situation being asked about. */
  declaredCognitionCount: number
  /** Observed patterns covering the same situation. */
  hypothesisCount: number
  /** Freshest evidence AVA holds for this workstream, if any. */
  now: Date
  /**
   * Dimensions material to a task that is not a question (Slice 5).
   *
   * Health is computed PER TASK, and proactive generation is a different task
   * from answering: an outdated artifact is decisive when AVA is about to tell
   * someone their work may be stale, and merely informative when they asked
   * what changed in March. Supplying this replaces the query-kind materiality.
   */
  materialOverride?: readonly HealthDimensionId[]
}

/**
 * Dimensions that decide health for proactive opportunity generation.
 *
 * Two dimensions are deliberately NOT material here, and the reasons matter:
 *
 *  - `expected_sources_available` measures what retrieval returned, and
 *    retrieval does not run on this path. Feeding it an empty result would
 *    report "no sources" for a task that never asked for any.
 *  - `artifacts_without_current_version` counts outdated artifacts, which is
 *    the very condition an `unpropagated_decision` reports. Treating it as a
 *    health gap would make AVA declare herself unfit to raise exactly the
 *    thing she just detected. Found while wiring this path (F-07).
 *
 * What remains are genuine limits on what AVA can see when speaking unasked.
 */
export const OPPORTUNITY_GENERATION_DIMENSIONS: readonly HealthDimensionId[] = [
  'source_freshness',
  'temporal_coverage',
  'unresolved_contradictions',
  'permission_blocked_coverage',
  'lineage_completeness',
] as const

const STALE_DAYS = 45

export function assessHealth(input: HealthInput): ContextHealthResult {
  const { signals, retrieved } = input
  const material = new Set(input.materialOverride ?? MATERIAL[input.queryKind])
  const dims: HealthDimension[] = []

  const add = (
    id: HealthDimensionId,
    verdict: HealthDimension['verdict'],
    detail: string,
  ): void => {
    dims.push({ id, verdict, detail, material: material.has(id) })
  }

  // 1. Expected sources. Nothing retrieved means nothing to answer from —
  //    the single most common route to a fabricated answer.
  if (retrieved.length === 0) {
    add('expected_sources_available', 'insufficient', 'retrieval returned no evidence for this question')
  } else if (signals.sourcesUnavailable > 0) {
    add('expected_sources_available', 'degraded',
      `${signals.sourcesUnavailable} source(s) are unavailable`)
  } else if (signals.sourcesPartial > 0) {
    add('expected_sources_available', 'degraded',
      `${signals.sourcesPartial} source(s) are only partially ingested`)
  } else {
    add('expected_sources_available', 'ok', `${retrieved.length} item(s) retrieved from available sources`)
  }

  // 2. Freshness.
  const newest = signals.newestObservedAt
  if (newest === null) {
    add('source_freshness', 'not_applicable', 'no evidence recorded for this workstream')
  } else {
    const days = (input.now.getTime() - newest.getTime()) / 86_400_000
    add('source_freshness', days > STALE_DAYS ? 'degraded' : 'ok',
      `newest evidence is ${Math.floor(Math.max(0, days))} day(s) old`)
  }

  // 3. Temporal coverage — a single instant cannot describe a change.
  const oldest = signals.oldestObservedAt
  if (oldest === null || newest === null) {
    add('temporal_coverage', 'not_applicable', 'no observation window exists yet')
  } else if (signals.evidenceCount < 2 || oldest.getTime() === newest.getTime()) {
    add('temporal_coverage', 'insufficient',
      'evidence covers a single instant, so no before/after comparison is possible')
  } else {
    const span = Math.floor((newest.getTime() - oldest.getTime()) / 86_400_000)
    add('temporal_coverage', 'ok', `${signals.evidenceCount} observations spanning ${span} day(s)`)
  }

  // 4. Ingestion success.
  add('ingestion_success',
    signals.rejectedInputs > 0 ? 'degraded' : 'ok',
    signals.rejectedInputs > 0
      ? `${signals.rejectedInputs} input(s) were rejected at the quarantine boundary`
      : 'no rejected inputs')

  // 5. Entity resolution. `unresolved` is a legitimate state, never a merge.
  add('entity_resolution_pending',
    signals.unresolvedEntities > 0 ? 'degraded' : 'ok',
    signals.unresolvedEntities > 0
      ? `${signals.unresolvedEntities} entity/entities remain unresolved`
      : 'no pending entity resolution')

  // 6. Artifacts left without a current version.
  add('artifacts_without_current_version',
    signals.outdatedArtifacts > 0 ? 'degraded' : 'ok',
    signals.outdatedArtifacts > 0
      ? `${signals.outdatedArtifacts} artifact(s) are outdated with no current replacement`
      : 'no outdated artifacts')

  // 7. Contradictions. Unresolved conflict does not block every question,
  //    but it always degrades, and it is never silently dropped.
  add('unresolved_contradictions',
    signals.contradictionFlags > 0 ? 'degraded' : 'ok',
    signals.contradictionFlags > 0
      ? `${signals.contradictionFlags} change(s) carry an unresolved contradiction flag`
      : 'no unresolved contradictions')

  // 8. Coverage blocked by permission/classification. Material exclusion is
  //    insufficiency, not a footnote: the answer would omit what was asked for.
  if (input.withheldCount === 0) {
    add('permission_blocked_coverage', 'ok', 'no evidence was withheld from the answer')
  } else if (input.withheldMaterial) {
    add('permission_blocked_coverage', 'insufficient',
      `${input.withheldCount} item(s) central to this question may not be used`)
  } else {
    add('permission_blocked_coverage', 'degraded',
      `${input.withheldCount} item(s) were withheld; the remainder still covers the question`)
  }

  // 9. Parsing/schema failures share the quarantine counter with ingestion,
  //    but are reported separately so the two are never conflated.
  add('parsing_failures',
    signals.rejectedInputs > 0 ? 'degraded' : 'ok',
    signals.rejectedInputs > 0
      ? `${signals.rejectedInputs} item(s) failed parsing or schema validation`
      : 'no parsing or schema failures')

  // 10. Lineage. System-origin evidence without a causal root cannot be
  //     deduplicated, so its independence cannot be verified.
  add('lineage_completeness',
    signals.systemEvidenceWithoutLineage > 0 ? 'degraded' : 'ok',
    signals.systemEvidenceWithoutLineage > 0
      ? `${signals.systemEvidenceWithoutLineage} system-origin item(s) have no lineage root`
      : 'lineage complete for system-origin evidence')

  // 11. Declared cognition coverage (Slice 4).
  //
  // Material only for personal questions. A history of behaviour is NOT
  // coverage: answering "what do I prefer" from observed patterns would put
  // words in the user's mouth, so a hypothesis without a declaration is
  // DEGRADED — enough to say "I have a guess", never enough to assert.
  if (input.declaredCognitionCount > 0) {
    add('declared_cognition_coverage', 'ok',
      `${input.declaredCognitionCount} declaration(s) apply to this context`)
  } else if (input.hypothesisCount > 0) {
    add('declared_cognition_coverage', 'degraded',
      `nothing declared for this context; ${input.hypothesisCount} observed pattern(s) exist, which are guesses`)
  } else {
    add('declared_cognition_coverage', 'insufficient',
      'the user has told AVA nothing that applies to this context')
  }

  // Every declared dimension must be present, so that a missing computation
  // is a loud failure rather than a silently healthy report.
  for (const id of HEALTH_DIMENSIONS) {
    if (!dims.some((d) => d.id === id)) {
      throw new Error(`context health dimension "${id}" was not computed`)
    }
  }

  return aggregateHealth(dims)
}
