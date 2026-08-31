import { currentOutcome, projectFeedback } from '@ava/core'
import type { AppContext } from './context'

/**
 * Answering questions about AVA's own record of what happened (brief §34).
 *
 * These are read back from stored rows and rendered deterministically. No
 * model participates, and nothing is inferred: the answer says what was
 * recorded, and where nothing was recorded it says that instead.
 *
 * In particular it never asserts causality. "You marked this valuable and
 * later reviewed the proposal" is two recorded facts in sequence; "AVA's
 * suggestion caused you to review the proposal" is a claim nobody made.
 */
export type InterventionQuestion =
  | 'valuable' | 'correct_but_already_known' | 'unresolved' | 'what_happened' | 'summary'

const PATTERNS: readonly { kind: InterventionQuestion; re: RegExp }[] = [
  { kind: 'correct_but_already_known', re: /\balready (known|knew)\b/i },
  { kind: 'unresolved', re: /\b(unresolved|still open|not resolved)\b/i },
  { kind: 'what_happened', re: /\bwhat happened\b/i },
  { kind: 'valuable', re: /\bvaluable\b/i },
]

export function classifyInterventionQuestion(question: string): InterventionQuestion {
  for (const p of PATTERNS) if (p.re.test(question)) return p.kind
  return 'summary'
}

export interface InterventionAnswer {
  answer: string
  /** Opportunity ids the answer is built from, so Why can list them. */
  opportunityIds: readonly string[]
  /** Feedback, action and outcome row ids actually read. */
  sourceIds: readonly string[]
}

export async function answerInterventionQuestion(
  ctx: AppContext, workstreamId: string, question: string,
): Promise<InterventionAnswer> {
  const kind = classifyInterventionQuestion(question)
  const opportunities = await ctx.opportunities.listByWorkstream(workstreamId, [], 200)
  const feedbackRows = await ctx.feedback.listByWorkstream(workstreamId)
  const outcomes = await ctx.outcomes.listByWorkstream(workstreamId)

  const byOpportunity = new Map<string, typeof feedbackRows>()
  for (const row of feedbackRows) {
    const key = row.opportunityId ?? row.targetId
    byOpportunity.set(key, [...(byOpportunity.get(key) ?? []), row])
  }

  const shown = opportunities.filter((o) => o.shownAt !== null)
  const lines: string[] = []
  const used: string[] = []
  const sources: string[] = []

  const collect = (
    predicate: (f: ReturnType<typeof projectFeedback>) => boolean, label: string,
  ): void => {
    for (const o of shown) {
      const rows = byOpportunity.get(o.id) ?? []
      const current = projectFeedback(rows)
      if (!predicate(current)) continue
      lines.push(`- ${o.headline} (${label})`)
      used.push(o.id)
      for (const id of Object.values(current.sourceIds)) if (id) sources.push(id)
    }
  }

  if (kind === 'valuable') {
    collect((f) => f.delivery === 'valuable', 'you marked this valuable')
    return finish(lines, used, sources,
      'You have not marked anything valuable yet.',
      'Opportunities you marked valuable:')
  }

  if (kind === 'correct_but_already_known') {
    collect((f) => f.epistemic === 'correct' && f.delivery === 'already_known',
      'correct, but you already knew it')
    return finish(lines, used, sources,
      'Nothing is recorded as both correct and already known.',
      'Correct, but not new to you:')
  }

  if (kind === 'unresolved') {
    const live = new Map<string, { state: string; id: string }>()
    for (const o of outcomes) {
      if (o.supersededByOutcomeId === null && o.opportunityId !== null) {
        live.set(o.opportunityId, { state: o.state, id: o.id })
      }
    }
    for (const o of shown) {
      const state = live.get(o.id)
      if (state === undefined) {
        lines.push(`- ${o.headline} (no outcome recorded — not the same as unresolved)`)
        used.push(o.id)
        continue
      }
      if (state.state !== 'unresolved') continue
      lines.push(`- ${o.headline} (recorded unresolved)`)
      used.push(o.id)
      sources.push(state.id)
    }
    return finish(lines, used, sources,
      'Every opportunity shown has a recorded outcome.',
      'Still open, and items with nothing recorded either way:')
  }

  if (kind === 'what_happened') {
    for (const o of shown) {
      const current = projectFeedback(byOpportunity.get(o.id) ?? [])
      const actions = await ctx.userActions.forOpportunity(o.id)
      const outcome = currentOutcome(outcomes.filter((x) => x.opportunityId === o.id))
      const parts: string[] = []
      parts.push(`shown ${o.shownAt?.toISOString().slice(0, 10)}`)
      parts.push(current.epistemic === null ? 'no correctness verdict' : `you said ${current.epistemic}`)
      parts.push(current.delivery === null ? 'no value verdict' : `you said ${current.delivery}`)
      parts.push(actions.length === 0
        ? 'no action recorded'
        : `you recorded: ${actions.map((a) => a.kind.replace(/_/g, ' ')).join(', ')}`)
      parts.push(outcome === null ? 'no outcome recorded' : `outcome ${outcome.state}`)
      lines.push(`- ${o.headline}\n  ${parts.join(' · ')}`)
      used.push(o.id)
      if (outcome) sources.push(outcome.id)
      for (const a of actions) sources.push(a.id)
    }
    return finish(lines, used, sources,
      'Nothing has been shown yet, so there is nothing to report on.',
      'What is recorded after each intervention. These are recorded facts in sequence — '
      + 'AVA is not claiming that one caused the next:')
  }

  for (const o of shown) {
    const current = projectFeedback(byOpportunity.get(o.id) ?? [])
    lines.push(`- ${o.headline} — ${current.hasAny
      ? `${current.epistemic ?? 'no correctness verdict'} / ${current.delivery ?? 'no value verdict'}`
      : 'no feedback recorded'}`)
    used.push(o.id)
  }
  return finish(lines, used, sources,
    'Nothing has been shown yet.',
    'What has been shown, and what you said about it:')
}

function finish(
  lines: string[], used: string[], sources: string[], empty: string, heading: string,
): InterventionAnswer {
  if (lines.length === 0) return { answer: empty, opportunityIds: [], sourceIds: [] }
  return {
    answer: `${heading}\n${lines.join('\n')}`,
    opportunityIds: [...new Set(used)],
    sourceIds: [...new Set(sources)],
  }
}
