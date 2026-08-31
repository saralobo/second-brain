import { validateCapture } from '@ava/core'
import type { FieldIssue, ValidatedCapture } from '@ava/core'
import type { ParsedInput } from './parse'

/**
 * Plane 3 — ACCEPTED STRUCTURED OBJECTS.
 *
 * The only route from untrusted text to the privileged plane. Everything that
 * crosses here has passed structural validation.
 *
 * Note what this module does NOT import: no repository, no database, no model
 * provider. It decides acceptance; the caller performs the write. That keeps
 * the quarantine boundary a property of the module graph rather than of good
 * intentions, and scripts/lint-boundaries.mjs enforces it.
 */
export interface Accepted {
  readonly accepted: true
  readonly capture: ValidatedCapture
  readonly notes: string[]
}

export interface Rejected {
  readonly accepted: false
  readonly issues: FieldIssue[]
  readonly notes: string[]
}

export type AcceptResult = Accepted | Rejected

export function accept(parsed: ParsedInput, now: Date = new Date()): AcceptResult {
  const result = validateCapture(parsed.capture, now)
  if (!result.ok) {
    // Rejected input is kept by the caller, never silently discarded.
    return { accepted: false, issues: result.issues, notes: parsed.notes }
  }
  return { accepted: true, capture: result.value, notes: parsed.notes }
}
