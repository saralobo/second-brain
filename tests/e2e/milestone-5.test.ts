import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Milestone 5 — Closed Intervention Loop, against the real built server.
 *
 *   opportunity generated → shown → user says correct + valuable → user
 *   records an action → outcome resolves → Why shows the whole loop
 *
 * No provider is involved. Feedback is the user's private commentary on her
 * own work and never leaves the machine.
 *
 * Writes run through the CLI (D-08): PGlite allows a single writer and the
 * running server holds the directory.
 */
const ROOT = process.cwd()
const PORT = 3399
const DATA_DIR = join(ROOT, '.pgdata-e2e-m5')
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

  // Generate and deliver the briefing, which is what stamps `shown_at`.
  await run('npx', ['tsx', 'packages/app/src/cli/today.ts', workstreamId], env)

  opportunityId = await withDb(async (db) => {
    const r = await db.query(
      `SELECT id FROM opportunity
       WHERE workstream_id = $1 AND opportunity_class = 'unpropagated_decision'
       ORDER BY created_at DESC LIMIT 1`, [workstreamId])
    return String(r.rows[0].id)
  })

  // Close the loop through the CLI: two independent verdicts, an action, and
  // the outcome that the action settles.
  await run('npx', ['tsx', 'packages/app/src/cli/feedback.ts', 'give', opportunityId,
    'correct', 'valuable'], env)
  await run('npx', ['tsx', 'packages/app/src/cli/feedback.ts', 'action', opportunityId,
    'reviewed', 'Reviewed the proposal against architecture B and updated it.'], env)

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

describe('Milestone 5 — closed intervention loop', () => {
  it('shows both verdicts on Today, kept apart', async () => {
    const page = text(await (await fetch(`${BASE}/workstreams/${workstreamId}/today`)).text())
    expect(page).toContain('correct')
    expect(page).toContain('valuable')
    expect(page).toContain('Was this correct?')
    expect(page).toContain('Was this useful, now?')
    // Never a single rating.
    expect(page).not.toMatch(/overall (rating|score)/i)
    expect(page).not.toMatch(/thumbs/i)
  })

  it('does not hide an item because of what the user said about it', async () => {
    const page = text(await (await fetch(`${BASE}/workstreams/${workstreamId}/today`)).text())
    expect(page).toContain('may need review')
  })

  it('shows the whole loop in Why', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())

    expect(page).toContain('What you said')
    expect(page).toContain('correctness: correct')
    expect(page).toContain('usefulness: valuable')
    expect(page).toContain('The two verdicts are independent')

    expect(page).toContain('What you did')
    expect(page).toContain('reviewed')

    expect(page).toContain('How it ended')
    expect(page).toContain('resolved')
    expect(page).toContain('deterministic event')
  })

  it('shows the prospective timeline, and leaves what it cannot know blank', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())
    for (const row of [
      'evidence arrived', 'change became detectable', 'change detected',
      'opportunity generated', 'opportunity shown', 'feedback given',
      'action taken', 'outcome recorded',
    ]) {
      expect(page, `timeline row "${row}" missing`).toContain(row)
    }
    expect(page).toContain('you saw it')
    expect(page).toContain('delivering is not reading')
  })

  it('still shows the generation snapshot untouched by the feedback', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())
    expect(page).toContain('What AVA could see at generation time')
    expect(page).toContain('written once and never rewritten')
  })

  it('closed the loop without contacting a provider', async () => {
    const runs = await withDb(async (db) => {
      const r = await db.query('SELECT count(*)::text AS n FROM model_run')
      return Number(r.rows[0].n)
    })
    expect(runs).toBe(0)
  })

  it('recorded no user_seen event', async () => {
    const seen = await withDb(async (db) => {
      const r = await db.query(
        "SELECT count(*)::text AS n FROM validation_event WHERE event_type = 'user_seen'")
      return Number(r.rows[0].n)
    })
    expect(seen).toBe(0)
  })
})
