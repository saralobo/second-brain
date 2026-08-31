/**
 * Logging with redaction (spec §26).
 *
 * Logs carry ids, counts and metadata — never captured content. This is not a
 * guideline: `redact` strips any key that could hold content, and a test
 * proves that captured text cannot reach the log.
 */
const CONTENT_KEYS = new Set([
  'content', 'rawContent', 'raw_content', 'text', 'body', 'title',
  'statement', 'originalStatement', 'prompt', 'completion', 'fields', 'payloadContent',
])

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return `[string:${value.length}]`
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return `[array:${value.length}]`
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CONTENT_KEYS.has(k)) { out[k] = '[redacted]'; continue }
      if (k === 'id' || k.endsWith('Id') || k.endsWith('_id')) { out[k] = v; continue }
      out[k] = redact(v, depth + 1)
    }
    return out
  }
  return '[unloggable]'
}

export interface Logger {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void
}

/**
 * Local, no-op-by-default logger. No SaaS exporter is configured in Batch 1:
 * shipping content to an external observability backend would cross the
 * ADR-22 boundary without a gate.
 */
export class LocalLogger implements Logger {
  constructor(private readonly enabled: boolean = process.env.AVA_LOG === '1') {}

  log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
    if (!this.enabled) return
    const line = JSON.stringify({ level, message, at: new Date().toISOString(), ...(redact(context) as object) })
    process.stdout.write(line + '\n')
  }
}

export const logger: Logger = new LocalLogger()
