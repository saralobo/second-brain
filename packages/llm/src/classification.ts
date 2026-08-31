import type { ContentOrigin, Sensitivity } from '@ava/core'

/**
 * Operational data classes for the provider boundary.
 *
 * These are a derived VIEW over fields that already exist — `sensitivity` and
 * `content_origin`. No new vocabulary is introduced, so a class can never
 * drift away from what the database actually records.
 */
export type DataClass = 'CLASS_0' | 'CLASS_1' | 'CLASS_2' | 'CLASS_3'

export type BoundaryRule = 'ALLOWED' | 'ALLOWED_AFTER_MINIMIZATION' | 'CONDITIONAL' | 'DENIED'

export const BOUNDARY_RULES: Record<DataClass, BoundaryRule> = {
  CLASS_0: 'ALLOWED',
  CLASS_1: 'ALLOWED_AFTER_MINIMIZATION',
  CLASS_2: 'CONDITIONAL',
  CLASS_3: 'DENIED',
}

export interface ClassifiableItem {
  contentOrigin: ContentOrigin
  /** MUST be the effective sensitivity, resolved through annotations (F-01). */
  sensitivity: Sensitivity
  synthetic?: boolean
}

/**
 * Classification is evaluated per item, at selection time.
 *
 * Order matters: restricted wins over everything, then third-party origin,
 * then sensitive. One CLASS 3 item does not block a whole answer — it is
 * excluded, and its exclusion is reported as a known gap without revealing
 * what was withheld.
 */
export function classify(item: ClassifiableItem): DataClass {
  if (item.sensitivity === 'restricted') return 'CLASS_3'
  if (item.synthetic === true) return 'CLASS_0'
  if (item.contentOrigin === 'third_party' || item.contentOrigin === 'source_system') return 'CLASS_2'
  if (item.sensitivity === 'sensitive') return 'CLASS_2'
  if (item.contentOrigin === 'user') return 'CLASS_1'
  // `system` origin: AVA's own output. It cannot corroborate anything
  // (baseline §11), so it is never sent as evidence.
  return 'CLASS_3'
}

export function isDenied(cls: DataClass): boolean {
  return BOUNDARY_RULES[cls] === 'DENIED'
}

/** CLASS 2 requires a provider whose policy permits work-context content. */
export function requiresPolicyCheck(cls: DataClass): boolean {
  return BOUNDARY_RULES[cls] === 'CONDITIONAL'
}
