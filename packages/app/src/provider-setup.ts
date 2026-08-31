import { MockModelProvider, ProviderRegistry, capsFromEnv } from '@ava/llm'
import type { SafetyCaps } from '@ava/llm'

/**
 * Provider wiring (fix F-02).
 *
 * The registry is built here rather than discovered. A provider that merely
 * exists on disk or is named in configuration cannot execute: it must be
 * registered, configured and explicitly enabled.
 *
 * The Anthropic adapter is loaded lazily and ONLY when an API key is present
 * and the provider is selected. That keeps the SDK out of every code path that
 * does not need it, and makes "no external call was possible" a structural
 * fact rather than a claim.
 */
export const MOCK_PROVIDER = 'mock'
export const ANTHROPIC_PROVIDER = 'anthropic'

export interface ProviderSetup {
  registry: ProviderRegistry
  caps: SafetyCaps
  /** Provider name the application should use for external archetypes. */
  active: string
  notes: string[]
}

export async function buildProviderRegistry(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderSetup> {
  const registry = new ProviderRegistry()
  const notes: string[] = []

  // The mock is always registered, configured and enabled. It never leaves
  // the process, so nothing gates it.
  registry.register(MOCK_PROVIDER, {
    provider: new MockModelProvider(),
    configured: true,
    enabled: true,
    local: true,
  })

  const selected = env.AVA_MODEL_PROVIDER ?? MOCK_PROVIDER
  const apiKey = env.ANTHROPIC_API_KEY

  if (selected === ANTHROPIC_PROVIDER) {
    if (!apiKey) {
      notes.push('anthropic selected but ANTHROPIC_API_KEY is absent; falling back to mock')
      return { registry, caps: capsFromEnv(env), active: MOCK_PROVIDER, notes }
    }
    // Imported here so the SDK is never loaded unless it is actually used.
    const { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } = await import('@ava/llm/anthropic')
    registry.register(ANTHROPIC_PROVIDER, {
      provider: new AnthropicProvider({
        apiKey,
        model: env.AVA_MODEL_NAME ?? ANTHROPIC_DEFAULT_MODEL,
      }),
      configured: true,
      enabled: false,
      local: false,
    })
    // Explicit enablement. Registration alone authorises nothing.
    registry.enable(ANTHROPIC_PROVIDER)
    notes.push(`anthropic registered and enabled with model ${env.AVA_MODEL_NAME ?? ANTHROPIC_DEFAULT_MODEL}`)
    return { registry, caps: capsFromEnv(env), active: ANTHROPIC_PROVIDER, notes }
  }

  notes.push('mock provider active; no external call is possible')
  return { registry, caps: capsFromEnv(env), active: MOCK_PROVIDER, notes }
}
