import { assertsUserPreference, gatesFor, parseGroundedAnswer, validateGrounding } from '@ava/core'
import type {
  CognitionContext, ContextPacket, GroundedAnswer, GroundingVerdict, RetrievalResult,
} from '@ava/core'
import { GROUNDED_ANSWER_V2, PromptRegistry, isMockProvider } from '@ava/llm'
import type { ProviderRegistry, SafetyCaps } from '@ava/llm'
import { buildContextPacket } from '@ava/retrieval'
import type { ExecutionMode } from '@ava/db'
import type { AppContext } from './context'
import { callThroughBoundary } from './provider-boundary'
import { composeMockAnswer } from './answer-composer'
import { answerInterventionQuestion } from './intervention-answers'

/**
 * Grounded answering (S3-T07, S3-T08, S3-T09).
 *
 *   question → classification → retrieval → Context Packet → Context Health
 *   → gates → provider boundary → grounding validation → answer or abstention
 *   → DecisionRecord
 *
 * Two properties this function is built to guarantee:
 *  - `INSUFFICIENT` health abstains BEFORE any provider is contacted, so an
 *    unanswerable question costs nothing and cannot be answered plausibly;
 *  - a response that fails grounding validation is discarded, not shown with
 *    a caveat. A caveat on an unsupported claim is still an unsupported claim.
 */
export interface AskRequest {
  workstreamId: string
  question: string
  /** Chat thread this turn belongs to, when asked through the UI. */
  conversationId?: string | null
  asOf?: Date
  synthetic?: boolean
  /**
   * The situation being asked about, for scope matching.
   *
   * Only declarations whose scope covers this situation are applied. Omitting
   * it means only unscoped declarations apply.
   */
  cognitionContext?: CognitionContext
}

export interface AskDeps {
  registry: ProviderRegistry
  /** Provider the answer should use. `mock` keeps everything local. */
  providerName: string
  caps?: SafetyCaps
  prompts?: PromptRegistry
}

export interface AskResult {
  answer: string
  abstained: boolean
  uncertainties: readonly string[]
  /** Evidence that survived grounding validation. Shown as references. */
  evidence: readonly RetrievalResult[]
  packet: ContextPacket
  decisionRecordId: string
  contextHealth: ContextPacket['health']
  executionMode: ExecutionMode
  modelRunId: string | null
  groundingFailures: GroundingVerdict['failures']
  /** Declarations the answer applied. */
  declaredCognitionIds: readonly string[]
  /** Hypotheses the answer reported — always labelled as guesses. */
  hypothesisIds: readonly string[]
  /** Present when an answer was produced and then rejected. */
  rejectedAnswer: boolean
}

const TASK = 'state_query_answer'

export async function ask(ctx: AppContext, deps: AskDeps, req: AskRequest): Promise<AskResult> {
  const asOf = req.asOf ?? new Date()
  const prompts = deps.prompts ?? new PromptRegistry()
  const prompt = prompts.get(GROUNDED_ANSWER_V2.id, GROUNDED_ANSWER_V2.version)

  await ctx.telemetry.record({
    eventType: 'question_received', occurredAt: asOf,
    subjectType: 'workstream', subjectId: req.workstreamId, workstreamId: req.workstreamId,
    payload: { length: req.question.length },
  })

  const retrievalStartedAt = new Date()
  await ctx.telemetry.record({
    eventType: 'retrieval_started', occurredAt: retrievalStartedAt,
    subjectType: 'workstream', subjectId: req.workstreamId, workstreamId: req.workstreamId,
  })

  const built = await buildContextPacket(
    {
      retrieval: ctx.retrieval, state: ctx.state, changes: ctx.changes,
      cognition: ctx.cognition, hypotheses: ctx.hypotheses, memory: ctx.memory,
      evidence: ctx.evidence,
    },
    {
      question: req.question, workstreamId: req.workstreamId, asOf,
      synthetic: req.synthetic, cognitionContext: req.cognitionContext,
    },
  )
  const packet = built.packet

  await ctx.telemetry.record({
    eventType: 'retrieval_completed', occurredAt: new Date(),
    subjectType: 'context_packet', subjectId: packet.id, workstreamId: req.workstreamId,
    payload: {
      strategy: built.strategy,
      scope: `workstream:${req.workstreamId}`,
      queryKind: packet.query.kind,
      candidateCount: built.candidateCount,
      selectedCount: packet.providerEligibleEvidenceIds.length,
      selectedEvidenceIds: packet.providerEligibleEvidenceIds,
      exclusions: packet.exclusions.map((e) => ({ evidenceId: e.evidenceId, reason: e.reason })),
      latencyMs: built.retrievalLatencyMs,
    },
  })

  const healthId = await ctx.contextHealth.record(TASK, req.workstreamId, packet.health)

  await ctx.telemetry.record({
    eventType: 'context_packet_created', occurredAt: new Date(),
    subjectType: 'context_packet', subjectId: packet.id, workstreamId: req.workstreamId,
    contextHealth: packet.health.state,
    payload: {
      retrieved: packet.retrieved.length,
      providerEligible: packet.providerEligibleEvidenceIds.length,
      conflicts: packet.conflicts.length,
      gaps: packet.gaps.length,
    },
  })

  const gates = gatesFor(packet.health.state)
  const record = makeRecorder(ctx, req, packet, healthId, prompt)

  // ---- INSUFFICIENT: abstain locally. No provider is contacted. ----
  if (gates.mustAbstain) {
    return finishAbstention(ctx, req, packet, await record({
      executionMode: 'local_only',
      provider: null, model: null, modelRunId: null,
      abstained: true,
      abstentionReason: abstentionReason(packet),
      answer: localAbstentionText(packet),
      answerEvidenceIds: [],
      uncertainties: packet.gaps,
      groundingValid: null, groundingFailures: [], fallbackUsed: false, errorDetail: null,
    }), localAbstentionText(packet), 'local_only', null, [])
  }

  // ---- Personal questions are answered LOCALLY ----
  //
  // Two reasons, and either alone would be sufficient. Declared Cognition and
  // Behavioral Hypotheses are the most sensitive things AVA holds (ADR-22,
  // baseline §26): sending a behavioural profile of the user to a provider to
  // have it read back to her is a poor trade. And the answer is an enumeration
  // of what she declared and what AVA guessed — deterministic composition is
  // not a downgrade here, it is the correct implementation.
  if (packet.query.kind === 'personal') {
    return answerPersonallyFromLocalCognition(ctx, req, packet, record, gates)
  }

  // Questions about AVA's own record of what happened — what the user marked,
  // what they did, how things ended. Answered from stored rows, rendered
  // deterministically, and never sent to a provider: feedback notes are the
  // user's private commentary on her own work.
  if (packet.query.kind === 'intervention') {
    return answerFromInterventionRecords(ctx, req, packet, record)
  }

  // ---- Provider path ----
  const isMock = deps.providerName === 'mock'
  const executionMode: ExecutionMode = isMock ? 'mock' : 'external'

  if (isMock) {
    // Mock mode still traverses the boundary so classification, minimization,
    // redaction, policy, budget and ModelRun are exercised — the difference
    // is only that the canned value is composed locally.
    const composed = composeMockAnswer(packet)
    const mockProvider = deps.registry.peek(deps.providerName)
    if (isMockProvider(mockProvider)) {
      mockProvider.setResponse('state_query_answer', {
        answer: composed.answer,
        evidence_ids: composed.evidenceIds,
        uncertainties: composed.uncertainties,
        abstained: composed.abstained,
      })
    }
  }

  const outcome = await callThroughBoundary(ctx, { registry: deps.registry, caps: deps.caps }, {
    archetype: 'state_query_answer',
    purpose: 'grounded project question',
    promptId: prompt.id,
    promptVersion: prompt.version,
    providerName: deps.providerName,
    evidenceIds: packet.providerEligibleEvidenceIds,
    system: prompt.system,
    buildUserMessage: (items) => buildUserMessage(packet, items),
    validate: (v) => parseGroundedAnswer(v),
    synthetic: req.synthetic,
  })

  if (!outcome.ok) {
    await ctx.telemetry.record({
      eventType: 'provider_call_denied', occurredAt: new Date(),
      subjectType: 'context_packet', subjectId: packet.id, workstreamId: req.workstreamId,
      contextHealth: packet.health.state, modelRunId: outcome.modelRunId,
      payload: { stage: outcome.stage, abstained: outcome.abstained },
    })
    const text = boundaryAbstentionText(outcome.stage, outcome.reason)
    const drId = await record({
      executionMode,
      provider: deps.providerName, model: null, modelRunId: outcome.modelRunId,
      abstained: true,
      abstentionReason: `${outcome.stage}: ${outcome.reason}`,
      answer: text,
      answerEvidenceIds: [],
      uncertainties: packet.gaps,
      groundingValid: null, groundingFailures: [], fallbackUsed: false,
      errorDetail: outcome.abstained ? null : outcome.reason,
    })
    return finishAbstention(ctx, req, packet, drId, text, executionMode, outcome.modelRunId, [])
  }

  await ctx.telemetry.record({
    eventType: 'provider_call_authorized', occurredAt: new Date(),
    subjectType: 'model_run', subjectId: outcome.modelRunId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, modelRunId: outcome.modelRunId,
    payload: { model: outcome.modelIdentifier, latencyMs: outcome.latencyMs, mode: executionMode },
  })

  const answer: GroundedAnswer = outcome.value

  // ---- Grounding validation, independent of the generation ----
  const verdict = validateGrounding(answer, packet)

  if (!verdict.valid) {
    await ctx.telemetry.record({
      eventType: 'grounded_answer_rejected', occurredAt: new Date(),
      subjectType: 'model_run', subjectId: outcome.modelRunId, workstreamId: req.workstreamId,
      contextHealth: packet.health.state, modelRunId: outcome.modelRunId,
      payload: { failures: verdict.failures.map((f) => f.kind) },
    })
    const text = rejectionText(verdict)
    const drId = await record({
      executionMode,
      provider: deps.providerName, model: outcome.modelIdentifier, modelRunId: outcome.modelRunId,
      abstained: true,
      abstentionReason: 'answer failed grounding validation and was discarded',
      answer: text,
      answerEvidenceIds: [],
      uncertainties: packet.gaps,
      groundingValid: false, groundingFailures: verdict.failures,
      fallbackUsed: true, errorDetail: null,
    })
    const result = await finishAbstention(
      ctx, req, packet, drId, text, executionMode, outcome.modelRunId, verdict.failures)
    return { ...result, rejectedAnswer: true }
  }

  if (answer.abstained) {
    const drId = await record({
      executionMode,
      provider: deps.providerName, model: outcome.modelIdentifier, modelRunId: outcome.modelRunId,
      abstained: true,
      abstentionReason: 'the provider judged the supplied evidence insufficient',
      answer: answer.answer,
      answerEvidenceIds: verdict.acceptedEvidenceIds,
      uncertainties: answer.uncertainties,
      groundingValid: true, groundingFailures: [], fallbackUsed: false, errorDetail: null,
    })
    return finishAbstention(
      ctx, req, packet, drId, answer.answer, executionMode, outcome.modelRunId, [])
  }

  // ---- Accepted answer ----
  const uncertainties = gates.mustShowGaps
    ? [...answer.uncertainties, ...packet.gaps]
    : answer.uncertainties

  const drId = await record({
    executionMode,
    provider: deps.providerName, model: outcome.modelIdentifier, modelRunId: outcome.modelRunId,
    abstained: false, abstentionReason: null,
    answer: answer.answer,
    answerEvidenceIds: verdict.acceptedEvidenceIds,
    uncertainties,
    groundingValid: true, groundingFailures: [], fallbackUsed: false, errorDetail: null,
    declaredCognitionIds: verdict.acceptedCognitionIds,
    hypothesisIds: verdict.acceptedHypothesisIds,
    knowledgeIds: packet.stabilizedKnowledge
      .filter((k) => verdict.acceptedEvidenceIds.includes(k.memoryRecordId))
      .map((k) => k.memoryRecordId),
  })

  await ctx.telemetry.record({
    eventType: 'grounded_answer_generated', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: drId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, modelRunId: outcome.modelRunId, decisionRecordId: drId,
    payload: { evidenceCount: verdict.acceptedEvidenceIds.length, mode: executionMode },
  })
  await ctx.telemetry.record({
    eventType: 'answer_shown', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: drId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, decisionRecordId: drId,
  })

  await appendChatTurn(ctx, req, drId, answer.answer, false, packet.health.state)

  return {
    answer: answer.answer,
    abstained: false,
    uncertainties: dedupe(uncertainties),
    evidence: packet.retrieved.filter((r) => verdict.acceptedEvidenceIds.includes(r.evidenceId)),
    packet,
    decisionRecordId: drId,
    contextHealth: packet.health,
    executionMode,
    modelRunId: outcome.modelRunId,
    groundingFailures: [],
    declaredCognitionIds: verdict.acceptedCognitionIds,
    hypothesisIds: verdict.acceptedHypothesisIds,
    rejectedAnswer: false,
  }
}

/**
 * Answers a personal question from local cognition alone.
 *
 * No provider is contacted, so nothing about the user leaves the machine, and
 * the answer still passes through the same grounding validation as any other:
 * being composed locally is not a reason to skip the check that it only says
 * what the context supports.
 */
async function answerPersonallyFromLocalCognition(
  ctx: AppContext,
  req: AskRequest,
  packet: ContextPacket,
  record: (args: RecordArgs) => Promise<string>,
  gates: ReturnType<typeof gatesFor>,
): Promise<AskResult> {
  const composed = composeMockAnswer(packet)
  const verdict = validateGrounding(composed, packet)

  if (!verdict.valid || composed.abstained) {
    const text = composed.abstained ? composed.answer : rejectionText(verdict)
    const drId = await record({
      executionMode: 'local_only',
      provider: null, model: null, modelRunId: null,
      abstained: true,
      abstentionReason: composed.abstained
        ? 'nothing declared or observed applies to this context'
        : 'locally composed answer failed grounding validation',
      answer: text,
      answerEvidenceIds: [],
      uncertainties: packet.gaps,
      groundingValid: verdict.valid ? null : false,
      groundingFailures: verdict.failures,
      fallbackUsed: !verdict.valid,
      errorDetail: null,
    })
    return finishAbstention(ctx, req, packet, drId, text, 'local_only', null, verdict.failures)
  }

  const uncertainties = gates.mustShowGaps
    ? [...composed.uncertainties, ...packet.gaps]
    : composed.uncertainties

  const drId = await record({
    executionMode: 'local_only',
    provider: null, model: null, modelRunId: null,
    abstained: false, abstentionReason: null,
    answer: composed.answer,
    answerEvidenceIds: verdict.acceptedEvidenceIds,
    uncertainties,
    groundingValid: true, groundingFailures: [], fallbackUsed: false, errorDetail: null,
    declaredCognitionIds: verdict.acceptedCognitionIds,
    hypothesisIds: verdict.acceptedHypothesisIds,
  })

  await ctx.telemetry.record({
    eventType: 'grounded_answer_generated', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: drId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, decisionRecordId: drId,
    payload: {
      mode: 'local_only',
      declarations: verdict.acceptedCognitionIds.length,
      hypotheses: verdict.acceptedHypothesisIds.length,
    },
  })
  await ctx.telemetry.record({
    eventType: 'answer_shown', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: drId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, decisionRecordId: drId,
  })
  await appendChatTurn(ctx, req, drId, composed.answer, false, packet.health.state)

  return {
    answer: composed.answer,
    abstained: false,
    uncertainties: dedupe(uncertainties),
    evidence: packet.retrieved.filter((r) => verdict.acceptedEvidenceIds.includes(r.evidenceId)),
    packet,
    decisionRecordId: drId,
    contextHealth: packet.health,
    executionMode: 'local_only',
    modelRunId: null,
    groundingFailures: [],
    declaredCognitionIds: verdict.acceptedCognitionIds,
    hypothesisIds: verdict.acceptedHypothesisIds,
    rejectedAnswer: false,
  }
}

/**
 * Reads back what was recorded after previous interventions.
 *
 * Grounding validation does not apply here and is recorded as `null` rather
 * than as `true`. That check asks whether an answer stayed inside the Context
 * Packet; this answer does not come from the packet at all — it is a rendering
 * of feedback, action and outcome rows, and claiming it passed a check that
 * was never run would be worse than saying it did not apply.
 */
async function answerFromInterventionRecords(
  ctx: AppContext,
  req: AskRequest,
  packet: ContextPacket,
  record: (args: RecordArgs) => Promise<string>,
): Promise<AskResult> {
  const composed = await answerInterventionQuestion(ctx, req.workstreamId, req.question)

  const drId = await record({
    executionMode: 'local_only',
    provider: null, model: null, modelRunId: null,
    abstained: false, abstentionReason: null,
    answer: composed.answer,
    answerEvidenceIds: [],
    uncertainties: [
      'This is a read of what was recorded. It reports facts in sequence and does not claim '
      + 'that one caused another.',
    ],
    groundingValid: null,
    groundingFailures: [],
    fallbackUsed: false,
    errorDetail: null,
  })

  await ctx.telemetry.record({
    eventType: 'answer_shown', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: drId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, decisionRecordId: drId,
    payload: { kind: 'intervention', opportunities: composed.opportunityIds.length },
  })
  await appendChatTurn(ctx, req, drId, composed.answer, false, packet.health.state)

  return {
    answer: composed.answer,
    abstained: false,
    uncertainties: [
      'This is a read of what was recorded. It reports facts in sequence and does not claim '
      + 'that one caused another.',
    ],
    evidence: [],
    packet,
    decisionRecordId: drId,
    contextHealth: packet.health,
    executionMode: 'local_only',
    modelRunId: null,
    groundingFailures: [],
    declaredCognitionIds: [],
    hypothesisIds: [],
    rejectedAnswer: false,
  }
}

// ---------------------------------------------------------------------------

type RecordArgs = {
  executionMode: ExecutionMode
  provider: string | null
  model: string | null
  modelRunId: string | null
  abstained: boolean
  abstentionReason: string | null
  answer: string
  answerEvidenceIds: readonly string[]
  uncertainties: readonly string[]
  groundingValid: boolean | null
  groundingFailures: GroundingVerdict['failures']
  fallbackUsed: boolean
  errorDetail: string | null
  declaredCognitionIds?: readonly string[]
  hypothesisIds?: readonly string[]
  knowledgeIds?: readonly string[]
}

function makeRecorder(
  ctx: AppContext,
  req: AskRequest,
  packet: ContextPacket,
  healthId: string,
  prompt: { id: string; version: string },
) {
  return (args: RecordArgs): Promise<string> =>
    ctx.decisionRecords.append({
      kind: 'grounded_answer',
      workstreamId: req.workstreamId,
      request: req.question,
      queryKind: packet.query.kind,
      retrievalResultIds: packet.retrieved.map((r) => r.evidenceId),
      packet,
      excluded: packet.exclusions,
      contextHealthId: healthId,
      contextHealthState: packet.health.state,
      provider: args.provider,
      model: args.model,
      promptId: prompt.id,
      promptVersion: prompt.version,
      modelRunId: args.modelRunId,
      executionMode: args.executionMode,
      groundingValid: args.groundingValid,
      groundingFailures: args.groundingFailures,
      answer: args.answer,
      answerEvidenceIds: args.answerEvidenceIds,
      uncertainties: args.uncertainties,
      abstained: args.abstained,
      abstentionReason: args.abstentionReason,
      fallbackUsed: args.fallbackUsed,
      errorDetail: args.errorDetail,
      // Which personal cognition the answer actually applied, and under what
      // authority. Without this, "why did AVA apply this preference here?" is
      // unanswerable after the fact.
      declaredCognitionIds: args.declaredCognitionIds ?? [],
      hypothesisIds: args.hypothesisIds ?? [],
      knowledgeIds: args.knowledgeIds ?? [],
      cognitiveAuthority: packet.declaredCognition.length > 0
        ? packet.declaredCognition[0]!.authority
        : packet.behavioralHypotheses.length > 0 ? 'HYPOTHESIS' : 'NONE',
      scopeMatch: Object.fromEntries(
        packet.declaredCognition.map((c) => [c.cognitionId, c.matchReason]),
      ),
    })
}

async function finishAbstention(
  ctx: AppContext,
  req: AskRequest,
  packet: ContextPacket,
  decisionRecordId: string,
  text: string,
  executionMode: ExecutionMode,
  modelRunId: string | null,
  failures: GroundingVerdict['failures'],
): Promise<AskResult> {
  await ctx.telemetry.record({
    eventType: 'abstention_shown', occurredAt: new Date(),
    subjectType: 'decision_record', subjectId: decisionRecordId, workstreamId: req.workstreamId,
    contextHealth: packet.health.state, decisionRecordId,
  })
  await appendChatTurn(ctx, req, decisionRecordId, text, true, packet.health.state)

  return {
    answer: text,
    abstained: true,
    uncertainties: dedupe([...packet.gaps, ...packet.conflicts]),
    // An abstention still shows what AVA does hold. Silence would be worse
    // than the abstention: the user cannot judge the gap without seeing it.
    evidence: packet.retrieved,
    packet,
    decisionRecordId,
    contextHealth: packet.health,
    executionMode,
    modelRunId,
    groundingFailures: failures,
    declaredCognitionIds: [],
    hypothesisIds: [],
    rejectedAnswer: false,
  }
}

async function appendChatTurn(
  ctx: AppContext, req: AskRequest, decisionRecordId: string,
  body: string, abstained: boolean, health: string,
): Promise<void> {
  if (!req.conversationId) return
  await ctx.conversations.addMessage({
    conversationId: req.conversationId, role: 'ava', body,
    decisionRecordId, abstained, contextHealth: health,
  })
}

/**
 * The user message.
 *
 * Only redacted evidence text crosses; the surrounding metadata is
 * structural — ids, dates, strength, current/superseded — and carries no
 * content of its own. State and change entries are described by reference
 * for the same reason: their titles are captured content and have not been
 * through redaction.
 */
function buildUserMessage(packet: ContextPacket, items: { id: string; text: string }[]): string {
  const meta = new Map(packet.retrieved.map((r) => [r.evidenceId, r]))
  const lines: string[] = []

  lines.push(`Question: ${packet.question}`)
  lines.push(`Question type: ${packet.query.kind}`)
  lines.push(`Context health: ${packet.health.state}`)
  if (packet.gaps.length > 0) {
    lines.push('Known gaps in what I could retrieve:')
    for (const g of packet.gaps) lines.push(`- ${g}`)
  }
  if (packet.conflicts.length > 0) {
    lines.push('Unresolved conflicts. Do not resolve these; report them:')
    for (const c of packet.conflicts) lines.push(`- ${c}`)
  }

  if (packet.declaredCognition.length > 0) {
    // Metadata only. The WORDS live in the evidence block below, where they
    // have been through classification and redaction like everything else —
    // printing `content` here would be a second, unredacted path across the
    // boundary for the most sensitive text AVA holds.
    lines.push('', 'DECLARED BY THE USER — highest authority. You may state these as things the',
      'user told you. Each applies only in the scope shown, and its wording is the',
      'evidence item listed beside it.')
    for (const c of packet.declaredCognition) {
      lines.push(`- [${c.cognitionId}] (${c.cognitionType}, ${c.authority})` +
        ` wording: ${c.evidenceIds.join(', ') || 'not available'}`)
      lines.push(`  scope: ${c.scopeDescription} | why it applies: ${c.matchReason}`)
    }
  }
  if (packet.stabilizedKnowledge.length > 0) {
    lines.push('', 'EVIDENCE-BACKED KNOWLEDGE — supported by the ledger, not a personal statement:')
    for (const k of packet.stabilizedKnowledge) {
      lines.push(`- [${k.memoryRecordId}] (${k.strength}) evidence: ${k.derivedFromEvidenceIds.join(', ')}`)
    }
  }
  // Behavioral Hypotheses are NOT sent. They are AVA's own inferences about
  // the user, they ground nothing, and shipping a behavioural profile to a
  // provider to have it summarised back is exactly the trade ADR-22 refuses.
  if (packet.behavioralHypotheses.length > 0) {
    lines.push('', `${packet.behavioralHypotheses.length} observed pattern(s) exist and were` +
      ' deliberately withheld. Do not speculate about them.')
  }

  lines.push('', 'EVIDENCE. Use only these items. Cite by id.')
  for (const it of items) {
    const m = meta.get(it.id)
    lines.push('')
    lines.push(`id: ${it.id}`)
    if (m) {
      lines.push(`type: ${m.captureType} | origin: ${m.contentOrigin} | strength: ${m.strength}`)
      lines.push(`observed_at: ${m.observedAt.toISOString()}` +
        (m.effectiveAt ? ` | effective_at: ${m.effectiveAt.toISOString()}` : ''))
      lines.push(`status: ${m.supersededByObjectVersion === null ? 'current' : 'SUPERSEDED — describes the past only'}`)
    }
    lines.push(`content: ${it.text}`)
  }

  if (packet.currentState.length > 0) {
    lines.push('', 'CURRENT STATE (structure only; the wording lives in the evidence above):')
    for (const s of packet.currentState) {
      lines.push(`- object ${s.objectId} | ${s.type} | status ${s.status} | v${s.version}` +
        ` | evidence ${s.evidenceIds.join(', ') || 'none'}`)
    }
  }
  if (packet.supersededState.length > 0) {
    lines.push('', 'EARLIER VERSIONS — history only, never the current position:')
    for (const s of packet.supersededState) {
      lines.push(`- object ${s.objectId} | ${s.type} | v${s.version} | replaced` +
        ` | evidence ${s.evidenceIds.join(', ') || 'none'}`)
    }
  }
  if (packet.changes.length > 0) {
    lines.push('', 'CHANGE RECORDS (structure only):')
    for (const c of packet.changes.slice(0, 15)) {
      lines.push(`- ${c.changeType} on object ${c.objectId} observed ${c.observedAt.toISOString()}` +
        ` | evidence ${c.evidenceIds.join(', ') || 'none'}`)
    }
  }
  return lines.join('\n')
}

function abstentionReason(packet: ContextPacket): string {
  return packet.health.decidedBy
    ? `context health INSUFFICIENT, decided by ${packet.health.decidedBy}`
    : 'context health INSUFFICIENT'
}

/** Says what is missing and what would let AVA answer. Never fakes certainty. */
function localAbstentionText(packet: ContextPacket): string {
  const lines = ['I do not have enough evidence to answer this reliably.']
  if (packet.gaps.length > 0) {
    lines.push('', 'What is missing:')
    for (const g of packet.gaps) lines.push(`- ${g}`)
  }
  lines.push('', packet.retrieved.length === 0
    ? 'I found no evidence in this workstream matching the question.'
    : `I do hold ${packet.retrieved.length} related item(s), listed below, but they do not support an answer.`)
  lines.push('', 'Capturing the missing information into this workstream would let me answer.')
  return lines.join('\n')
}

function boundaryAbstentionText(stage: string, reason: string): string {
  return [
    'I did not answer this one.',
    '',
    `The request stopped at the ${stage} stage: ${reason}.`,
    'Nothing was sent to a model, and no answer was produced.',
  ].join('\n')
}

function rejectionText(verdict: GroundingVerdict): string {
  const lines = [
    'I produced an answer and then discarded it, because it did not hold up against the evidence I supplied.',
    '',
    'What failed:',
  ]
  for (const f of verdict.failures) lines.push(`- ${f.kind}: ${f.detail}`)
  lines.push('', 'Showing it with a caveat would still be showing an unsupported claim.')
  return lines.join('\n')
}

function dedupe(xs: readonly string[]): string[] {
  return [...new Set(xs)]
}
