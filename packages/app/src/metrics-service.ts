import { EMPTY_COUNTS, deriveObservations, projectFeedback } from '@ava/core'
import type { DerivedObservations, InterventionCounts } from '@ava/core'
import type { AppContext } from './context'

/**
 * The metrics read model (S6-T05, brief §26).
 *
 * A read model, not a dashboard and not a verdict. It counts what was
 * observed and hands the counts back with the caveat attached.
 *
 * Nothing here is consumed by a policy. Nothing here is displayed as
 * "AVA is N% accurate": that sentence needs a protocol, a justified sample and
 * a threshold registered before the data was seen, and Slice 7 is where the
 * instrumentation gets audited for whether it could even support one.
 */
export interface MetricsReport {
  workstreamId: string
  counts: InterventionCounts
  observations: DerivedObservations
  computedAt: Date
}

export async function interventionMetrics(
  ctx: AppContext, workstreamId: string,
): Promise<MetricsReport> {
  const counts: InterventionCounts = {
    ...EMPTY_COUNTS,
    epistemic: { ...EMPTY_COUNTS.epistemic },
    delivery: { ...EMPTY_COUNTS.delivery },
    artifact: { ...EMPTY_COUNTS.artifact },
    outcome: { ...EMPTY_COUNTS.outcome },
  }

  const opportunities = await ctx.opportunities.listByWorkstream(workstreamId, [], 500)
  const shown = opportunities.filter((o) => o.shownAt !== null)
  counts.shown = shown.length

  const allFeedback = await ctx.feedback.listByWorkstream(workstreamId)
  const byOpportunity = new Map<string, typeof allFeedback>()
  for (const row of allFeedback) {
    const key = row.opportunityId ?? row.targetId
    byOpportunity.set(key, [...(byOpportunity.get(key) ?? []), row])
  }

  for (const opportunity of shown) {
    const current = projectFeedback(byOpportunity.get(opportunity.id) ?? [])
    if (current.hasAny) counts.withFeedback += 1
    else counts.withoutFeedback += 1

    // A blank dimension is counted as `not_provided`, never as a negative.
    counts.epistemic[current.epistemic ?? 'not_provided'] += 1
    counts.delivery[current.delivery ?? 'not_provided'] += 1
    counts.artifact[current.artifact ?? 'not_provided'] += 1
  }

  const outcomes = await ctx.outcomes.listByWorkstream(workstreamId)
  const live = new Map<string, string>()
  for (const o of outcomes) {
    if (o.supersededByOutcomeId === null && o.opportunityId !== null) {
      live.set(o.opportunityId, o.state)
    }
  }
  for (const opportunity of shown) {
    const state = live.get(opportunity.id)
    if (state === undefined) counts.outcome.not_recorded += 1
    else counts.outcome[state as keyof typeof counts.outcome] += 1
  }

  const actions = await ctx.db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM user_action a
     JOIN opportunity o ON o.id = a.opportunity_id
     WHERE o.workstream_id = $1 AND a.kind <> 'unknown'`,
    [workstreamId],
  )
  counts.actionsRecorded = Number(actions.rows[0]?.n ?? '0')
  counts.preparedArtifacts = (await ctx.prepared.listAvailable(workstreamId)).length

  return {
    workstreamId,
    counts,
    observations: deriveObservations(counts),
    computedAt: new Date(),
  }
}
