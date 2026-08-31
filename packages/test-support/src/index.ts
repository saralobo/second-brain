import { createTestContext } from '@ava/app'
import type { AppContext } from '@ava/app'
import { ulid } from '@ava/core'
import type { StateObjectVersion, StateObjectType, EvidenceStrength } from '@ava/core'

/**
 * Deterministic fixtures and harness.
 *
 * All content here is synthetic and clearly fictional. No real personal or
 * corporate data ever enters fixtures.
 */
export async function withTestContext<T>(fn: (ctx: AppContext) => Promise<T>): Promise<T> {
  const ctx = await createTestContext()
  try {
    return await fn(ctx)
  } finally {
    await ctx.db.close()
  }
}

export interface VersionOverrides {
  objectId?: string
  type?: StateObjectType
  workstreamId?: string
  version?: number
  status?: string
  title?: string
  fields?: Record<string, unknown>
  evidenceIds?: string[]
  strength?: EvidenceStrength
  observedAt?: Date
  effectiveAt?: Date | null
  supersededBy?: string | null
}

/** Builds a state object version in memory, for pure domain tests. */
export function aVersion(overrides: VersionOverrides = {}): StateObjectVersion {
  const observedAt = overrides.observedAt ?? new Date('2026-03-01T10:00:00Z')
  return {
    id: ulid(observedAt.getTime()),
    objectId: overrides.objectId ?? 'OBJ0000000000000000000001',
    type: overrides.type ?? 'decision',
    workstreamId: overrides.workstreamId ?? 'WS00000000000000000000001',
    version: overrides.version ?? 1,
    status: overrides.status ?? 'made',
    title: overrides.title ?? 'Use a local-only store',
    fields: overrides.fields ?? {},
    evidenceIds: overrides.evidenceIds ?? ['EV00000000000000000000001'],
    strength: overrides.strength ?? 'ESTABLISHED',
    sensitivity: 'normal',
    observedAt,
    effectiveAt: overrides.effectiveAt ?? null,
    effectiveAtInferred: false,
    supersededBy: overrides.supersededBy ?? null,
  }
}

export const FIXED_NOW = new Date('2026-03-01T12:00:00Z')
