import {
  applicableDeclarations, applicableHypotheses, authorityOf, classifyQuery,
  describeScope, projectCurrentState, ulid,
} from '@ava/core'
import { classify, isDenied } from '@ava/llm'
import type {
  ClassifiedQuery, CognitionContext, ContextPacket, Exclusion, PacketChangeEntry,
  PacketCognitionEntry, PacketHypothesisEntry, PacketKnowledgeEntry, PacketStateEntry,
  RetrievalResult, StateObjectVersion,
} from '@ava/core'
import type {
  BehavioralHypothesisRepository, ChangeRepository, DeclaredCognitionRepository,
  EvidenceRepository, MemoryRepository, RetrievalRepository, StateRepository,
} from '@ava/db'
import { LexicalRetrieval } from './lexical'
import { assessHealth } from './health'

export interface PacketDeps {
  retrieval: RetrievalRepository
  state: StateRepository
  changes: ChangeRepository
  cognition: DeclaredCognitionRepository
  hypotheses: BehavioralHypothesisRepository
  memory: MemoryRepository
  evidence: EvidenceRepository
}

export interface PacketRequest {
  question: string
  workstreamId: string
  asOf?: Date
  /** How many retrieved items may reach the provider. Cost and noise control. */
  maxProviderItems?: number
  /** Marks a synthetic development corpus as CLASS 0. */
  synthetic?: boolean
  /**
   * The situation being asked about, used for scope matching.
   *
   * A declaration applies only when its scope matches. Leaving this empty
   * means only unscoped declarations apply — the conservative reading, and the
   * one that keeps a contextual preference from becoming a global one.
   */
  cognitionContext?: CognitionContext
}

export interface PacketBuildResult {
  packet: ContextPacket
  /** Wall-clock retrieval time, for the observability record. */
  retrievalLatencyMs: number
  candidateCount: number
  strategy: string
}

const DEFAULT_MAX_PROVIDER_ITEMS = 8

/**
 * Context Packet assembly (S3-T03).
 *
 * The packet is built, inspected and recorded as an object. It is never a
 * prompt string: exclusions and gaps are the parts most likely to be wrong,
 * and a concatenated string cannot be audited for what is missing from it.
 */
export async function buildContextPacket(
  deps: PacketDeps,
  req: PacketRequest,
): Promise<PacketBuildResult> {
  const asOf = req.asOf ?? new Date()
  const query: ClassifiedQuery = classifyQuery(req.question)
  const scopeExclusions: Exclusion[] = []
  const maxItems = req.maxProviderItems ?? DEFAULT_MAX_PROVIDER_ITEMS

  const versions = await deps.state.allVersions(req.workstreamId)
  const supersededEvidence = mapSupersededEvidence(versions)

  const strategy = new LexicalRetrieval(deps.retrieval)
  const started = Date.now()
  const retrieved: RetrievalResult[] = await strategy.search({
    workstreamId: req.workstreamId,
    terms: query.terms,
    asOf,
    supersededEvidence,
  })
  const retrievalLatencyMs = Date.now() - started

  const view = projectCurrentState({ workstreamId: req.workstreamId, versions, at: asOf })
  const changeRecords = await deps.changes.listByWorkstream(req.workstreamId, 25)

  // Personal cognition. Loaded through the authority rules rather than as a
  // plain list, so a declaration whose scope does not cover this situation is
  // never carried in as if it did.
  const cognitionContext: CognitionContext = {
    workstreamId: req.workstreamId,
    ...req.cognitionContext,
    at: asOf,
  }
  const [allCognition, allHypotheses, stabilized] = await Promise.all([
    deps.cognition.listAll(),
    deps.hypotheses.list(req.workstreamId),
    deps.memory.listByClass('semantic_stabilized', req.workstreamId),
  ])
  const inScopeCognition = allCognition.filter(
    (c) => c.workstreamId === null || c.workstreamId === req.workstreamId)

  const applicable = applicableDeclarations(inScopeCognition, cognitionContext)
  const declaredCognition: PacketCognitionEntry[] = applicable.map((a) => ({
    cognitionId: a.declaration.id,
    content: a.declaration.content,
    cognitionType: a.declaration.cognitionType,
    scopeDescription: describeScope(a.declaration.scope),
    matchReason: a.reason,
    specificity: a.specificity,
    declaredAt: a.declaration.declaredAt,
    origin: a.declaration.origin,
    evidenceIds: a.declaration.evidenceIds,
    authority: authorityOf(a.declaration) === 'CONFIRMED' ? 'CONFIRMED' : 'DECLARED',
  }))

  const applicableIds = new Set(declaredCognition.map((d) => d.cognitionId))
  const supersededCognition: PacketCognitionEntry[] = inScopeCognition
    .filter((c) => c.status !== 'active')
    .map((c) => ({
      cognitionId: c.id,
      content: c.content,
      cognitionType: c.cognitionType,
      scopeDescription: describeScope(c.scope),
      matchReason: `${c.status}; kept as history`,
      specificity: 0,
      declaredAt: c.declaredAt,
      origin: c.origin,
      evidenceIds: c.evidenceIds,
      authority: 'DECLARED' as const,
    }))

  // Active declarations whose scope does NOT cover this situation are an
  // exclusion, not an omission: the user should be able to see that AVA held
  // something back because she scoped it elsewhere.
  for (const c of inScopeCognition) {
    if (c.status !== 'active' || applicableIds.has(c.id)) continue
    scopeExclusions.push({
      evidenceId: c.id,
      reason: 'scope_does_not_match',
      detail: `declared for ${describeScope(c.scope)}, which does not cover this question`,
    })
  }

  const behavioralHypotheses: PacketHypothesisEntry[] =
    applicableHypotheses(allHypotheses, cognitionContext).map((h) => ({
      hypothesisId: h.id,
      falsifiableDescription: h.falsifiableDescription,
      context: h.context,
      scopeDescription: describeScope(h.scope),
      status: h.status,
      alternativesAvailable: h.alternativesAvailable,
      evidenceIds: h.evidenceIds,
      counterEvidenceIds: h.counterEvidenceIds,
      authority: 'HYPOTHESIS' as const,
    }))

  // The words behind an applicable declaration are retrieved by SCOPE, not by
  // wording. Lexical search would miss them whenever the user phrased her
  // preference differently from the question — and then a personal question
  // would arrive at the boundary with nothing to answer from, even though the
  // declaration that answers it is sitting right there.
  const declarationEvidenceIds = declaredCognition.flatMap((c) => [...c.evidenceIds])
  const alreadyRetrieved = new Set(retrieved.map((r) => r.evidenceId))
  const missing = declarationEvidenceIds.filter((id) => !alreadyRetrieved.has(id))
  if (missing.length > 0) {
    const rows = await deps.evidence.findForBoundary(missing)
    for (const e of rows) {
      retrieved.push({
        evidenceId: e.id,
        sourceRecordId: e.sourceRecordId,
        workstreamId: e.workstreamId,
        title: e.title,
        excerpt: e.content,
        captureType: e.captureType,
        observedAt: e.observedAt,
        effectiveAt: e.effectiveAt,
        contentOrigin: e.contentOrigin,
        strength: e.strength,
        sensitivity: e.sensitivity,
        supersededByObjectVersion: supersededEvidence.get(e.id) ?? null,
        score: 0,
        reason: 'carries the wording of a declaration that applies to this context',
      })
    }
  }

  const stabilizedKnowledge: PacketKnowledgeEntry[] = stabilized.map((m) => ({
    memoryRecordId: m.id,
    title: m.title,
    strength: m.strength,
    derivedFromEvidenceIds: m.derivedFromEvidenceIds,
    promotedAt: m.promotedAt,
  }))

  const toEntry = (objectId: string, type: string, v: StateObjectVersion): PacketStateEntry => ({
    objectId,
    type,
    title: v.title,
    status: v.status,
    version: v.version,
    observedAt: v.observedAt,
    strength: v.strength,
    evidenceIds: v.evidenceIds,
    superseded: v.supersededBy !== null,
  })

  const currentState: PacketStateEntry[] = view.entries.map((e) => toEntry(e.objectId, e.type, e.current))
  const supersededState: PacketStateEntry[] = view.entries.flatMap((e) =>
    e.superseded.map((v) => toEntry(e.objectId, e.type, v)))

  const changes: PacketChangeEntry[] = changeRecords.map((c) => ({
    changeId: c.id,
    objectId: c.objectId,
    changeType: c.changeType,
    observedAt: c.observedAt,
    changedFields: c.changedFields,
    evidenceIds: c.evidenceIds,
    strength: c.strength,
    contradictionFlag: c.contradictionFlag,
  }))

  // Conflicts are carried, not resolved. Resolving them here would hide the
  // disagreement behind whichever item happened to rank higher.
  const conflicts: string[] = []
  for (const c of changeRecords) {
    if (c.contradictionFlag) {
      conflicts.push(`change ${c.id} on object ${c.objectId} carries an unresolved contradiction flag`)
    }
    if (c.status === 'candidate') {
      conflicts.push(`change ${c.id} is a candidate awaiting review; its interpretation is not settled`)
    }
  }

  // Provider eligibility. Local knowledge is broader than what may be sent:
  // an item excluded here is still visible in the UI and still counted in
  // health — it simply does not cross the boundary.
  const { eligible, exclusions } = selectForProvider(retrieved, maxItems, req.synthetic === true)
  exclusions.push(...scopeExclusions)

  const signals = await deps.retrieval.healthSignals(req.workstreamId)
  const withheldByPolicy = exclusions.filter(
    (e) => e.reason === 'restricted_sensitivity' || e.reason === 'system_origin',
  )
  const health = assessHealth({
    queryKind: query.kind,
    signals,
    retrieved,
    withheldCount: withheldByPolicy.length,
    // Material only when policy left nothing to answer from.
    //
    // An earlier version also treated "the top-ranked hit was withheld" as
    // material. That was too blunt: lexical rank is not importance, and it
    // turned answerable questions into abstentions whenever a restricted item
    // happened to match the wording best. Withholding that still leaves usable
    // evidence is a DEGRADED answer with the gap named — not silence.
    withheldMaterial: withheldByPolicy.length > 0 && eligible.length === 0,
    declaredCognitionCount: declaredCognition.length,
    hypothesisCount: behavioralHypotheses.length,
    now: asOf,
  })

  const gaps = [...health.gaps]
  if (query.kind === 'unknown') {
    gaps.push('question shape not recognised; retrieval used plain keyword matching')
  }

  const packet: ContextPacket = {
    id: ulid(asOf.getTime()),
    question: req.question,
    query,
    workstreamId: req.workstreamId,
    builtAt: asOf,
    retrieved,
    currentState,
    supersededState,
    changes,
    conflicts,
    gaps,
    declaredCognition,
    supersededCognition,
    stabilizedKnowledge,
    behavioralHypotheses,
    health,
    exclusions,
    providerEligibleEvidenceIds: eligible.map((r) => r.evidenceId),
  }

  return { packet, retrievalLatencyMs, candidateCount: retrieved.length, strategy: strategy.name }
}

/**
 * Which retrieved items may cross the provider boundary.
 *
 * Restricted content and AVA's own output are removed on policy grounds; the
 * rest is capped so a broad question cannot quietly ship the whole workstream
 * to a provider.
 */
function selectForProvider(
  retrieved: readonly RetrievalResult[],
  maxItems: number,
  synthetic: boolean,
): { eligible: RetrievalResult[]; exclusions: Exclusion[] } {
  const exclusions: Exclusion[] = []
  const allowed: RetrievalResult[] = []

  for (const r of retrieved) {
    const dataClass = classify({
      contentOrigin: r.contentOrigin,
      sensitivity: r.sensitivity,
      synthetic,
    })
    if (isDenied(dataClass)) {
      exclusions.push({
        evidenceId: r.evidenceId,
        reason: r.contentOrigin === 'system' && r.sensitivity !== 'restricted'
          ? 'system_origin'
          : 'restricted_sensitivity',
        // Names the exclusion without revealing what was withheld.
        detail: r.contentOrigin === 'system' && r.sensitivity !== 'restricted'
          ? 'AVA-generated content cannot be used as evidence for AVA'
          : 'classified restricted; may not cross the provider boundary',
      })
      continue
    }
    allowed.push(r)
  }

  const eligible = allowed.slice(0, maxItems)
  for (const r of allowed.slice(maxItems)) {
    exclusions.push({
      evidenceId: r.evidenceId,
      reason: 'below_selection_limit',
      detail: `ranked below the top ${maxItems} for this question`,
    })
  }
  return { eligible, exclusions }
}

/** Evidence whose supporting state version has since been replaced. */
function mapSupersededEvidence(versions: readonly StateObjectVersion[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const v of versions) {
    if (v.supersededBy === null) continue
    for (const id of v.evidenceIds) map.set(id, v.supersededBy)
  }
  // Evidence attached to a still-current version wins: the same item may
  // support both an old and a new version, and current takes precedence.
  for (const v of versions) {
    if (v.supersededBy !== null) continue
    for (const id of v.evidenceIds) map.delete(id)
  }
  return map
}
