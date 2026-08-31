import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Milestone 4 — Change to Attention, against the real built server.
 *
 *   create a decision → create a dependent artifact → supersede the decision
 *   → open Today → see the opportunity → open Why → follow
 *   Change → Impact → Opportunity → Value Vector → Show Policy
 *
 * No provider is involved anywhere on this path. The whole engine is
 * deterministic, which is the point of the milestone.
 *
 * Writes run through the CLI (D-08): PGlite allows a single writer and the
 * running server holds the directory.
 */
const ROOT = process.cwd()
const PORT = 3398
const DATA_DIR = join(ROOT, '.pgdata-e2e-m4')
const BASE = `http://localhost:${PORT}`

let server: ChildProcess | null = null
let workstreamId = ''
let opportunityId = ''

async function freePort(): Promise<void> {
  await new Promise<void>((resolve) => {
    const p = spawn('sh', ['-c', `lsof -ti tcp:${PORT} | xargs -r kill -9`], { stdio: 'ignore' })
    p.on('exit', () => resolve())
  })
  await new Promise((r) => setTimeout(r, 300))
}

async function waitForServer(timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2_000) })
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('server did not become ready')
}

function run(cmd: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

const env = { AVA_PGLITE_DIR: DATA_DIR }

async function withDb<T>(fn: (db: any) => Promise<T>): Promise<T> {
  const { openDatabase } = await import('@ava/db')
  const previous = process.env.AVA_PGLITE_DIR
  process.env.AVA_PGLITE_DIR = DATA_DIR
  const db = await openDatabase()
  try {
    return await fn(db)
  } finally {
    await db.close()
    if (previous === undefined) delete process.env.AVA_PGLITE_DIR
    else process.env.AVA_PGLITE_DIR = previous
  }
}

beforeAll(async () => {
  if (!existsSync(join(ROOT, 'apps/web/.next'))) {
    throw new Error('run `npm run build:web` before the e2e suite')
  }
  await freePort()
  rmSync(DATA_DIR, { recursive: true, force: true })

  await run('npx', ['tsx', 'packages/db/src/cli/migrate.ts'], env)
  // Decision, dependent artifact, commitment, question, risk — then the
  // correction that replaces architecture A with B.
  await run('npx', ['tsx', 'packages/app/src/cli/seed.ts', '--proactive', '--supersede'], env)

  workstreamId = await withDb(async (db) => {
    const r = await db.query(
      "SELECT id FROM workstream WHERE name LIKE '%proactive%' ORDER BY created_at DESC LIMIT 1")
    return String(r.rows[0].id)
  })

  // Generate the briefing through the CLI, then read it back in the browser.
  await run('npx', ['tsx', 'packages/app/src/cli/today.ts', workstreamId], env)

  opportunityId = await withDb(async (db) => {
    const r = await db.query(
      `SELECT id FROM opportunity
       WHERE workstream_id = $1 AND opportunity_class = 'unpropagated_decision'
       ORDER BY created_at DESC LIMIT 1`, [workstreamId])
    return String(r.rows[0].id)
  })

  server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: join(ROOT, 'apps/web'),
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  })
  await waitForServer()
}, 240_000)

afterAll(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
  }
  server?.kill('SIGKILL')
  rmSync(DATA_DIR, { recursive: true, force: true })
})

const text = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Milestone 4 — change to attention', () => {
  it('shows the five Today blocks', async () => {
    const page = text(await (await fetch(`${BASE}/workstreams/${workstreamId}/today`)).text())
    for (const block of [
      'What changed', 'Needs your attention', 'Open threads', 'AVA noticed', 'Prepared for you',
    ]) {
      expect(page, `block "${block}" missing`).toContain(block)
    }
  })

  it('raises the dependent artifact, hedged rather than asserted', async () => {
    const page = text(await (await fetch(`${BASE}/workstreams/${workstreamId}/today`)).text())
    expect(page).toContain('may need review')
    expect(page).toContain('the decision it depends on changed')
    expect(page).not.toMatch(/you need to redo/i)
    expect(page).not.toMatch(/is now invalid/i)
  })

  it('offers Why for the opportunity', async () => {
    const page = await (await fetch(`${BASE}/workstreams/${workstreamId}/today`)).text()
    expect(page).toContain(`/why/opportunity/${opportunityId}`)
  })

  it('traces Change → Impact → Opportunity → Value Vector → Show Policy in Why', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())

    expect(page).toContain('Change → Impact → Opportunity')
    expect(page).toContain('Triggering changes')
    expect(page).toContain('superseded')
    expect(page).toContain('Objects reached along declared relations')
    expect(page).toContain('potentially outdated')

    expect(page).toContain('Value Vector')
    for (const factor of [
      'alignment', 'consequence', 'timeSensitivity', 'evidenceStrength', 'contextHealth',
      'novelty', 'actionability', 'effort', 'reversibility', 'permissionScope',
      'preparationCost', 'dependencyReach', 'sensitivityRisk',
    ]) {
      expect(page, `factor ${factor} missing`).toContain(factor)
    }
    // No aggregate anywhere on the page.
    expect(page).not.toMatch(/\bscore\b/i)

    expect(page).toContain('Quality gates')
    expect(page).toContain('investigate')
    expect(page).toContain('show')
    expect(page).toContain('prepare')
    expect(page).toContain('PASS')

    // And the model's private reasoning is nowhere, because there was none.
    expect(page).not.toMatch(/chain of thought|reasoning:/i)
  })

  it('shows what AVA could see at generation time, and nothing newer', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())
    expect(page).toContain('What AVA could see at generation time')
    expect(page).toContain('written once and never rewritten')
  })

  it('reached attention without contacting any provider', async () => {
    const runs = await withDb(async (db) => {
      const r = await db.query('SELECT count(*)::text AS n FROM model_run')
      return Number(r.rows[0].n)
    })
    expect(runs).toBe(0)
  })
})
