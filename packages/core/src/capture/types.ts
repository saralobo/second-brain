import type { ContentOrigin, Sensitivity } from '../primitives/origin'

/**
 * The ten manual capture types (spec §2.3). Manual capture is a deliberate
 * feature, not a stopgap: it is what makes `observed_at` correct at the source.
 */
export type CaptureType =
  | 'note'
  | 'event'
  | 'decision'
  | 'goal'
  | 'commitment'
  | 'question'
  | 'risk'
  | 'correction'
  | 'preference'
  | 'principle'

export const CAPTURE_TYPES: readonly CaptureType[] = [
  'note', 'event', 'decision', 'goal', 'commitment',
  'question', 'risk', 'correction', 'preference', 'principle',
] as const

export function isCaptureType(v: unknown): v is CaptureType {
  return typeof v === 'string' && (CAPTURE_TYPES as readonly string[]).includes(v)
}

/** Types that produce a State Object in Slice 2. */
export const STATE_PRODUCING_TYPES: readonly CaptureType[] = [
  'decision', 'goal', 'commitment', 'question', 'risk',
] as const

/**
 * Types that belong to Declared Cognition (Slice 4). Captured and stored as
 * evidence now; they gain declared authority when Slice 4 lands.
 */
export const DECLARED_COGNITION_TYPES: readonly CaptureType[] = ['preference', 'principle'] as const

/** A correction never overwrites: it produces a new event and new evidence. */
export const CORRECTION_TYPE: CaptureType = 'correction'

/** Raw, untrusted input as it arrives. Data — never an instruction. */
export interface CaptureInput {
  type: string
  workstreamId: string
  content: string
  title?: string | null
  observedAt?: string | Date | null
  effectiveAt?: string | Date | null
  contentOrigin?: string | null
  sensitivity?: string | null
  /** For `correction`: the state object whose current version is corrected. */
  supersedesStateObjectId?: string | null
  /** Free-form, type-specific. Validated per type, never trusted as-is. */
  fields?: Record<string, unknown> | null
}

/** Validated capture, safe to turn into Evidence. */
export interface ValidatedCapture {
  type: CaptureType
  workstreamId: string
  content: string
  title: string | null
  observedAt: Date
  effectiveAt: Date | null
  effectiveAtInferred: boolean
  contentOrigin: ContentOrigin
  sensitivity: Sensitivity
  supersedesStateObjectId: string | null
  fields: Record<string, unknown>
}
