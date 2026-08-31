import { isContentOrigin, isSensitivity } from '../primitives/origin'
import type { ContentOrigin, Sensitivity } from '../primitives/origin'
import { isUlid } from '../primitives/id'
import { CAPTURE_TYPES, isCaptureType } from './types'
import type { CaptureInput, CaptureType, ValidatedCapture } from './types'

export interface FieldIssue {
  field: string
  message: string
}

export type ValidationResult =
  | { ok: true; value: ValidatedCapture }
  | { ok: false; issues: FieldIssue[] }

const MAX_CONTENT = 20_000
const MAX_TITLE = 300
/** Clock tolerance for a capture arriving with its own observed_at. */
const FUTURE_TOLERANCE_MS = 2_000

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string' && v.trim() !== '') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Required per-type fields. Absent types have no extra requirement. */
const REQUIRED_FIELDS: Partial<Record<CaptureType, readonly string[]>> = {
  commitment: ['dueAt'],
  correction: [],
}

/**
 * Structural validation of untrusted capture input.
 *
 * This function is pure and has no access to tools, repositories or state.
 * It decides shape only — it never interprets the content as an instruction.
 */
export function validateCapture(input: CaptureInput, now: Date = new Date()): ValidationResult {
  const issues: FieldIssue[] = []

  if (!isCaptureType(input.type)) {
    issues.push({ field: 'type', message: `type must be one of: ${CAPTURE_TYPES.join(', ')}` })
  }

  if (typeof input.workstreamId !== 'string' || !isUlid(input.workstreamId)) {
    issues.push({ field: 'workstreamId', message: 'workstreamId must be a valid identifier' })
  }

  const content = typeof input.content === 'string' ? input.content.trim() : ''
  if (content === '') {
    issues.push({ field: 'content', message: 'content is required' })
  } else if (content.length > MAX_CONTENT) {
    issues.push({ field: 'content', message: `content exceeds ${MAX_CONTENT} characters` })
  }

  const title = typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : null
  if (title !== null && title.length > MAX_TITLE) {
    issues.push({ field: 'title', message: `title exceeds ${MAX_TITLE} characters` })
  }

  // observed_at: defaults to now. A capture may not claim to have been
  // observed in the future.
  let observedAt = now
  if (input.observedAt != null) {
    const parsed = parseDate(input.observedAt)
    if (parsed === null) {
      issues.push({ field: 'observedAt', message: 'observedAt must be a valid timestamp' })
    } else if (parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      issues.push({ field: 'observedAt', message: 'observedAt cannot be in the future' })
    } else {
      observedAt = parsed
    }
  }

  let effectiveAt: Date | null = null
  if (input.effectiveAt != null) {
    const parsed = parseDate(input.effectiveAt)
    if (parsed === null) {
      issues.push({ field: 'effectiveAt', message: 'effectiveAt must be a valid timestamp' })
    } else {
      effectiveAt = parsed
    }
  }

  let contentOrigin: ContentOrigin = 'user'
  if (input.contentOrigin != null) {
    if (!isContentOrigin(input.contentOrigin)) {
      issues.push({ field: 'contentOrigin', message: 'unknown content origin' })
    } else {
      contentOrigin = input.contentOrigin
    }
  }

  let sensitivity: Sensitivity = 'normal'
  if (input.sensitivity != null) {
    if (!isSensitivity(input.sensitivity)) {
      issues.push({ field: 'sensitivity', message: 'unknown sensitivity' })
    } else {
      sensitivity = input.sensitivity
    }
  }

  const fields = (input.fields && typeof input.fields === 'object') ? { ...input.fields } : {}

  if (isCaptureType(input.type)) {
    for (const required of REQUIRED_FIELDS[input.type] ?? []) {
      if (fields[required] == null || fields[required] === '') {
        issues.push({ field: `fields.${required}`, message: `${required} is required for ${input.type}` })
      }
    }
    if (input.type === 'correction') {
      const target = input.supersedesStateObjectId
      if (typeof target !== 'string' || !isUlid(target)) {
        issues.push({
          field: 'supersedesStateObjectId',
          message: 'a correction must name the state object it corrects',
        })
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      type: input.type as CaptureType,
      workstreamId: input.workstreamId,
      content,
      title,
      observedAt,
      effectiveAt,
      effectiveAtInferred: false,
      contentOrigin,
      sensitivity,
      supersedesStateObjectId: input.supersedesStateObjectId ?? null,
      fields,
    },
  }
}
