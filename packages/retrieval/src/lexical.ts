import type { RetrievalResult } from '@ava/core'
import type { LexicalHit, RetrievalRepository } from '@ava/db'

/**
 * Retrieval strategy interface (S3-T02).
 *
 * Phase 1 has exactly one implementation, over full text. The interface
 * exists so a second strategy can be added beside it — NOT so that one is
 * added now. Embeddings are a Slice 5+ decision with its own gate.
 */
export interface RetrievalStrategy {
  readonly name: string
  search(q: RetrievalQuery): Promise<RetrievalResult[]>
}

export interface RetrievalQuery {
  workstreamId: string
  terms: readonly string[]
  limit?: number
  asOf?: Date
  /** Evidence ids whose state has been superseded, for annotation. */
  supersededEvidence?: ReadonlyMap<string, string>
}

const EXCERPT_CHARS = 600

export class LexicalRetrieval implements RetrievalStrategy {
  readonly name = 'lexical/fts/1'

  constructor(private readonly repo: RetrievalRepository) {}

  async search(q: RetrievalQuery): Promise<RetrievalResult[]> {
    const hits = await this.repo.lexical({
      workstreamId: q.workstreamId,
      terms: q.terms,
      limit: q.limit ?? 25,
      asOf: q.asOf ?? new Date(),
    })
    return hits.map((h) => toResult(h, q))
  }
}

function toResult(h: LexicalHit, q: RetrievalQuery): RetrievalResult {
  return {
    evidenceId: h.id,
    sourceRecordId: h.sourceRecordId,
    workstreamId: h.workstreamId,
    title: h.title,
    excerpt: h.content.length > EXCERPT_CHARS ? `${h.content.slice(0, EXCERPT_CHARS)}…` : h.content,
    captureType: h.captureType,
    observedAt: h.observedAt,
    effectiveAt: h.effectiveAt,
    contentOrigin: h.contentOrigin,
    strength: h.strength,
    sensitivity: h.sensitivity,
    supersededByObjectVersion: q.supersededEvidence?.get(h.id) ?? null,
    score: h.score,
    // A lexical rank says the words matched. It says nothing about whether
    // the statement is true, and the wording keeps that distinction visible.
    reason: q.terms.length === 0
      ? 'most recent evidence in the workstream; no search terms supplied'
      : `lexical match on ${q.terms.join(', ')} (rank ${h.score.toFixed(4)})`,
  }
}
