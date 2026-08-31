/**
 * Provider price table.
 *
 * Versioned and dated on purpose. Cost is derived locally from token counts,
 * so a later price change would silently rewrite historical cost figures if
 * the table were not versioned. Every ModelRun records which version produced
 * its number.
 *
 * Prices are external facts, verified on the date below. They are not
 * guarantees and must be reverified — see the Slice 3 provider gate.
 */
export interface ModelPrice {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

export const PRICE_TABLE_VERSION = '2026-08-30'

const PRICES: Record<string, ModelPrice> = {
  // Anthropic, verified 2026-08-30.
  'claude-sonnet-5': { inputPerMillionUsd: 2, outputPerMillionUsd: 10 },
  // Challenger, recorded for eval cost comparison only. No adapter exists.
  'gpt-5.6-terra': { inputPerMillionUsd: 2, outputPerMillionUsd: 12 },
  // The mock provider costs nothing because nothing leaves the process.
  'mock/deterministic/1': { inputPerMillionUsd: 0, outputPerMillionUsd: 0 },
}

export function priceFor(model: string): ModelPrice | null {
  return PRICES[model] ?? null
}

/**
 * Cost of a call. Returns null for an unpriced model rather than guessing —
 * an unknown cost must not be recorded as zero, because the budget controller
 * would then treat it as free.
 */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model)
  if (price === null) return null
  return (
    (inputTokens / 1_000_000) * price.inputPerMillionUsd +
    (outputTokens / 1_000_000) * price.outputPerMillionUsd
  )
}

/** Conservative pre-call estimate, used by the budget gate before sending. */
export function estimateCostUsd(
  model: string,
  estimatedInputTokens: number,
  maxOutputTokens: number,
): number | null {
  // The estimate assumes the maximum output, so the budget gate errs towards
  // refusing rather than towards overspending.
  return costUsd(model, estimatedInputTokens, maxOutputTokens)
}

/** Rough token estimate. Deliberately crude and deliberately over-estimating. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}
