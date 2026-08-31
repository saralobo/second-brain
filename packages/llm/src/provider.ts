/**
 * Provider-agnostic model interface (ADR-22).
 *
 * No provider SDK is installed and none is selected. The ADR-22 gate is OPEN:
 * until it closes (task S3-T15), MockModelProvider is the only registered
 * provider and no real content may leave the machine.
 */
export type TaskArchetype =
  | 'semantic_change_interpretation'
  | 'entity_tie_break'
  | 'opportunity_description'
  | 'state_query_answer'
  | 'explanation'
  | 'capture_structuring'

export interface ProviderPolicy {
  /** What the provider does with submitted data. Consultable in code. */
  retention: string
  usedForTraining: boolean | 'unknown'
  allowedSensitivity: readonly string[]
  region: string | null
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface GenerateRequest {
  archetype: TaskArchetype
  promptId: string
  promptVersion: string
  /** Only the context needed for the task. Never the ledger, never memory. */
  input: Record<string, unknown>
  /** Evidence ids present in the input. Output may reference no others. */
  evidenceIds: readonly string[]
  timeoutMs: number
}

export type GenerateResult<T> =
  | { ok: true; value: T; usage: Usage; modelId: string }
  | { ok: false; abstained: true; reason: string; usage: Usage; modelId: string }
  | { ok: false; abstained: false; error: string; usage: Usage; modelId: string }

export interface ModelProvider {
  readonly id: string
  /**
   * The model name as the price table knows it. Exposed explicitly rather
   * than parsed out of `id`: an id is an opaque label, and deriving cost from
   * a string split silently produced an unpriced model — which the budget
   * gate then treated as unbounded.
   */
  readonly modelName: string
  readonly policyMetadata: ProviderPolicy
  readonly timeoutMs: number
  readonly maxRetries: number
  generateStructured<T>(req: GenerateRequest, validate: (v: unknown) => T | null): Promise<GenerateResult<T>>
  usage(): Usage
}
