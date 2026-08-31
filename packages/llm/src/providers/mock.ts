import type {
  GenerateRequest, GenerateResult, ModelProvider, ProviderPolicy, Usage,
} from '../provider'

/**
 * Deterministic mock provider. Performs NO network access — there is nothing
 * to configure and nothing that could leave the machine.
 *
 * It exists so most of the system can be built and tested before the ADR-22
 * provider gate closes. Batch 1 never invokes it in a production path: the
 * whole capture-to-change loop is deterministic by design.
 */
export class MockModelProvider implements ModelProvider {
  readonly id = 'mock/deterministic/1'
  readonly modelName: string
  readonly timeoutMs = 5_000
  readonly maxRetries = 0

  readonly policyMetadata: ProviderPolicy = {
    retention: 'none - nothing leaves the process',
    usedForTraining: false,
    allowedSensitivity: ['normal', 'sensitive', 'restricted'],
    region: 'local',
  }

  private readonly total: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

  /**
   * `modelName` may be overridden so tests can exercise cost-dependent paths
   * against the real price table. It changes nothing about execution: the mock
   * still performs no network access.
   */
  constructor(
    private readonly responses: Map<string, unknown> = new Map(),
    modelName = 'mock/deterministic/1',
  ) {
    this.modelName = modelName
  }

  /** Registers a canned response for an archetype, for tests. */
  setResponse(archetype: string, value: unknown): void {
    this.responses.set(archetype, value)
  }

  async generateStructured<T>(
    req: GenerateRequest,
    validate: (v: unknown) => T | null,
  ): Promise<GenerateResult<T>> {
    const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    const canned = this.responses.get(req.archetype)

    if (canned === undefined) {
      // Abstention is a first-class outcome, not an error.
      return {
        ok: false, abstained: true, usage, modelId: this.id,
        reason: 'mock provider has no response registered',
      }
    }

    const validated = validate(canned)
    if (validated === null) {
      return {
        ok: false, abstained: false, usage, modelId: this.id,
        error: 'structured output failed schema validation',
      }
    }
    return { ok: true, value: validated, usage, modelId: this.id }
  }

  usage(): Usage {
    return { ...this.total }
  }
}
