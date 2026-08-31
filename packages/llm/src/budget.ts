import type { Usage } from './provider'

/**
 * Budget Controller (ADR-21, Gate A).
 *
 * Caps are OPERATIONAL SAFETY CAPS, not product validation thresholds. A cap
 * being reached means the operational limit worked; it says nothing about
 * whether the product passed the economic gate. Gate B remains open.
 *
 * Values are deliberately unset: ADR-21 records them as
 * IMPLEMENTATION CONFIG REQUIRED BEFORE FIRST REAL MODEL CALL. Inventing them
 * here would fabricate a decision that belongs to the project owner.
 */
export interface SafetyCaps {
  perCallUsd: number | null
  perCheckpointUsd: number | null
  dailyUsd: number | null
  monthlyUsd: number | null
  maxRetries: number | null
}

export const UNCONFIGURED_CAPS: SafetyCaps = {
  perCallUsd: null,
  perCheckpointUsd: null,
  dailyUsd: null,
  monthlyUsd: null,
  maxRetries: null,
}

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: string; cap: keyof SafetyCaps | 'unconfigured' }

export interface UsageWindow {
  checkpointUsd: number
  dailyUsd: number
  monthlyUsd: number
  retries: number
}

export const EMPTY_WINDOW: UsageWindow = { checkpointUsd: 0, dailyUsd: 0, monthlyUsd: 0, retries: 0 }

export class BudgetController {
  private readonly window: UsageWindow

  constructor(
    private readonly caps: SafetyCaps = UNCONFIGURED_CAPS,
    /** Spend already recorded in the current windows, loaded from ModelRun. */
    seedWindow: Partial<UsageWindow> = {},
  ) {
    this.window = { ...EMPTY_WINDOW, ...seedWindow }
  }

  /**
   * Authorises an external model call.
   *
   * With no caps configured the controller is CLOSED, not permissive: an
   * unbounded external call is exactly what Gate A exists to prevent. It also
   * means Batch 1 cannot accidentally make a paid call.
   */
  authorize(estimatedCostUsd: number): BudgetDecision {
    const { perCallUsd, perCheckpointUsd, dailyUsd, monthlyUsd } = this.caps
    if (perCallUsd === null && perCheckpointUsd === null && dailyUsd === null && monthlyUsd === null) {
      return {
        allowed: false,
        cap: 'unconfigured',
        reason: 'no operational safety cap configured; ADR-21 requires caps before the first real model call',
      }
    }
    if (perCallUsd !== null && estimatedCostUsd > perCallUsd) {
      return { allowed: false, cap: 'perCallUsd', reason: 'per-call cap exceeded' }
    }
    if (perCheckpointUsd !== null && this.window.checkpointUsd + estimatedCostUsd > perCheckpointUsd) {
      return { allowed: false, cap: 'perCheckpointUsd', reason: 'per-checkpoint cap exceeded' }
    }
    if (dailyUsd !== null && this.window.dailyUsd + estimatedCostUsd > dailyUsd) {
      return { allowed: false, cap: 'dailyUsd', reason: 'daily cap exceeded' }
    }
    if (monthlyUsd !== null && this.window.monthlyUsd + estimatedCostUsd > monthlyUsd) {
      return { allowed: false, cap: 'monthlyUsd', reason: 'monthly cap exceeded' }
    }
    return { allowed: true }
  }

  /** Hard stop: a retry beyond the cap is refused outright. */
  authorizeRetry(): BudgetDecision {
    if (this.caps.maxRetries === null) {
      return { allowed: false, cap: 'unconfigured', reason: 'retry cap not configured' }
    }
    if (this.window.retries >= this.caps.maxRetries) {
      return { allowed: false, cap: 'maxRetries', reason: 'retry cap exceeded' }
    }
    return { allowed: true }
  }

  record(usage: Usage): void {
    this.window.checkpointUsd += usage.costUsd
    this.window.dailyUsd += usage.costUsd
    this.window.monthlyUsd += usage.costUsd
  }

  recordRetry(): void { this.window.retries += 1 }
  closeCheckpoint(): void { this.window.checkpointUsd = 0; this.window.retries = 0 }
  usage(): UsageWindow { return { ...this.window } }
}

/** Reads caps from the environment. Unset stays unset - never defaulted. */
export function capsFromEnv(env: NodeJS.ProcessEnv = process.env): SafetyCaps {
  const num = (v: string | undefined): number | null =>
    v === undefined || v.trim() === '' ? null : Number(v)
  return {
    perCallUsd: num(env.AVA_CAP_PER_CALL_USD),
    perCheckpointUsd: num(env.AVA_CAP_PER_CHECKPOINT_USD),
    dailyUsd: num(env.AVA_CAP_DAILY_USD),
    monthlyUsd: num(env.AVA_CAP_MONTHLY_USD),
    maxRetries: num(env.AVA_CAP_RETRIES),
  }
}
