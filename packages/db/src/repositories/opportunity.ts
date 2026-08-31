import { ulid } from '@ava/core'
import type {
  AffectedObject, EvidenceStrength, GateReport, OpportunityCandidate,
  OpportunityClass, OpportunityStatus, PolicyOutcome, ValueVector,
} from '@ava/core'
import type { Database } from '../client'

/**
 * Opportunity persistence (S5-T01).
 *
 * Split in two on purpose. `opportunity` carries the mutable lifecycle;
 * `opportunity_generation` carries what AVA could see when it decided, and is
 * append-only at the database. A later checkpoint therefore cannot rewrite an
 * earlier judgement with information that arrived afterwards.
 */
export interface StoredOpportunity extends OpportunityCandidate {
  shownAt: Date | null
  preparedAt: Date | null
  suppressedReason: string | null
  ruleId: string
  ruleVersion: string
  shadowHypothesisIds: string[]
}

export interface SaveOpportunityInput {
  candidate: OpportunityCandidate
  ruleId: string
  ruleVersion: string
  policyVersion: string
  shadowHypothesisIds: readonly string[]
  suppressedReason: string | null
}

export class OpportunityRepository {
  constructor(private readonly db: Database) {}

  async save(input: SaveOpportunityInput): Promise<string> {
    const c = input.candidate
    await this.db.query(
      `INSERT INTO opportunity (
         id, identity_key, version, supersedes_id, opportunity_class, workstream_id,
         status, headline, detail, minimal_action, strength, context_health,
         content_origin, suppressed_reason, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        c.id, c.identityKey, c.version, c.supersedesOpportunityId, c.opportunityClass,
        c.workstreamId, c.status, c.headline, c.detail, c.minimalAction, c.strength,
        c.contextHealth, c.contentOrigin, input.suppressedReason,
        c.expiresAt ? c.expiresAt.toISOString() : null,
      ],
    )
    await this.db.query(
      `INSERT INTO opportunity_generation (
         id, opportunity_id, checkpoint_id, generated_at, rule_id, rule_version, policy_version,
         trigger_change_ids, origin_evidence_ids, affected_objects,
         value_vector, gates, investigate, show, prepare,
         known_evidence_ids, known_state_version_ids, latest_evidence_observed_at,
         shadow_hypothesis_ids, decision_record_ids
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        ulid(c.generation.generatedAt.getTime()), c.id, c.generation.checkpointId,
        c.generation.generatedAt.toISOString(), input.ruleId, input.ruleVersion, input.policyVersion,
        JSON.stringify(c.triggerChangeIds), JSON.stringify(c.originEvidenceIds),
        JSON.stringify(c.affectedObjects), JSON.stringify(c.valueVector),
        JSON.stringify(c.gates), JSON.stringify(c.investigate), JSON.stringify(c.show),
        JSON.stringify(c.prepare), JSON.stringify(c.generation.knownEvidenceIds),
        JSON.stringify(c.generation.knownStateVersionIds),
        c.generation.latestEvidenceObservedAt
          ? c.generation.latestEvidenceObservedAt.toISOString() : null,
        JSON.stringify(input.shadowHypothesisIds), JSON.stringify(c.decisionRecordIds),
      ],
    )
    return c.id
  }

  /**
   * Moves an opportunity's lifecycle state. `shown_at` records DELIVERY by the
   * server — never that the user read it. `seen` needs client observability
   * that does not exist, and approximating it would corrupt the timeline the
   * prospective study depends on.
   */
  async markStatus(
    id: string, status: OpportunityStatus, at: Date = new Date(), reason: string | null = null,
  ): Promise<void> {
    const stamp = status === 'shown' ? 'shown_at' : status === 'prepared' ? 'prepared_at' : null
    if (stamp !== null) {
      await this.db.query(
        `UPDATE opportunity SET status = $2, suppressed_reason = COALESCE($4, suppressed_reason),
                ${stamp} = COALESCE(${stamp}, $3)
         WHERE id = $1`,
        [id, status, at.toISOString(), reason],
      )
      return
    }
    await this.db.query(
      `UPDATE opportunity SET status = $2, suppressed_reason = COALESCE($3, suppressed_reason)
       WHERE id = $1`,
      [id, status, reason],
    )
  }

  async findById(id: string): Promise<StoredOpportunity | null> {
    const res = await this.db.query(`${SELECT_JOINED} WHERE o.id = $1`, [id])
    const row = res.rows[0]
    return row ? toOpportunity(row) : null
  }

  /** The live version of an identity, if any. Terminal states are excluded. */
  async activeByIdentity(identityKey: string): Promise<StoredOpportunity | null> {
    const res = await this.db.query(
      `${SELECT_JOINED} WHERE o.identity_key = $1 AND o.status NOT IN ('superseded','expired')
       ORDER BY o.version DESC LIMIT 1`,
      [identityKey],
    )
    const row = res.rows[0]
    return row ? toOpportunity(row) : null
  }

  async listByWorkstream(
    workstreamId: string, statuses: readonly OpportunityStatus[] = [], limit = 100,
  ): Promise<StoredOpportunity[]> {
    const clause = statuses.length > 0
      ? `AND o.status = ANY($2)` : ''
    const params: unknown[] = statuses.length > 0
      ? [workstreamId, statuses, limit] : [workstreamId, limit]
    const limitParam = statuses.length > 0 ? '$3' : '$2'
    const res = await this.db.query(
      `${SELECT_JOINED} WHERE o.workstream_id = $1 ${clause}
       ORDER BY o.created_at DESC LIMIT ${limitParam}`,
      params,
    )
    return res.rows.map(toOpportunity)
  }

  /** Whether an identity has ever been delivered. Feeds novelty honestly. */
  async everShown(identityKey: string): Promise<boolean> {
    const res = await this.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM opportunity
       WHERE identity_key = $1 AND shown_at IS NOT NULL`,
      [identityKey],
    )
    return Number(res.rows[0]?.n ?? '0') > 0
  }

  async expireDue(now: Date = new Date()): Promise<number> {
    const res = await this.db.query(
      `UPDATE opportunity SET status = 'expired'
       WHERE expires_at IS NOT NULL AND expires_at < $1
         AND status NOT IN ('superseded','expired')`,
      [now.toISOString()],
    )
    return res.rows.length
  }

  async attachDecisionRecord(): Promise<void> {
    // Deliberately absent. `opportunity_generation` is append-only, so a
    // DecisionRecord id is written with the row or not at all — attaching a
    // rationale afterwards is precisely the retroactive edit this forbids.
    throw new Error('decision record ids are written at generation time and cannot be attached later')
  }
}

const SELECT_JOINED = `
  SELECT o.*, g.rule_id, g.rule_version, g.policy_version, g.generated_at, g.checkpoint_id,
         g.trigger_change_ids, g.origin_evidence_ids, g.affected_objects, g.value_vector,
         g.gates, g.investigate, g.show, g.prepare, g.known_evidence_ids,
         g.known_state_version_ids, g.latest_evidence_observed_at,
         g.shadow_hypothesis_ids, g.decision_record_ids
  FROM opportunity o JOIN opportunity_generation g ON g.opportunity_id = o.id`

function toOpportunity(r: Record<string, unknown>): StoredOpportunity {
  return {
    id: String(r.id),
    identityKey: String(r.identity_key),
    opportunityClass: r.opportunity_class as OpportunityClass,
    workstreamId: String(r.workstream_id),
    status: r.status as OpportunityStatus,
    triggerChangeIds: (r.trigger_change_ids ?? []) as string[],
    originEvidenceIds: (r.origin_evidence_ids ?? []) as string[],
    impactedFrom: null,
    affectedObjects: (r.affected_objects ?? []) as AffectedObject[],
    headline: String(r.headline),
    detail: String(r.detail),
    minimalAction: r.minimal_action ? String(r.minimal_action) : null,
    strength: r.strength as EvidenceStrength,
    contextHealth: r.context_health as StoredOpportunity['contextHealth'],
    contentOrigin: 'system',
    valueVector: r.value_vector as ValueVector,
    gates: r.gates as GateReport,
    investigate: r.investigate as PolicyOutcome,
    show: r.show as PolicyOutcome,
    prepare: r.prepare as PolicyOutcome,
    generation: {
      generatedAt: new Date(r.generated_at as string),
      checkpointId: r.checkpoint_id ? String(r.checkpoint_id) : null,
      knownEvidenceIds: (r.known_evidence_ids ?? []) as string[],
      knownStateVersionIds: (r.known_state_version_ids ?? []) as string[],
      latestEvidenceObservedAt: r.latest_evidence_observed_at
        ? new Date(r.latest_evidence_observed_at as string) : null,
    },
    version: Number(r.version),
    supersedesOpportunityId: r.supersedes_id ? String(r.supersedes_id) : null,
    decisionRecordIds: (r.decision_record_ids ?? []) as string[],
    expiresAt: r.expires_at ? new Date(r.expires_at as string) : null,
    shownAt: r.shown_at ? new Date(r.shown_at as string) : null,
    preparedAt: r.prepared_at ? new Date(r.prepared_at as string) : null,
    suppressedReason: r.suppressed_reason ? String(r.suppressed_reason) : null,
    ruleId: String(r.rule_id),
    ruleVersion: String(r.rule_version),
    shadowHypothesisIds: (r.shadow_hypothesis_ids ?? []) as string[],
  }
}

/** Prepared artifacts. Internal to AVA — nothing here reaches the outside. */
export interface PreparedArtifact {
  id: string
  opportunityId: string
  kind: string
  title: string
  body: string
  executionMode: 'mock' | 'external' | 'local_only'
  modelRunId: string | null
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  status: 'available' | 'discarded' | 'expired'
  preparedAt: Date
}

export class PreparedArtifactRepository {
  constructor(private readonly db: Database) {}

  async create(input: Omit<PreparedArtifact, 'id' | 'status'>): Promise<PreparedArtifact> {
    const id = ulid(input.preparedAt.getTime())
    await this.db.query(
      `INSERT INTO prepared_artifact (
         id, opportunity_id, kind, title, body, execution_mode, model_run_id,
         estimated_cost_usd, actual_cost_usd, prepared_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, input.opportunityId, input.kind, input.title, input.body, input.executionMode,
        input.modelRunId, input.estimatedCostUsd, input.actualCostUsd,
        input.preparedAt.toISOString(),
      ],
    )
    return { ...input, id, status: 'available' }
  }

  async listForOpportunity(opportunityId: string): Promise<PreparedArtifact[]> {
    const res = await this.db.query(
      `SELECT * FROM prepared_artifact WHERE opportunity_id = $1 ORDER BY prepared_at DESC`,
      [opportunityId],
    )
    return res.rows.map(toArtifact)
  }

  async listAvailable(workstreamId: string): Promise<PreparedArtifact[]> {
    const res = await this.db.query(
      `SELECT p.* FROM prepared_artifact p JOIN opportunity o ON o.id = p.opportunity_id
       WHERE o.workstream_id = $1 AND p.status = 'available' ORDER BY p.prepared_at DESC`,
      [workstreamId],
    )
    return res.rows.map(toArtifact)
  }

  async discard(id: string): Promise<void> {
    await this.db.query(`UPDATE prepared_artifact SET status = 'discarded' WHERE id = $1`, [id])
  }

  /** Preparation economics (spec §12): prepared, used and wasted are counted. */
  async costs(workstreamId: string): Promise<{
    prepared: number; discarded: number; totalCostUsd: number
  }> {
    const res = await this.db.query<{ status: string; n: string; cost: string | null }>(
      `SELECT p.status, count(*)::text AS n, COALESCE(sum(p.actual_cost_usd),0)::text AS cost
       FROM prepared_artifact p JOIN opportunity o ON o.id = p.opportunity_id
       WHERE o.workstream_id = $1 GROUP BY p.status`,
      [workstreamId],
    )
    let prepared = 0, discarded = 0, totalCostUsd = 0
    for (const row of res.rows) {
      prepared += Number(row.n)
      if (row.status === 'discarded') discarded += Number(row.n)
      totalCostUsd += Number(row.cost ?? '0')
    }
    return { prepared, discarded, totalCostUsd }
  }
}

function toArtifact(r: Record<string, unknown>): PreparedArtifact {
  return {
    id: String(r.id),
    opportunityId: String(r.opportunity_id),
    kind: String(r.kind),
    title: String(r.title),
    body: String(r.body),
    executionMode: r.execution_mode as PreparedArtifact['executionMode'],
    modelRunId: r.model_run_id ? String(r.model_run_id) : null,
    estimatedCostUsd: r.estimated_cost_usd === null || r.estimated_cost_usd === undefined
      ? null : Number(r.estimated_cost_usd),
    actualCostUsd: r.actual_cost_usd === null || r.actual_cost_usd === undefined
      ? null : Number(r.actual_cost_usd),
    status: r.status as PreparedArtifact['status'],
    preparedAt: new Date(r.prepared_at as string),
  }
}
