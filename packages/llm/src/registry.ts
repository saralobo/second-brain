import type { ModelProvider } from './provider'

/**
 * Provider registry (fix F-02).
 *
 * Before this existed, "the mock is the only provider" was true because no
 * other implementation existed — an observation, not an enforced property.
 * The registry makes it enforced: a provider must be registered, configured,
 * and explicitly enabled before it can execute. Nothing runs merely because a
 * file exists on disk or a name appears in configuration.
 *
 * Policy and budget are checked by the boundary pipeline, not here, but they
 * are listed in `AuthorizationStep` so the full chain is visible in one place.
 */
export type AuthorizationStep =
  | 'registered'
  | 'configured'
  | 'enabled'
  | 'allowed_by_policy'
  | 'allowed_by_budget'

export interface RegistryEntry {
  provider: ModelProvider
  /** External providers require configuration (credentials, model name). */
  configured: boolean
  /** Must be turned on explicitly. Registration alone authorises nothing. */
  enabled: boolean
  /** True for providers that never leave the process. */
  local: boolean
}

export type ResolveResult =
  | { ok: true; provider: ModelProvider }
  | { ok: false; failedAt: AuthorizationStep; reason: string }

export class ProviderRegistry {
  private readonly entries = new Map<string, RegistryEntry>()

  register(name: string, entry: RegistryEntry): void {
    this.entries.set(name, entry)
  }

  /** Explicit enablement. Registration is not consent to execute. */
  enable(name: string): void {
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`cannot enable unregistered provider "${name}"`)
    if (!entry.configured) {
      throw new Error(`cannot enable "${name}": it is registered but not configured`)
    }
    entry.enabled = true
  }

  disable(name: string): void {
    const entry = this.entries.get(name)
    if (entry) entry.enabled = false
  }

  isEnabled(name: string): boolean {
    return this.entries.get(name)?.enabled ?? false
  }

  names(): string[] {
    return [...this.entries.keys()]
  }

  /**
   * Resolves a provider for execution, refusing at the first unmet step and
   * naming which one — so a denial is diagnosable rather than mysterious.
   */
  resolve(name: string): ResolveResult {
    const entry = this.entries.get(name)
    if (!entry) {
      return { ok: false, failedAt: 'registered', reason: `provider "${name}" is not registered` }
    }
    if (!entry.configured) {
      return { ok: false, failedAt: 'configured', reason: `provider "${name}" is not configured` }
    }
    if (!entry.enabled) {
      return { ok: false, failedAt: 'enabled', reason: `provider "${name}" is registered but not enabled` }
    }
    return { ok: true, provider: entry.provider }
  }
}
