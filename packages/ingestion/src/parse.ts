import type { RawInput } from './raw'
import type { CaptureInput } from '@ava/core'

/**
 * Plane 2 — PARSE / NORMALIZE. A pure function with no I/O.
 *
 * Normalisation only touches shape: it strips control characters and trims.
 * It never interprets meaning and never follows anything the content asks for.
 */
export interface ParsedInput {
  readonly capture: CaptureInput
  readonly notes: string[]
}

export interface ParseFailure {
  readonly failed: true
  readonly reason: string
}

export type ParseResult = ParsedInput | ParseFailure

export function isParseFailure(r: ParseResult): r is ParseFailure {
  return (r as ParseFailure).failed === true
}

const TAB = 9
const NEWLINE = 10
const CARRIAGE_RETURN = 13
const SPACE = 32
const DELETE = 127

/**
 * True for control characters that carry no meaning in captured text.
 * Tab, newline and carriage return are legitimate and preserved.
 */
function isStrippableControlChar(code: number): boolean {
  if (code === TAB || code === NEWLINE || code === CARRIAGE_RETURN) return false
  return code < SPACE || code === DELETE
}

function normaliseText(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)
    if (code !== undefined && isStrippableControlChar(code)) continue
    out += ch
  }
  return out.trim()
}

export function parse(raw: RawInput, extra: Partial<CaptureInput> = {}): ParseResult {
  const content = normaliseText(raw.rawContent)
  if (content === '') {
    return { failed: true, reason: 'empty content after normalisation' }
  }
  const notes: string[] = []
  if (content.length !== raw.rawContent.trim().length) {
    notes.push('control characters removed during normalisation')
  }
  return {
    capture: {
      type: raw.declaredType ?? '',
      workstreamId: raw.workstreamId ?? '',
      content,
      observedAt: raw.receivedAt,
      ...extra,
    },
    notes,
  }
}
