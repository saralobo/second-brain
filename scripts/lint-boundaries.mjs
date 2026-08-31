#!/usr/bin/env node
/**
 * Import boundary lint (task S0-T02).
 *
 * These are architectural boundaries, not style preferences:
 *
 *  - `core` is pure domain. It may import nothing from the project and must
 *    not perform I/O. This is what keeps temporality, supersession and change
 *    detection testable without a database, a network or a model.
 *
 *  - `ingestion` is the quarantine plane. It may not reach the database or a
 *    model provider, so untrusted text cannot act (baseline §11).
 *
 *  - no package outside `llm/providers` may import a provider SDK (ADR-22).
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PKGS = join(ROOT, 'packages')

const IO_MODULES = [
  'node:fs', 'node:net', 'node:http', 'node:https', 'node:dgram', 'node:child_process',
  'fs', 'net', 'http', 'https', 'pg', '@electric-sql/pglite', 'next',
]
const PROVIDER_SDKS = ['openai', '@anthropic-ai/sdk', '@google/generative-ai', 'cohere-ai', 'groq-sdk']

const RULES = {
  core: {
    forbiddenPackages: ['@ava/db', '@ava/ingestion', '@ava/llm', '@ava/telemetry', '@ava/app'],
    forbiddenModules: [...IO_MODULES, ...PROVIDER_SDKS],
    reason: 'core must stay pure: no project imports, no I/O',
  },
  ingestion: {
    forbiddenPackages: ['@ava/db', '@ava/llm', '@ava/telemetry', '@ava/app'],
    forbiddenModules: [...IO_MODULES, ...PROVIDER_SDKS],
    reason: 'the quarantine plane must not reach storage, models or tools',
  },
  llm: {
    forbiddenPackages: ['@ava/db', '@ava/app'],
    forbiddenModules: [],
    reason: 'the model layer must not depend on storage',
  },
  telemetry: { forbiddenPackages: ['@ava/app', '@ava/llm'], forbiddenModules: PROVIDER_SDKS, reason: 'telemetry is transversal' },
  db: { forbiddenPackages: ['@ava/app', '@ava/llm'], forbiddenModules: PROVIDER_SDKS, reason: 'storage must not depend on application or model layers' },
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      yield* walk(full)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      yield full
    }
  }
}

const violations = []

for (const [pkg, rule] of Object.entries(RULES)) {
  const dir = join(PKGS, pkg, 'src')
  let files
  try { files = walk(dir) } catch { continue }
  for await (const file of files) {
    const src = await readFile(file, 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1]
      if (spec.startsWith('.')) continue
      const bad =
        rule.forbiddenPackages.includes(spec) ||
        rule.forbiddenModules.includes(spec) ||
        rule.forbiddenModules.some((m) => spec === m || spec.startsWith(`${m}/`))
      if (bad) {
        violations.push({ file: relative(ROOT, file), spec, pkg, reason: rule.reason })
      }
    }
  }
}

// Provider SDKs are banned everywhere except an adapter directory that does
// not exist yet: the ADR-22 gate is still open.
for await (const file of walk(PKGS)) {
  const src = await readFile(file, 'utf8')
  for (const match of src.matchAll(IMPORT_RE)) {
    const spec = match[1]
    if (PROVIDER_SDKS.some((s) => spec === s || spec.startsWith(`${s}/`))) {
      if (!file.includes('/llm/src/providers/')) {
        violations.push({
          file: relative(ROOT, file), spec, pkg: 'any',
          reason: 'provider SDKs are not permitted while the ADR-22 gate is open',
        })
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Import boundary violations:\n')
  for (const v of violations) {
    console.error(`  ${v.file}\n    imports "${v.spec}"\n    ${v.reason}\n`)
  }
  process.exit(1)
}

console.log('import boundaries: ok')
