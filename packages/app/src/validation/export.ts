import {
  VALIDATION_SCHEMA_VERSION, cognitionCorrections, contextHealthRecords, executionModes,
  interventionRecords, modelRunRecords, unraisedChanges,
} from './read-model'
import type { AppContext } from '../context'

/**
 * Validation export (S7-T04).
 *
 * Local, versioned, minimal. It exists so a later analysis does not have to
 * hand-join a dozen tables, and so the shape of the data is pinned: comparing
 * two exports written under different schemas without noticing is exactly the
 * silent error `validation_schema_version` is here to prevent.
 *
 * `validation_schema_version` is NOT a Prospective Validation Protocol
 * version. No protocol exists.
 *
 * Nothing is sent anywhere. The export carries ids, categories, versions,
 * timestamps and explicit missingness — never evidence text, declaration
 * wording or feedback notes.
 */
export interface ValidationExport {
  validationSchemaVersion: string
  generatedAt: string
  workstreamId: string
  /** Counts only. This file states what was observed, never how AVA did. */
  interventions: Awaited<ReturnType<typeof interventionRecords>>
  unraisedChanges: Awaited<ReturnType<typeof unraisedChanges>>
  modelRuns: Awaited<ReturnType<typeof modelRunRecords>>
  executionModes: Awaited<ReturnType<typeof executionModes>>
  contextHealth: Awaited<ReturnType<typeof contextHealthRecords>>
  cognitionChains: Awaited<ReturnType<typeof cognitionCorrections>>
  notes: readonly string[]
}

export const EXPORT_NOTES: readonly string[] = [
  'Observations only. This file contains no conclusion about correctness, usefulness or value.',
  'No validation protocol has been run. No threshold was registered in advance.',
  'user_seen_at is UNOBSERVABLE in this version: there is no client acknowledgement, and '
  + 'delivery is not reading. Timing measured from opportunityShownAt is a lower bound on delay.',
  'A `missing` field names WHY a value is absent. not_observed, not_provided, not_applicable, '
  + 'unknown and unobservable are different facts and must not be merged.',
  'Null token counts mean the provider reported none. They are not zero.',
  'Reported timestamps (evidence_arrived, change_detectable_at, user_action) are assertions by '
  + 'a person about when something happened. System-clock timestamps are AVA observing herself.',
] as const

export async function buildValidationExport(
  ctx: AppContext, workstreamId: string, now: Date = new Date(),
): Promise<ValidationExport> {
  return {
    validationSchemaVersion: VALIDATION_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    workstreamId,
    interventions: await interventionRecords(ctx, workstreamId),
    unraisedChanges: await unraisedChanges(ctx, workstreamId),
    modelRuns: await modelRunRecords(ctx),
    executionModes: await executionModes(ctx, workstreamId),
    contextHealth: await contextHealthRecords(ctx, workstreamId),
    cognitionChains: await cognitionCorrections(ctx),
    notes: EXPORT_NOTES,
  }
}

/** JSONL, one record per line, each tagged with its kind and schema version. */
export function toJsonl(exported: ValidationExport): string {
  const lines: string[] = []
  const push = (kind: string, record: unknown): void => {
    lines.push(JSON.stringify({
      kind,
      validationSchemaVersion: exported.validationSchemaVersion,
      workstreamId: exported.workstreamId,
      record,
    }))
  }
  push('header', {
    generatedAt: exported.generatedAt,
    notes: exported.notes,
    counts: {
      interventions: exported.interventions.length,
      unraisedChanges: exported.unraisedChanges.length,
      modelRuns: exported.modelRuns.length,
      contextHealth: exported.contextHealth.length,
      cognitionChains: exported.cognitionChains.length,
    },
  })
  for (const r of exported.interventions) push('intervention', r)
  for (const r of exported.unraisedChanges) push('unraised_change', r)
  for (const r of exported.modelRuns) push('model_run', r)
  for (const r of exported.executionModes) push('execution_mode', r)
  for (const r of exported.contextHealth) push('context_health', r)
  for (const r of exported.cognitionChains) push('cognition_chain', r)
  return `${lines.join('\n')}\n`
}
