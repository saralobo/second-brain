/**
 * Provenance primitives (baseline §11).
 *
 * `system` content is what AVA itself produced. It may never independently
 * corroborate a claim AVA made earlier, and it may not increase evidence
 * diversity. Diversity is therefore counted by causal root, not by row count.
 */
export type ContentOrigin = 'user' | 'third_party' | 'source_system' | 'system'

export const CONTENT_ORIGINS: readonly ContentOrigin[] = [
  'user',
  'third_party',
  'source_system',
  'system',
] as const

export function isContentOrigin(v: unknown): v is ContentOrigin {
  return typeof v === 'string' && (CONTENT_ORIGINS as readonly string[]).includes(v)
}

export type Sensitivity = 'normal' | 'sensitive' | 'restricted'

export const SENSITIVITIES: readonly Sensitivity[] = ['normal', 'sensitive', 'restricted'] as const

export function isSensitivity(v: unknown): v is Sensitivity {
  return typeof v === 'string' && (SENSITIVITIES as readonly string[]).includes(v)
}

/** Lineage of a produced object: what run created it, and from what. */
export interface Lineage {
  /** Causal root. Items sharing a root are ONE source of evidence, not many. */
  rootRunId: string | null
  producedBy: string | null
  derivedFromEvidenceIds: string[]
}

export const EMPTY_LINEAGE: Lineage = {
  rootRunId: null,
  producedBy: null,
  derivedFromEvidenceIds: [],
}

export interface DiversityInput {
  id: string
  contentOrigin: ContentOrigin
  lineage: Lineage
}

/**
 * Evidence diversity, deduplicated by causal root (baseline §11, §14).
 *
 * Two rules apply together:
 *  - `system`-origin items never count: AVA's own output cannot corroborate AVA.
 *  - items sharing a lineage root count once: the same content copied into
 *    three places still has one causal origin.
 */
export function countIndependentEvidence(items: readonly DiversityInput[]): number {
  const roots = new Set<string>()
  for (const item of items) {
    if (item.contentOrigin === 'system') continue
    roots.add(item.lineage.rootRunId ?? `self:${item.id}`)
  }
  return roots.size
}

/** True when the item may serve as independent corroboration of a claim. */
export function canCorroborate(item: DiversityInput): boolean {
  return item.contentOrigin !== 'system'
}
