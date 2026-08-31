import { MockModelProvider, ProviderRegistry } from '@ava/llm'
import type { AppContext } from '../context'
import { capture } from '../capture-service'
import { ask } from '../answer-service'

/**
 * Grounded answering eval (S3-T13).
 *
 * Deliberately small. It measures the PIPELINE — schema validity, grounding
 * enforcement, unsupported-assertion rejection, evidence fidelity, abstention,
 * latency, cost — not the quality of any model's prose.
 *
 * Against the mock provider it can only report that the machinery holds.
 * Answer quality stays `PENDING REAL PROVIDER` until a controlled run against
 * a real provider exists. The challenger `gpt-5.6-terra` has no adapter, so
 * its comparison is `CHALLENGER EVAL DEFERRED UNTIL ADAPTER/EVAL GATE`.
 *
 * All content is synthetic. Results here are technical, never product
 * validation evidence.
 */
export interface EvalCase {
  id: string
  question: string
  /** What a correct system does, decided before running. */
  expect: 'answer' | 'abstain'
  /** Substrings the answer must contain when it answers. */
  mustMention?: readonly string[]
  /** Substrings that would mean the answer invented something. */
  mustNotMention?: readonly string[]
}

export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: 'E-01-state',
    question: 'What do you know about the reader release?',
    expect: 'answer',
    mustMention: ['reader'],
  },
  {
    id: 'E-02-change',
    question: 'What changed in this project?',
    expect: 'answer',
  },
  {
    id: 'E-03-decision',
    question: 'What decisions did I make about storage?',
    expect: 'answer',
    mustMention: ['encrypted'],
  },
  {
    id: 'E-04-unresolved',
    question: 'What is still unresolved?',
    expect: 'answer',
    mustMention: ['migration'],
  },
  {
    id: 'E-05-absent-source',
    question: 'What did we agree with the Lisbon subcontractor?',
    expect: 'abstain',
    mustNotMention: ['Lisbon subcontractor agreed'],
  },
  {
    id: 'E-06-restricted',
    question: 'What do you know about the compensation review?',
    expect: 'abstain',
    mustNotMention: ['CONFIDENTIALBAND'],
  },
]

export interface EvalMetrics {
  cases: number
  schemaValid: number
  groundedCorrect: number
  unsupportedAssertions: number
  evidenceFidelity: number
  abstentions: number
  expectedAbstentions: number
  latencyMsP50: number
  latencyMsMax: number
  costUsd: number
  failures: { id: string; detail: string }[]
}

/** Builds the synthetic corpus the eval runs against. */
export async function seedEvalCorpus(ctx: AppContext): Promise<string> {
  const ws = await ctx.workstreams.create('Eval corpus', 'Synthetic. Not real work.')

  await capture(ctx, {
    workstreamId: ws.id, type: 'goal',
    title: 'Ship the reader release',
    content: 'The reader release should let a person read and annotate offline.',
  })
  const decision = await capture(ctx, {
    workstreamId: ws.id, type: 'decision',
    title: 'Store annotations locally only',
    content: 'Annotations are stored on the device only. No sync service yet.',
  })
  if (!decision.ok || !decision.change) throw new Error('eval seed failed')

  await capture(ctx, {
    workstreamId: ws.id, type: 'correction',
    title: 'Annotations sync through an encrypted store',
    content: 'Local-only storage no longer holds. Annotations sync through an encrypted store.',
    supersedesStateObjectId: decision.change.objectId,
  })
  await capture(ctx, {
    workstreamId: ws.id, type: 'question',
    title: 'Who owns the migration script?',
    content: 'No owner has been named for the annotation migration script.',
  })

  const restricted = await capture(ctx, {
    workstreamId: ws.id, type: 'note',
    title: 'Compensation review',
    content: 'The compensation review set CONFIDENTIALBAND for the team.',
  })
  if (restricted.ok) {
    await ctx.evidence.annotate({
      evidenceId: restricted.evidence.id, sensitivity: 'restricted', reason: 'compensation data',
    })
  }
  return ws.id
}

export async function runAnswerEval(ctx: AppContext, workstreamId: string): Promise<EvalMetrics> {
  const registry = new ProviderRegistry()
  registry.register('mock', {
    provider: new MockModelProvider(), configured: true, enabled: true, local: true,
  })

  const metrics: EvalMetrics = {
    cases: EVAL_CASES.length,
    schemaValid: 0, groundedCorrect: 0, unsupportedAssertions: 0, evidenceFidelity: 0,
    abstentions: 0, expectedAbstentions: EVAL_CASES.filter((c) => c.expect === 'abstain').length,
    latencyMsP50: 0, latencyMsMax: 0, costUsd: 0, failures: [],
  }
  const latencies: number[] = []

  for (const c of EVAL_CASES) {
    const started = Date.now()
    const res = await ask(ctx, { registry, providerName: 'mock' }, {
      workstreamId, question: c.question,
    })
    latencies.push(Date.now() - started)

    // Schema validity: nothing was rejected for failing the answer contract.
    if (res.groundingFailures.length === 0) metrics.schemaValid += 1

    if (res.abstained) metrics.abstentions += 1

    const behavedAsExpected = c.expect === 'abstain' ? res.abstained : !res.abstained
    if (behavedAsExpected) metrics.groundedCorrect += 1
    else {
      metrics.failures.push({
        id: c.id,
        detail: `expected to ${c.expect}, but ${res.abstained ? 'abstained' : 'answered'}` +
          ` (context health ${res.contextHealth.state})`,
      })
    }

    for (const must of c.mustMention ?? []) {
      if (!res.abstained && !res.answer.toLowerCase().includes(must.toLowerCase())) {
        metrics.failures.push({ id: c.id, detail: `answer omitted "${must}"` })
      }
    }
    for (const forbidden of c.mustNotMention ?? []) {
      if (res.answer.toLowerCase().includes(forbidden.toLowerCase())) {
        metrics.unsupportedAssertions += 1
        metrics.failures.push({ id: c.id, detail: `answer asserted "${forbidden}"` })
      }
    }

    // Evidence fidelity: every citation shown was authorised for this answer.
    const eligible = new Set(res.packet.providerEligibleEvidenceIds)
    if (res.abstained || res.evidence.every((e) => eligible.has(e.evidenceId))) {
      metrics.evidenceFidelity += 1
    }

    if (res.modelRunId) {
      const run = await ctx.modelRuns.findById(res.modelRunId)
      metrics.costUsd += Number(run?.actual_cost_usd ?? run?.estimated_cost_usd ?? 0)
    }
  }

  latencies.sort((a, b) => a - b)
  metrics.latencyMsP50 = latencies[Math.floor(latencies.length / 2)] ?? 0
  metrics.latencyMsMax = latencies[latencies.length - 1] ?? 0
  return metrics
}
