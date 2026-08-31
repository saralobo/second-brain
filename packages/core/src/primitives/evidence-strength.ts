/**
 * Ordinal evidence strength (baseline §29). Three levels, no numbers.
 *
 * Composition NEVER increases strength: a derived item inherits at most the
 * weakest relevant link. Model confidence scores are telemetry and must never
 * govern a decision, so no numeric type is exposed here at all.
 */
export type EvidenceStrength = 'ESTABLISHED' | 'SUPPORTED' | 'SPECULATIVE'

export const EVIDENCE_STRENGTHS: readonly EvidenceStrength[] = [
  'ESTABLISHED',
  'SUPPORTED',
  'SPECULATIVE',
] as const

/** Lower rank = stronger. Internal only; never persisted, never arithmetic. */
const RANK: Record<EvidenceStrength, number> = {
  ESTABLISHED: 0,
  SUPPORTED: 1,
  SPECULATIVE: 2,
}

export function isStrongerThan(a: EvidenceStrength, b: EvidenceStrength): boolean {
  return RANK[a] < RANK[b]
}

/**
 * Strength of something derived from several inputs: the weakest link.
 * An empty input set cannot yield a supported claim.
 */
export function weakestOf(parts: readonly EvidenceStrength[]): EvidenceStrength {
  if (parts.length === 0) return 'SPECULATIVE'
  return parts.reduce((weakest, s) => (RANK[s] > RANK[weakest] ? s : weakest), 'ESTABLISHED' as EvidenceStrength)
}

export function isEvidenceStrength(v: unknown): v is EvidenceStrength {
  return typeof v === 'string' && (EVIDENCE_STRENGTHS as readonly string[]).includes(v)
}
