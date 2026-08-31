import { classifyQuery, projectCurrentState, ulid } from '@ava/core'
import { classify, isDenied } from '@ava/llm'
import type {
  ClassifiedQuery, ContextPacket, Exclusion, PacketChangeEntry, PacketStateEntry,
  RetrievalResult, StateObjectVersion,
} from '@ava/core'
import type { ChangeRepository, RetrievalRepository, StateRepository } from '@ava/db'
import { LexicalRetrieval } from './lexical'
import { assessHealth } from './health'

export interface PacketDeps {
  retrieval: RetrievalRepository
  state: StateRepository
  changes: ChangeRepository
}

export interface PacketRequest {
  question: string
  workstreamId: string
  asOf?: Date
  /** How many retrieved items may reach the provider. Cost and noise control. */
  maxProviderItems?: number
  /** Marks a synthetic development corpus as CLASS 0. */
  synthetic?: boolean
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
  const maxItems = req.maxProviderItems ?? DEFAULT_MAX_PROVIDER_ITEMS

  const versions = await deps.state.allVersions(req.workstreamId)
  const supersededEvidence = mapSupersededEvidence(versions)

  const strategy = new LexicalRetrieval(deps.retrieval)
  const started = Date.now()
  const retrieved = await strategy.search({
    workstreamId: req.workstreamId,
    terms: query.terms,
    asOf,
    supersededEvidence,
  })
  const retrievalLatencyMs = Date.now() - started

  const view = projectCurrentState({ workstreamId: req.workstreamId, versions, at: asOf })
  const changeRecords = await deps.changes.listByWorkstream(req.workstreamId, 25)

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
    declaredCognition: [],
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
