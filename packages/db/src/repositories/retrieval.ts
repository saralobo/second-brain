import type { ContentOrigin, EvidenceStrength, Sensitivity } from '@ava/core'
import type { Database } from '../client'

/**
 * Lexical retrieval over the generated `fts` column (S3-T02).
 *
 * Phase 1 only: full-text, no embeddings, no pgvector, no learned ranking.
 * The interface is shaped so a second strategy can be added beside it later
 * without the caller changing — but a semantic index is a Slice 5+ decision
 * and is not implemented merely because a model exists.
 *
 * Effective sensitivity is resolved HERE, in the same query, so no caller can
 * accidentally read the stale value from the evidence row (F-01).
 */
export interface LexicalHit {
  id: string
  sourceRecordId: string
  workstreamId: string | null
  title: string | null
  content: string
  captureType: string
  observedAt: Date
  effectiveAt: Date | null
  contentOrigin: ContentOrigin
  strength: EvidenceStrength
  /** Effective, annotation-aware. Never the raw column. */
  sensitivity: Sensitivity
  score: number
}

export interface LexicalQuery {
  /** Retrieval is scoped to one workstream by default (Slice 3 brief §24). */
  workstreamId: string
  terms: readonly string[]
  limit?: number
  /** Only evidence observed at or before this instant. */
  asOf?: Date
}

interface Row {
  id: string
  source_record_id: string
  workstream_id: string | null
  title: string | null
  content: string
  capture_type: string
  observed_at: string
  effective_at: string | null
  content_origin: ContentOrigin
  strength: EvidenceStrength
  sensitivity: Sensitivity
  score: number | string
}

function toHit(r: Row): LexicalHit {
  return {
    id: r.id,
    sourceRecordId: r.source_record_id,
    workstreamId: r.workstream_id,
    title: r.title,
    content: r.content,
    captureType: r.capture_type,
    observedAt: new Date(r.observed_at),
    effectiveAt: r.effective_at ? new Date(r.effective_at) : null,
    contentOrigin: r.content_origin,
    strength: r.strength,
    sensitivity: r.sensitivity,
    score: Number(r.score),
  }
}

const EFFECTIVE_SENSITIVITY = `
  COALESCE(
    (SELECT a.sensitivity FROM evidence_annotation a
      WHERE a.evidence_id = e.id AND a.sensitivity IS NOT NULL
      ORDER BY a.annotated_at DESC, a.id DESC LIMIT 1),
    e.sensitivity
  )`

export class RetrievalRepository {
  constructor(private readonly db: Database) {}

  async lexical(q: LexicalQuery): Promise<LexicalHit[]> {
    const limit = q.limit ?? 25
    const asOf = (q.asOf ?? new Date()).toISOString()

    // No terms is not a reason to return the whole corpus. An unscoped dump
    // would inflate cost and leak irrelevant context into every answer.
    if (q.terms.length === 0) {
      const res = await this.db.query<Row>(
        `SELECT e.id, e.source_record_id, e.workstream_id, e.title, e.content, e.capture_type,
                e.observed_at, e.effective_at, e.content_origin, e.strength,
                ${EFFECTIVE_SENSITIVITY} AS sensitivity,
                0::float8 AS score
           FROM evidence e
          WHERE e.workstream_id = $1 AND e.observed_at <= $2
          ORDER BY e.observed_at DESC
          LIMIT $3`,
        [q.workstreamId, asOf, limit],
      )
      return res.rows.map(toHit)
    }

    // `simple` dictionary, matching the generated column. OR semantics: a
    // question mentioning several things should surface each of them, and
    // ranking — not exclusion — decides what matters most.
    const tsquery = q.terms.map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).join(' | ')
    if (tsquery === '') return []

    const res = await this.db.query<Row>(
      `SELECT e.id, e.source_record_id, e.workstream_id, e.title, e.content, e.capture_type,
              e.observed_at, e.effective_at, e.content_origin, e.strength,
              ${EFFECTIVE_SENSITIVITY} AS sensitivity,
              ts_rank(e.fts, to_tsquery('simple', $2))::float8 AS score
         FROM evidence e
        WHERE e.workstream_id = $1
          AND e.observed_at <= $3
          AND e.fts @@ to_tsquery('simple', $2)
        ORDER BY score DESC, e.observed_at DESC
        LIMIT $4`,
      [q.workstreamId, tsquery, asOf, limit],
    )
    return res.rows.map(toHit)
  }

  /** Signals for the Context Health dimensions that live in storage. */
  async healthSignals(workstreamId: string): Promise<HealthSignals> {
    const [sources, rejected, unresolved, artifacts, contradictions, lineage, evidence] =
      await Promise.all([
        this.db.query<{ availability_state: string; n: string }>(
          `SELECT s.availability_state, count(*)::text AS n
             FROM source_record s
            GROUP BY s.availability_state`),
        this.db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM raw_input WHERE stage = 'rejected'`),
        this.db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM entity WHERE resolution_status <> 'resolved'`),
        this.db.query<{ n: string }>(
          `SELECT count(*)::text AS n
             FROM state_object_version v
            WHERE v.workstream_id = $1 AND v.type = 'artifact'
              AND v.superseded_by IS NULL AND v.status = 'outdated'`, [workstreamId]),
        this.db.query<{ n: string }>(
          `SELECT count(*)::text AS n
             FROM change_record WHERE workstream_id = $1 AND contradiction_flag = true`,
          [workstreamId]),
        this.db.query<{ n: string }>(
          `SELECT count(*)::text AS n
             FROM evidence
            WHERE workstream_id = $1 AND content_origin = 'system'
              AND (lineage->>'rootRunId') IS NULL`, [workstreamId]),
        this.db.query<{ n: string; oldest: string | null; newest: string | null }>(
          `SELECT count(*)::text AS n, min(observed_at)::text AS oldest, max(observed_at)::text AS newest
             FROM evidence WHERE workstream_id = $1`, [workstreamId]),
      ])

    const availability = Object.fromEntries(
      sources.rows.map((r) => [r.availability_state, Number(r.n)]),
    ) as Record<string, number>
    const span = evidence.rows[0]

    return {
      sourcesAvailable: availability.available ?? 0,
      sourcesPartial: availability.partial ?? 0,
      sourcesUnavailable: availability.unavailable ?? 0,
      rejectedInputs: Number(rejected.rows[0]?.n ?? 0),
      unresolvedEntities: Number(unresolved.rows[0]?.n ?? 0),
      outdatedArtifacts: Number(artifacts.rows[0]?.n ?? 0),
      contradictionFlags: Number(contradictions.rows[0]?.n ?? 0),
      systemEvidenceWithoutLineage: Number(lineage.rows[0]?.n ?? 0),
      evidenceCount: Number(span?.n ?? 0),
      oldestObservedAt: span?.oldest ? new Date(span.oldest) : null,
      newestObservedAt: span?.newest ? new Date(span.newest) : null,
    }
  }
}

export interface HealthSignals {
  sourcesAvailable: number
  sourcesPartial: number
  sourcesUnavailable: number
  rejectedInputs: number
  unresolvedEntities: number
  outdatedArtifacts: number
  contradictionFlags: number
  systemEvidenceWithoutLineage: number
  evidenceCount: number
  oldestObservedAt: Date | null
  newestObservedAt: Date | null
}
