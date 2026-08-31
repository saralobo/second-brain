import type { EvidenceStrength } from '@ava/core'
import type { Evidence } from '@ava/db'
import {
  BudgetController, classify, evaluatePolicy, estimateCostUsd, estimateTokens,
  minimize, redactForProvider, PRICE_TABLE_VERSION, capsFromEnv,
} from '@ava/llm'
import type {
  DataClass, GenerateRequest, ModelProvider, ProviderRegistry, SafetyCaps,
} from '@ava/llm'
import type { AppContext } from './context'

/**
 * The provider boundary.
 *
 * Every external model call goes through this function. There is no second
 * path to a provider — if one existed, the boundary would be documentation
 * rather than architecture.
 *
 *   retrieved evidence → task necessity → effective sensitivity → minimization
 *   → redaction → provider policy → budget → ModelRun PENDING → provider
 *   → structured validation → response
 */
export interface BoundaryRequest<T> {
  archetype: GenerateRequest['archetype']
  purpose: string
  promptId: string
  promptVersion: string
  providerName: string
  /** Evidence ids the task actually needs. Nothing travels "just in case". */
  evidenceIds: readonly string[]
  system: string
  buildUserMessage: (items: { id: string; text: string }[]) => string
  validate: (v: unknown) => T | null
  maxItems?: number
  maxCharsPerItem?: number
  maxOutputTokens?: number
  /** Names of third parties to remove; supplied by the caller, never guessed. */
  thirdPartyNames?: readonly string[]
  /** Marks synthetic development data as CLASS 0. */
  synthetic?: boolean
}

export type BoundaryOutcome<T> =
  | { ok: true; value: T; modelRunId: string; usage: { inputTokens: number; outputTokens: number; costUsd: number }; modelIdentifier: string; latencyMs: number }
  | { ok: false; modelRunId: string | null; stage: BoundaryStage; reason: string; abstained: boolean }

export type BoundaryStage =
  | 'evidence_selection'
  | 'sensitivity'
  | 'minimization'
  | 'redaction'
  | 'provider_policy'
  | 'budget'
  | 'provider_resolution'
  | 'provider_call'
  | 'structured_validation'

export interface BoundaryDeps {
  registry: ProviderRegistry
  caps?: SafetyCaps
}

export async function callThroughBoundary<T>(
  ctx: AppContext,
  deps: BoundaryDeps,
  req: BoundaryRequest<T>,
): Promise<BoundaryOutcome<T>> {
  const maxItems = req.maxItems ?? 12
  const maxCharsPerItem = req.maxCharsPerItem ?? 2_000
  const maxOutputTokens = req.maxOutputTokens ?? 1_024

  // 1. Evidence selection — only what was asked for.
  if (req.evidenceIds.length === 0) {
    return { ok: false, modelRunId: null, stage: 'evidence_selection', abstained: true,
      reason: 'no evidence selected; nothing to ground an answer on' }
  }

  // 2. Effective sensitivity (F-01) — annotations override the base row.
  const items: Evidence[] = await ctx.evidence.findForBoundary(req.evidenceIds)
  if (items.length === 0) {
    return { ok: false, modelRunId: null, stage: 'evidence_selection', abstained: true,
      reason: 'selected evidence could not be loaded' }
  }

  const classes: DataClass[] = items.map((e) =>
    classify({ contentOrigin: e.contentOrigin, sensitivity: e.sensitivity, synthetic: req.synthetic }))

  const summary: Record<string, number> = {}
  for (const c of classes) summary[c] = (summary[c] ?? 0) + 1

  const denied = classes.some((c) => c === 'CLASS_3')
  if (denied) {
    // CLASS 3 has no automatic override in V0. Abstain rather than send.
    return { ok: false, modelRunId: null, stage: 'sensitivity', abstained: true,
      reason: 'selection contains restricted content, which may not cross the provider boundary' }
  }

  // 3. Minimization.
  const minimized = minimize(items, (e) => e.content, { maxItems, maxCharsPerItem })

  // 4. Redaction.
  const redactionApplied = new Set<string>()
  let degraded = false
  const prepared = minimized.kept.map(({ item, text }) => {
    const r = redactForProvider(text, { thirdPartyNames: req.thirdPartyNames })
    for (const k of r.applied) redactionApplied.add(k)
    if (r.degraded) degraded = true
    return { id: item.id, text: r.text }
  })

  if (degraded) {
    // Redaction destroyed the context the task needed. Sending something
    // mangled would be worse than not answering.
    return { ok: false, modelRunId: null, stage: 'redaction', abstained: true,
      reason: 'redaction removed too much of the content for the task to be answerable' }
  }

  // 5. Provider policy gate — before budget, so a forbidden call never
  //    consumes headroom.
  const resolution = deps.registry.resolve(req.providerName)
  if (!resolution.ok) {
    return { ok: false, modelRunId: null, stage: 'provider_resolution', abstained: false,
      reason: resolution.reason }
  }
  const provider: ModelProvider = resolution.provider

  const policy = evaluatePolicy({
    classes,
    policy: provider.policyMetadata,
    redactionApplied: redactionApplied.size > 0 || classes.every((c) => c !== 'CLASS_2'),
  })
  if (!policy.allowed) {
    return { ok: false, modelRunId: null, stage: 'provider_policy', abstained: true,
      reason: policy.reason }
  }

  // 6. Budget gate.
  const userMessage = req.buildUserMessage(prepared)
  const estimatedInput = estimateTokens(req.system) + estimateTokens(userMessage)
  const model = provider.modelName
  const estimated = estimateCostUsd(model, estimatedInput, maxOutputTokens)

  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [dailyUsd, monthlyUsd] = await Promise.all([
    ctx.modelRuns.spendSince(dayStart),
    ctx.modelRuns.spendSince(monthStart),
  ])

  const budget = new BudgetController(deps.caps ?? capsFromEnv(), { dailyUsd, monthlyUsd })
  const decision = budget.authorize(estimated ?? Number.POSITIVE_INFINITY)
  if (!decision.allowed) {
    // Record the denial: a refused call is data, not a non-event.
    const deniedRunId = await ctx.modelRuns.begin({
      provider: provider.id, model, archetype: req.archetype, purpose: req.purpose,
      promptId: req.promptId, promptVersion: req.promptVersion,
      evidenceIds: [...req.evidenceIds], sensitivitySummary: summary,
      redactionApplied: [...redactionApplied],
      estimatedCostUsd: estimated, priceTableVersion: PRICE_TABLE_VERSION,
      requestStartedAt: now,
    })
    await ctx.modelRuns.finish(deniedRunId, {
      status: 'DENIED', denialReason: `${decision.cap}: ${decision.reason}`,
    })
    return { ok: false, modelRunId: deniedRunId, stage: 'budget', abstained: false,
      reason: decision.reason }
  }

  // 7. ModelRun PENDING — written BEFORE the call.
  const runId = await ctx.modelRuns.begin({
    provider: provider.id, model, archetype: req.archetype, purpose: req.purpose,
    promptId: req.promptId, promptVersion: req.promptVersion,
    evidenceIds: [...req.evidenceIds], sensitivitySummary: summary,
    redactionApplied: [...redactionApplied],
    estimatedCostUsd: estimated, priceTableVersion: PRICE_TABLE_VERSION,
    requestStartedAt: now,
  })

  // 8. Provider call.
  const result = await provider.generateStructured(
    {
      archetype: req.archetype, promptId: req.promptId, promptVersion: req.promptVersion,
      input: { system: req.system, user: userMessage },
      evidenceIds: prepared.map((p) => p.id),
      timeoutMs: provider.timeoutMs,
    },
    req.validate,
  )

  const completedAt = new Date()
  const latencyMs = completedAt.getTime() - now.getTime()

  if (result.ok) {
    await ctx.modelRuns.finish(runId, {
      status: 'COMPLETE', modelIdentifier: result.modelId,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      actualCostUsd: result.usage.costUsd, responseCompletedAt: completedAt,
    })
    return { ok: true, value: result.value, modelRunId: runId, usage: result.usage,
      modelIdentifier: result.modelId, latencyMs }
  }

  const abstained = result.abstained === true
  await ctx.modelRuns.finish(runId, {
    status: abstained ? 'ABORTED' : 'FAILED',
    modelIdentifier: result.modelId,
    // Unknown usage stays NULL rather than being recorded as zero.
    inputTokens: result.usage.inputTokens || null,
    outputTokens: result.usage.outputTokens || null,
    responseCompletedAt: completedAt,
    errorKind: abstained ? 'abstained' : 'call_failed',
    errorDetail: abstained ? result.reason : result.error,
  })

  return {
    ok: false, modelRunId: runId, abstained,
    stage: abstained ? 'provider_call' : 'structured_validation',
    reason: abstained ? result.reason : result.error,
  }
}

/** Strength never rises by passing through a model. */
export function strengthAfterModel(inputs: readonly EvidenceStrength[]): EvidenceStrength {
  return inputs.includes('SPECULATIVE') ? 'SPECULATIVE'
    : inputs.includes('SUPPORTED') ? 'SUPPORTED' : 'ESTABLISHED'
}
