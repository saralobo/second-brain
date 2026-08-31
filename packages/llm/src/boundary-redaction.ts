/**
 * Provider-boundary redaction.
 *
 * Deliberately separate from `packages/telemetry`'s logging redaction, because
 * the two jobs are opposites:
 *
 *   logging redaction   destroys content — a log must never carry it
 *   boundary redaction  PRESERVES the meaning the task needs, while removing
 *                       identifiers the provider has no reason to receive
 *
 * This is not a general-purpose DLP engine and does not try to be. It covers
 * the V0 minimum, and when a transformation would destroy context the task
 * needs, the correct answer is to not send — not to send something mangled.
 */
export type RedactionKind =
  | 'email'
  | 'phone'
  | 'third_party_name'
  | 'url_credentials'
  | 'long_digit_sequence'

export interface RedactionResult {
  text: string
  applied: RedactionKind[]
  /** True when redaction removed so much that the text may no longer be useful. */
  degraded: boolean
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{4,5}[\s-]?\d{4}/g
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi
const LONG_DIGITS = /\b\d{11,}\b/g

export interface RedactionOptions {
  /**
   * Names of third parties to remove. Supplied by the caller from resolved
   * entities — this module never guesses who is a person.
   */
  thirdPartyNames?: readonly string[]
  /** Below this ratio of surviving text, the result is marked degraded. */
  degradationThreshold?: number
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactForProvider(input: string, options: RedactionOptions = {}): RedactionResult {
  const applied = new Set<RedactionKind>()
  let text = input

  const before = text
  text = text.replace(URL_CREDENTIALS, (_m, scheme: string) => `${scheme}[credentials]@`)
  if (text !== before) applied.add('url_credentials')

  const beforeEmail = text
  text = text.replace(EMAIL, '[email]')
  if (text !== beforeEmail) applied.add('email')

  const beforePhone = text
  text = text.replace(PHONE, '[phone]')
  if (text !== beforePhone) applied.add('phone')

  const beforeDigits = text
  text = text.replace(LONG_DIGITS, '[identifier]')
  if (text !== beforeDigits) applied.add('long_digit_sequence')

  // Third-party names are replaced with stable role placeholders, so the text
  // still reads as being about a specific person without naming them.
  const names = options.thirdPartyNames ?? []
  names.forEach((name, index) => {
    if (name.trim().length < 2) return
    const re = new RegExp(escapeRegExp(name), 'gi')
    if (re.test(text)) {
      text = text.replace(re, `[person ${index + 1}]`)
      applied.add('third_party_name')
    }
  })

  const threshold = options.degradationThreshold ?? 0.5
  const degraded = input.length > 0 && text.replace(/\[[^\]]+\]/g, '').length / input.length < threshold

  return { text, applied: [...applied], degraded }
}

/**
 * Minimization: reduce a set of items to what the task needs.
 *
 * Nothing travels "just in case". The cap is on the number of items and on
 * per-item length; anything dropped is reported so the Context Packet can
 * declare the gap rather than hide it.
 */
export interface MinimizationOptions {
  maxItems: number
  maxCharsPerItem: number
}

export interface MinimizedItem<T> {
  item: T
  text: string
  truncated: boolean
}

export interface MinimizationResult<T> {
  kept: MinimizedItem<T>[]
  droppedCount: number
}

export function minimize<T>(
  items: readonly T[],
  getText: (item: T) => string,
  options: MinimizationOptions,
): MinimizationResult<T> {
  const kept = items.slice(0, options.maxItems).map((item) => {
    const full = getText(item)
    const truncated = full.length > options.maxCharsPerItem
    return {
      item,
      text: truncated ? `${full.slice(0, options.maxCharsPerItem)}…` : full,
      truncated,
    }
  })
  return { kept, droppedCount: Math.max(0, items.length - options.maxItems) }
}
