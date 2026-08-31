import Anthropic from '@anthropic-ai/sdk'
import type {
  GenerateRequest, GenerateResult, ModelProvider, ProviderPolicy, Usage,
} from '../provider'
import { costUsd } from '../pricing'

/**
 * Anthropic adapter — the INITIAL V0 IMPLEMENTATION PROVIDER.
 *
 * This is not a permanent architectural choice. AVA stays provider-agnostic
 * under ADR-22: this file is the only place in the repository allowed to
 * import a provider SDK, and the boundary lint fails the build if any other
 * package does.
 *
 * The model name is configuration, never hardcoded into the domain.
 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5'

/**
 * Policy facts verified externally on 2026-08-30. Recorded here so the policy
 * gate can consult them in code rather than relying on remembered facts.
 *
 * These are not eternal guarantees. They must be reverified before Prospective
 * Validation and after any material provider-policy change.
 */
export const ANTHROPIC_POLICY: ProviderPolicy = {
  retention:
    'API inputs/outputs deleted from the backend within 30 days by default; ' +
    'Zero Data Retention available to eligible organisations by agreement. Verified 2026-08-30.',
  usedForTraining: false,
  allowedSensitivity: ['normal', 'sensitive'],
  region: 'storage in the United States; processing may occur in multiple regions',
}

export interface AnthropicOptions {
  apiKey: string
  model?: string
  timeoutMs?: number
  maxRetries?: number
  maxOutputTokens?: number
}

export class AnthropicProvider implements ModelProvider {
  readonly id: string
  readonly modelName: string
  readonly policyMetadata = ANTHROPIC_POLICY
  readonly timeoutMs: number
  readonly maxRetries: number

  private readonly client: Anthropic
  private readonly model: string
  private readonly maxOutputTokens: number
  private total: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

  constructor(options: AnthropicOptions) {
    this.model = options.model ?? ANTHROPIC_DEFAULT_MODEL
    this.timeoutMs = options.timeoutMs ?? 60_000
    // Retries are capped by the Budget Controller (ADR-21); the SDK must not
    // retry on its own, or the cap would be bypassed silently.
    this.maxRetries = options.maxRetries ?? 1
    this.maxOutputTokens = options.maxOutputTokens ?? 1_024
    this.id = `anthropic/${this.model}`
    this.modelName = this.model
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: this.timeoutMs,
      maxRetries: 0,
    })
  }

  /**
   * Single structured call.
   *
   * Retries are NOT performed here: the boundary pipeline owns them, because
   * only it can consult the ADR-21 retry cap.
   */
  async generateStructured<T>(
    req: GenerateRequest,
    validate: (v: unknown) => T | null,
  ): Promise<GenerateResult<T>> {
    let usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: String(req.input.system ?? ''),
        messages: [{ role: 'user', content: String(req.input.user ?? '') }],
      })

      const inputTokens = response.usage?.input_tokens ?? 0
      const outputTokens = response.usage?.output_tokens ?? 0
      usage = {
        inputTokens,
        outputTokens,
        costUsd: costUsd(this.model, inputTokens, outputTokens) ?? 0,
      }
      this.total = {
        inputTokens: this.total.inputTokens + inputTokens,
        outputTokens: this.total.outputTokens + outputTokens,
        costUsd: this.total.costUsd + usage.costUsd,
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      let parsed: unknown
      try {
        parsed = JSON.parse(extractJson(text))
      } catch {
        return {
          ok: false, abstained: false, usage,
          modelId: response.model ?? this.id,
          error: 'response was not valid JSON',
        }
      }

      // Local structural validation runs even when the provider promises
      // schema compliance. A promise is not a check.
      const validated = validate(parsed)
      if (validated === null) {
        return {
          ok: false, abstained: false, usage,
          modelId: response.model ?? this.id,
          error: 'structured output failed schema validation',
        }
      }

      return { ok: true, value: validated, usage, modelId: response.model ?? this.id }
    } catch (e) {
      // Usage is unknown on a transport failure. It is reported as zero here
      // and recorded as NULL by the ModelRun repository, which distinguishes
      // unknown from free.
      return {
        ok: false, abstained: false, usage, modelId: this.id,
        error: classifyError(e),
      }
    }
  }

  usage(): Usage {
    return { ...this.total }
  }
}

/** Pulls the JSON object out of a response that may wrap it in prose or fences. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

/** Error kind only. Never includes payload content, which would leak to logs. */
function classifyError(e: unknown): string {
  if (e instanceof Error) {
    const name = e.constructor.name
    if (/timeout/i.test(e.message)) return 'timeout'
    if (/401|auth/i.test(e.message)) return 'authentication_failed'
    if (/429|rate/i.test(e.message)) return 'rate_limited'
    if (/5\d\d/.test(e.message)) return 'provider_error'
    return `transport_error:${name}`
  }
  return 'unknown_error'
}
