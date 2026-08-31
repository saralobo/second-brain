import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

/**
 * The SDK boundary is an architectural property, so it is tested by attempting
 * to violate it — a lint that has never rejected anything proves nothing.
 */
describe('provider SDK boundary', () => {
  it('passes on the current tree', () => {
    const out = execFileSync('node', ['scripts/lint-boundaries.mjs'], { cwd: ROOT, encoding: 'utf8' })
    expect(out).toContain('import boundaries: ok')
  })

  it('rejects a provider SDK import from core', () => {
    const offender = join(ROOT, 'packages/core/src/__boundary_probe__.ts')
    writeFileSync(offender, "import Anthropic from '@anthropic-ai/sdk'\nexport const x = Anthropic\n")
    try {
      expect(() => execFileSync('node', ['scripts/lint-boundaries.mjs'], { cwd: ROOT, stdio: 'pipe' }))
        .toThrow()
    } finally {
      rmSync(offender, { force: true })
    }
  })

  it('rejects a provider SDK import from the ingestion quarantine plane', () => {
    const offender = join(ROOT, 'packages/ingestion/src/__boundary_probe__.ts')
    writeFileSync(offender, "import Anthropic from '@anthropic-ai/sdk'\nexport const x = Anthropic\n")
    try {
      expect(() => execFileSync('node', ['scripts/lint-boundaries.mjs'], { cwd: ROOT, stdio: 'pipe' }))
        .toThrow()
    } finally {
      rmSync(offender, { force: true })
    }
  })

  it('allows the SDK only inside the provider adapter directory', () => {
    const adapter = readFileSync(join(ROOT, 'packages/llm/src/providers/anthropic.ts'), 'utf8')
    expect(adapter).toContain("from '@anthropic-ai/sdk'")
    const out = execFileSync('node', ['scripts/lint-boundaries.mjs'], { cwd: ROOT, encoding: 'utf8' })
    expect(out).toContain('ok')
  })

  it('keeps the SDK out of every other package', () => {
    for (const pkg of ['core', 'db', 'ingestion', 'telemetry', 'app']) {
      // grep exits 1 when it finds nothing, which is the outcome we want.
      let found = ''
      try {
        found = execFileSync('grep', ['-rl', '@anthropic-ai/sdk', `packages/${pkg}/src`], {
          cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
      } catch {
        found = ''
      }
      expect(found, `SDK found in packages/${pkg}`).toBe('')
    }
  })
})
