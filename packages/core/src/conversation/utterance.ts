/**
 * What is this sentence trying to do? (Interaction Layer I4.)
 *
 * Deterministic and keyword-based, like every other classifier in AVA. A model
 * here would put a model in front of the write path, which is exactly the
 * arrangement the quarantine boundary exists to prevent.
 *
 * The rule that matters: **ambiguity produces a question, never a write.** A
 * wrongly inferred capture writes a false row into an append-only ledger, and
 * the only remedy is a correction that is itself now part of the record. Asking
 * costs one sentence; guessing costs the corpus.
 */
export type UtteranceKind =
  | 'question'
  | 'capture'
  | 'declaration'
  | 'correction'
  | 'decision'
  | 'commitment'
  | 'why'
  | 'ambiguous'

export interface ClassifiedUtterance {
  kind: UtteranceKind
  /** Why this kind was chosen. Shown to the user when confirming. */
  reason: string
  /** True when the sentence implies the past and `observedAt` must be asked. */
  impliesPast: boolean
  /** The content to record, with the leading command stripped. */
  payload: string
  /** Whether a write follows, and therefore whether confirmation is required. */
  writes: boolean
}

const WHY = /^\s*(why|show me why|show the evidence|show me the evidence|what'?s the evidence)\b/i

/**
 * Interrogatives, plus the imperative verbs that ask for something without a
 * question mark. "Compare the decisions" is a question; leaving it ambiguous
 * made AVA ask what was meant when it was perfectly clear.
 */
const QUESTION = /^\s*(what|which|who|when|where|how|is|are|do|does|did|can|could|should|tell me|show me|list|compare|summari[sz]e|explain|describe|find)\b/i

/** Explicit record commands. These are unambiguous by construction. */
const DECISION = /\b(record|register|log|note)\b[^.]*\bdecision\b|\bi decided\b|\bwe decided\b|\bdecided (?:to|on)\b|\bgo(?:ing)? with option\b/i
const COMMITMENT = /\bi (?:need to|have to|must)\b|\bdue (?:on|by)\b|\bcommit(?:ted)? to\b|\bi'?ll present\b|\bdeadline\b/i
const CORRECTION = /^\s*(correction|actually|no,|no —|scratch that)\b|\bthat'?s wrong\b|\bi mis(?:spoke|stated)\b|\bit was actually\b/i
const DECLARATION = /\b(remember that|for the record)\b.*\bi (?:prefer|always|never|like)\b|\bi prefer\b|\bmy principle is\b|\bnever (?:draft|do) .* (?:without|unless)\b/i
const CAPTURE = /^\s*(record|register|log|note|capture)\b|\bwe (?:changed|moved|shipped|agreed)\b|\bhas been (?:changed|moved)\b/i

/** Words that place the event before now. */
const PAST = /\b(yesterday|last (?:week|month|night|friday|monday|tuesday|wednesday|thursday|saturday|sunday)|earlier|this morning|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|a few days ago|ago)\b/i

const COMMAND_PREFIX = /^\s*(ava[,:]?\s*)?(please\s+)?(record|register|log|note|capture|remember)( that)?\s*/i

export function classifyUtterance(text: string): ClassifiedUtterance {
  const raw = text.trim()
  if (raw === '') {
    return {
      kind: 'ambiguous', reason: 'nothing was said', impliesPast: false,
      payload: '', writes: false,
    }
  }

  const impliesPast = PAST.test(raw)
  const payload = raw.replace(COMMAND_PREFIX, '').trim()

  if (WHY.test(raw)) {
    return { kind: 'why', reason: 'asks for the evidence behind an answer', impliesPast, payload: raw, writes: false }
  }

  // Correction is checked before everything else it could look like: "No —
  // it was Thursday" is a correction, not a new capture, and treating it as
  // one would leave two contradictory rows instead of a chain.
  if (CORRECTION.test(raw)) {
    return { kind: 'correction', reason: 'corrects something recorded earlier', impliesPast, payload, writes: true }
  }
  if (DECLARATION.test(raw)) {
    return { kind: 'declaration', reason: 'states a preference or principle about how the user works', impliesPast, payload, writes: true }
  }
  if (DECISION.test(raw)) {
    return { kind: 'decision', reason: 'records a decision that was made', impliesPast, payload, writes: true }
  }
  if (COMMITMENT.test(raw)) {
    return { kind: 'commitment', reason: 'records something the user committed to', impliesPast, payload, writes: true }
  }
  if (CAPTURE.test(raw)) {
    return { kind: 'capture', reason: 'reports something that happened', impliesPast, payload, writes: true }
  }
  if (QUESTION.test(raw) || raw.endsWith('?')) {
    return { kind: 'question', reason: 'asks AVA something', impliesPast, payload: raw, writes: false }
  }

  // Everything else. A statement that is neither clearly a question nor
  // clearly a record command is exactly the case where guessing is expensive.
  return {
    kind: 'ambiguous',
    reason: 'could be a question or something to record, and AVA cannot tell which',
    impliesPast, payload, writes: false,
  }
}

/**
 * The sentence AVA says back before writing anything.
 *
 * Specific on purpose. "Got it" cannot be checked; "I'll register a decision:
 * use option B, effective today" can be, and a mis-transcription is caught
 * before it enters the ledger rather than after.
 */
export function confirmationFor(u: ClassifiedUtterance, when: string): string {
  const subject = u.payload.replace(/\.$/, '')
  switch (u.kind) {
    case 'decision':
      return `I'll register a decision: ${subject}, ${when}. Confirm?`
    case 'commitment':
      return `I'll register a commitment: ${subject}, ${when}. Confirm?`
    case 'declaration':
      return `I'll record this as something you told me about how you work: ${subject}. Confirm?`
    case 'correction':
      return `I'll record a correction: ${subject}. The earlier version stays readable. Confirm?`
    case 'capture':
      return `I'll record: ${subject}, ${when}. Confirm?`
    default:
      return `I'm not sure whether that was a question or something to record. Which did you mean?`
  }
}

/** The question AVA asks when the sentence places the event before now. */
export const WHEN_QUESTION = 'When did that happen?'
