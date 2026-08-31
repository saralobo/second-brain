import { ulid } from '@ava/core'
import type {
  BehavioralHypothesis, BehavioralObservation, CognitionOrigin, CognitionScope,
  CognitionStatus, CognitionType, DeclaredCognition, EvidenceStrength,
  HypothesisStatus, Sensitivity,
} from '@ava/core'
import type { Database } from '../client'

/**
 * Declared Cognition and Behavioral Hypothesis storage.
 *
 * Declarations are versioned rather than updated. The ONLY mutation exposed
 * on a declaration is the supersession pointer and its status — the content a
 * user wrote is never rewritten, because the whole value of this table is
 * being able to answer "what did I actually tell you, and when?".
 */

function parseScope(raw: unknown): CognitionScope {
  const s = (raw ?? {}) as Record<string, unknown>
  return {
    workType: (s.workType as string) ?? null,
    workstreamId: (s.workstreamId as string) ?? null,
    activity: (s.activity as string) ?? null,
    decisionCategory: (s.decisionCategory as string) ?? null,
    artifactType: (s.artifactType as string) ?? null,
    validFrom: s.validFrom ? new Date(s.validFrom as string) : null,
    validUntil: s.validUntil ? new Date(s.validUntil as string) : null,
    exceptions: Array.isArray(s.exceptions) ? s.exceptions.map((e) => parseScope(e)) : [],
  }
}

function serialiseScope(scope: CognitionScope): string {
  return JSON.stringify({
    workType: scope.workType ?? null,
    workstreamId: scope.workstreamId ?? null,
    activity: scope.activity ?? null,
    decisionCategory: scope.decisionCategory ?? null,
    artifactType: scope.artifactType ?? null,
    validFrom: scope.validFrom?.toISOString() ?? null,
    validUntil: scope.validUntil?.toISOString() ?? null,
    exceptions: (scope.exceptions ?? []).map((e) => JSON.parse(serialiseScope(e))),
  })
}

function toCognition(r: Record<string, unknown>): DeclaredCognition {
  return {
    id: String(r.id),
    rootId: String(r.root_id),
    version: Number(r.version),
    content: String(r.content),
    cognitionType: r.cognition_type as CognitionType,
    scope: parseScope(r.scope),
    audience: r.audience ? String(r.audience) : null,
    declaredAt: new Date(r.declared_at as string),
    effectiveAt: r.effective_at ? new Date(r.effective_at as string) : null,
    supersededBy: r.superseded_by ? String(r.superseded_by) : null,
    status: r.status as CognitionStatus,
    origin: r.origin as CognitionOrigin,
    evidenceIds: (r.evidence_ids ?? []) as string[],
    confirmsHypothesisId: r.confirms_hypothesis_id ? String(r.confirms_hypothesis_id) : null,
    workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    sensitivity: r.sensitivity as Sensitivity,
    strength: r.strength as EvidenceStrength,
  }
}

export interface DeclareInput {
  content: string
  cognitionType: CognitionType
  scope?: CognitionScope
  audience?: string | null
  declaredAt: Date
  effectiveAt?: Date | null
  origin: CognitionOrigin
  evidenceIds: readonly string[]
  confirmsHypothesisId?: string | null
  workstreamId?: string | null
  sensitivity?: Sensitivity
  /** Present when this is a new version of an existing declaration. */
  rootId?: string
  version?: number
}

export class DeclaredCognitionRepository {
  constructor(private readonly db: Database) {}

  async declare(input: DeclareInput): Promise<DeclaredCognition> {
    if (input.evidenceIds.length === 0) {
      throw new Error('a declaration requires evidence: the user\'s own words must be in the ledger')
    }
    const id = ulid(input.declaredAt.getTime())
    await this.db.query(
      `INSERT INTO declared_cognition (
         id, root_id, version, content, cognition_type, scope, audience,
         declared_at, effective_at, status, origin, evidence_ids,
         confirms_hypothesis_id, workstream_id, sensitivity, strength
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13,$14,'ESTABLISHED')`,
      [
        id, input.rootId ?? id, input.version ?? 1, input.content.trim(), input.cognitionType,
        serialiseScope(input.scope ?? {}), input.audience ?? null,
        input.declaredAt.toISOString(), input.effectiveAt?.toISOString() ?? null,
        input.origin, JSON.stringify([...input.evidenceIds]),
        input.confirmsHypothesisId ?? null, input.workstreamId ?? null,
        input.sensitivity ?? 'normal',
      ],
    )
    const created = await this.findById(id)
    if (!created) throw new Error('declaration did not persist')
    return created
  }

  /**
   * Marks a declaration replaced. The only permitted mutation, it writes a
   * pointer and a status and never touches content. Refused when the row is
   * already superseded: history is not rewritten.
   */
  async markSuperseded(id: string, successorId: string): Promise<void> {
    const res = await this.db.query<{ superseded_by: string | null }>(
      'SELECT superseded_by FROM declared_cognition WHERE id = $1', [id])
    const row = res.rows[0]
    if (!row) throw new Error(`unknown declaration ${id}`)
    if (row.superseded_by !== null) {
      throw new Error('declaration is already superseded; history cannot be rewritten')
    }
    await this.db.query(
      "UPDATE declared_cognition SET superseded_by = $2, status = 'superseded' WHERE id = $1",
      [id, successorId],
    )
  }

  async revoke(id: string): Promise<void> {
    await this.db.query(
      "UPDATE declared_cognition SET status = 'revoked' WHERE id = $1 AND status = 'active'",
      [id],
    )
  }

  async findById(id: string): Promise<DeclaredCognition | null> {
    const res = await this.db.query('SELECT * FROM declared_cognition WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toCognition(row) : null
  }

  /** Current declarations only. Superseded ones stay readable through history. */
  async listActive(workstreamId?: string | null): Promise<DeclaredCognition[]> {
    const res = workstreamId
      ? await this.db.query(
          `SELECT * FROM declared_cognition
            WHERE status = 'active' AND (workstream_id = $1 OR workstream_id IS NULL)
            ORDER BY declared_at DESC`, [workstreamId])
      : await this.db.query(
          "SELECT * FROM declared_cognition WHERE status = 'active' ORDER BY declared_at DESC")
    return res.rows.map(toCognition)
  }

  async listAll(): Promise<DeclaredCognition[]> {
    const res = await this.db.query('SELECT * FROM declared_cognition ORDER BY declared_at DESC')
    return res.rows.map(toCognition)
  }

  /** The full version chain, oldest first. This is the correction history. */
  async history(rootId: string): Promise<DeclaredCognition[]> {
    const res = await this.db.query(
      'SELECT * FROM declared_cognition WHERE root_id = $1 ORDER BY version', [rootId])
    return res.rows.map(toCognition)
  }

  async latestVersion(rootId: string): Promise<DeclaredCognition | null> {
    const res = await this.db.query(
      'SELECT * FROM declared_cognition WHERE root_id = $1 ORDER BY version DESC LIMIT 1', [rootId])
    const row = res.rows[0]
    return row ? toCognition(row) : null
  }

  /** Subjects the user asked AVA never to infer about (spec §15.1). */
  async neverInferSubjects(): Promise<string[]> {
    const res = await this.db.query<{ content: string }>(
      `SELECT content FROM declared_cognition
        WHERE cognition_type = 'never_infer_subject' AND status = 'active'`)
    return res.rows.map((r) => r.content)
  }
}

// ---------------------------------------------------------------------------

function toHypothesis(r: Record<string, unknown>): BehavioralHypothesis {
  return {
    id: String(r.id),
    falsifiableDescription: String(r.falsifiable_description),
    knowledgeOrigin: 'observed',
    context: String(r.context),
    scope: parseScope(r.scope),
    evidenceIds: (r.evidence_ids ?? []) as string[],
    counterEvidenceIds: (r.counter_evidence_ids ?? []) as string[],
    confirmationOpportunitiesObserved: Number(r.confirmation_opportunities_observed ?? 0),
    alternativesAvailable: (r.alternatives_available ?? []) as string[],
    possibleConfounder: r.possible_confounder ? String(r.possible_confounder) : null,
    status: r.status as HypothesisStatus,
    strength: r.strength as EvidenceStrength,
    costOfMisapplication: r.cost_of_misapplication as BehavioralHypothesis['costOfMisapplication'],
    shadowMode: true,
    workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    sensitivity: r.sensitivity as Sensitivity,
    createdAt: new Date(r.created_at as string),
    confirmedByCognitionId: r.confirmed_by_cognition_id ? String(r.confirmed_by_cognition_id) : null,
    rejectedReason: r.rejected_reason ? String(r.rejected_reason) : null,
  }
}

export interface HypothesisInput {
  falsifiableDescription: string
  context: string
  scope?: CognitionScope
  evidenceIds: readonly string[]
  alternativesAvailable: readonly string[]
  possibleConfounder?: string | null
  costOfMisapplication?: 'low' | 'medium' | 'high'
  workstreamId?: string | null
  confirmationOpportunitiesObserved?: number
}

export class BehavioralHypothesisRepository {
  constructor(private readonly db: Database) {}

  async create(input: HypothesisInput): Promise<BehavioralHypothesis> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO behavioral_hypothesis (
         id, falsifiable_description, context, scope, evidence_ids,
         alternatives_available, possible_confounder, cost_of_misapplication,
         workstream_id, confirmation_opportunities_observed
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, input.falsifiableDescription.trim(), input.context,
        serialiseScope(input.scope ?? {}), JSON.stringify([...input.evidenceIds]),
        JSON.stringify([...input.alternativesAvailable]), input.possibleConfounder ?? null,
        input.costOfMisapplication ?? 'low', input.workstreamId ?? null,
        input.confirmationOpportunitiesObserved ?? 0,
      ],
    )
    const created = await this.findById(id)
    if (!created) throw new Error('hypothesis did not persist')
    return created
  }

  async findById(id: string): Promise<BehavioralHypothesis | null> {
    const res = await this.db.query('SELECT * FROM behavioral_hypothesis WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toHypothesis(row) : null
  }

  async list(workstreamId?: string | null): Promise<BehavioralHypothesis[]> {
    const res = workstreamId
      ? await this.db.query(
          `SELECT * FROM behavioral_hypothesis
            WHERE workstream_id = $1 OR workstream_id IS NULL ORDER BY created_at DESC`,
          [workstreamId])
      : await this.db.query('SELECT * FROM behavioral_hypothesis ORDER BY created_at DESC')
    return res.rows.map(toHypothesis)
  }

  /** Counter-evidence is appended, never replaced: disagreement accumulates. */
  async addCounterEvidence(id: string, evidenceId: string): Promise<void> {
    await this.db.query(
      `UPDATE behavioral_hypothesis
          SET counter_evidence_ids = counter_evidence_ids || to_jsonb($2::text),
              status = 'contradicted'
        WHERE id = $1`,
      [id, evidenceId],
    )
  }

  async reject(id: string, reason: string): Promise<void> {
    await this.db.query(
      "UPDATE behavioral_hypothesis SET status = 'contradicted', rejected_reason = $2 WHERE id = $1",
      [id, reason],
    )
  }

  /**
   * Links a hypothesis to the declaration the user created from it.
   *
   * This does NOT promote the hypothesis. The declaration carries the
   * authority; this row keeps the trail showing where the question came from.
   */
  async markConfirmed(id: string, cognitionId: string): Promise<void> {
    await this.db.query(
      "UPDATE behavioral_hypothesis SET status = 'confirmed', confirmed_by_cognition_id = $2 WHERE id = $1",
      [id, cognitionId],
    )
  }

  async recordConflict(hypothesisId: string, cognitionId: string, detail: string): Promise<string> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO cognition_conflict (id, hypothesis_id, cognition_id, detail) VALUES ($1,$2,$3,$4)`,
      [id, hypothesisId, cognitionId, detail],
    )
    return id
  }

  async openConflicts(): Promise<{ id: string; hypothesisId: string; cognitionId: string; detail: string }[]> {
    const res = await this.db.query<{ id: string; hypothesis_id: string; cognition_id: string; detail: string }>(
      'SELECT * FROM cognition_conflict WHERE resolved = false ORDER BY detected_at DESC')
    return res.rows.map((r) => ({
      id: r.id, hypothesisId: r.hypothesis_id, cognitionId: r.cognition_id, detail: r.detail,
    }))
  }
}

// ---------------------------------------------------------------------------

export class BehavioralObservationRepository {
  constructor(private readonly db: Database) {}

  async record(input: Omit<BehavioralObservation, 'id'>): Promise<string> {
    const id = ulid(input.observedAt.getTime())
    await this.db.query(
      `INSERT INTO behavioral_observation (
         id, description, context, evidence_ids, alternatives_available,
         content_origin, observed_at, workstream_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id, input.description, input.context, JSON.stringify([...input.evidenceIds]),
        JSON.stringify([...input.alternativesAvailable]), input.contentOrigin,
        input.observedAt.toISOString(), input.workstreamId ?? null,
      ],
    )
    return id
  }

  async list(workstreamId?: string | null): Promise<BehavioralObservation[]> {
    const res = workstreamId
      ? await this.db.query('SELECT * FROM behavioral_observation WHERE workstream_id = $1 ORDER BY observed_at DESC', [workstreamId])
      : await this.db.query('SELECT * FROM behavioral_observation ORDER BY observed_at DESC')
    return res.rows.map((r) => ({
      id: String(r.id),
      description: String(r.description),
      context: String(r.context),
      evidenceIds: (r.evidence_ids ?? []) as string[],
      alternativesAvailable: (r.alternatives_available ?? []) as string[],
      contentOrigin: r.content_origin as BehavioralObservation['contentOrigin'],
      observedAt: new Date(r.observed_at as string),
      workstreamId: r.workstream_id ? String(r.workstream_id) : null,
    }))
  }
}
