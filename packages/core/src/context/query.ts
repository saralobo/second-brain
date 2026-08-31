/**
 * Request classification (plan §9, spec §13).
 *
 * A small deterministic taxonomy, not an intent ontology. Six kinds cover the
 * questions Slice 3 promises to answer; anything unrecognised falls to
 * `unknown`, which is answered by asking rather than by guessing.
 *
 * Deliberately keyword-based: an LLM classifier here would put a model in
 * front of the retrieval that is supposed to constrain the model.
 */
export type QueryKind =
  | 'intervention'
  | 'personal'
  | 'state'
  | 'change'
  | 'decision'
  | 'unresolved'
  | 'evidence'
  | 'uncertainty'
  | 'unknown'

export interface ClassifiedQuery {
  kind: QueryKind
  /** Terms handed to lexical retrieval, after stopword removal. */
  terms: readonly string[]
  /** Only set when the phrasing itself asks for a historical answer. */
  wantsHistory: boolean
  /** Why this kind was chosen. Auditable, and shown in the Why surface. */
  reason: string
}

const PATTERNS: readonly { kind: QueryKind; re: RegExp; reason: string }[] = [
  // Slice 6. Checked before `personal`, because "which suggestions did I mark
  // valuable?" is a question about AVA's own record of what the user judged,
  // not a question about what the user prefers. Answered entirely from stored
  // feedback, actions and outcomes; no model is involved.
  { kind: 'intervention',
    re: /\b(did i mark|i marked|my feedback|feedback did i give|what happened after)\b/i,
    reason: 'asks about feedback the user gave, or what followed an intervention' },
  { kind: 'intervention',
    re: /\b(opportunit(y|ies)|suggestions?|interventions?)\b[\s\S]*\b(valuable|irrelevant|already kn(own|ew)|unresolved|resolved|outcome|correct)\b/i,
    reason: 'asks about recorded feedback or outcomes for shown opportunities' },
  // Checked next: a question about the person must never be answered by the
  // work-state path, where a preference would be treated as a fact.
  { kind: 'personal',
    re: /\b(my preference|my preferences|about me|told you|do i prefer|i prefer|guessing about me|know about me|my principle|my principles|my criteria|my style|my taste)\b/i,
    reason: 'asks about the user\'s own declared or inferred cognition' },
  { kind: 'evidence', re: /\b(evidence|show me the (evidence|source)|prove|proof|how do you know|source for)\b/i,
    reason: 'asks for the evidence behind a claim' },
  { kind: 'uncertainty', re: /\b(unsure|uncertain|not sure|confiden|don'?t know|doubt)\b/i,
    reason: 'asks what AVA is unsure about' },
  { kind: 'change', re: /\b(chang(e|ed|es)|different|updated|new since|happened since|moved)\b/i,
    reason: 'asks what changed' },
  { kind: 'unresolved', re: /\b(unresolved|open question|still open|pending|outstanding|undecided|blocked)\b/i,
    reason: 'asks what is still open' },
  { kind: 'decision', re: /\b(decisions?|decide[ds]?|deciding|chose|choices?)\b/i,
    reason: 'asks about decisions' },
  { kind: 'state', re: /\b(what do you know|status|current|state|about|tell me)\b/i,
    reason: 'asks for current state' },
]

const HISTORY = /\b(previous|earlier|before|used to|prior|originally|superseded|history)\b/i

const STOPWORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it',
  'know', 'me', 'my', 'of', 'on', 'or', 'project', 'show', 'so', 'still', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'to', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
])

export function extractTerms(question: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rawWord of question.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    const word = rawWord.replace(/^-+|-+$/g, '')
    if (word.length < 2 || STOPWORDS.has(word) || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

/**
 * Words that identify the KIND of question rather than its subject.
 *
 * "What changed in this project?" has no subject terms at all: `changed` is
 * the request type. Searching for it matches nothing, because evidence
 * describes the work, not the shape of questions about the work. Removing
 * them leaves the true subject terms — and when nothing remains, the subject
 * is the workstream itself, which retrieval already scopes to.
 */
const INTENT_WORDS = new Set([
  'change', 'changed', 'changes', 'different', 'updated', 'moved', 'happened', 'since',
  'decision', 'decisions', 'decide', 'decided', 'deciding', 'chose', 'choice', 'choices',
  'unresolved', 'open', 'pending', 'outstanding', 'undecided',
  'evidence', 'source', 'sources', 'prove', 'proof',
  'unsure', 'uncertain', 'confident', 'confidence', 'doubt',
  'status', 'current', 'state', 'tell', 'told', 'guessing', 'preference', 'preferences',
  'previous', 'earlier', 'before', 'prior', 'originally', 'superseded', 'history',
])

export function subjectTerms(question: string): string[] {
  return extractTerms(question).filter((t) => !INTENT_WORDS.has(t))
}

export function classifyQuery(question: string): ClassifiedQuery {
  const terms = subjectTerms(question)
  const wantsHistory = HISTORY.test(question)

  for (const p of PATTERNS) {
    if (p.re.test(question)) {
      return { kind: p.kind, terms, wantsHistory, reason: p.reason }
    }
  }
  return {
    kind: 'unknown',
    terms,
    wantsHistory,
    reason: 'no supported question shape recognised',
  }
}
