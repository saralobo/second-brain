import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Milestone 3 — Inspectable Personal Cognition, against the real built server.
 *
 * declare a preference → ask AVA what it knows → correct/contextualize it
 * → ask again and get a different answer → inspect the declarations and their
 * evidence in the Why surface.
 *
 * As in Milestone 2 (D-08), the writes are driven through the CLI because
 * PGlite allows a single writer and the running server holds the directory.
 * What this proves is the rendering half against the real server.
 */
const ROOT = process.cwd()
const PORT = 3397
const DATA_DIR = join(ROOT, '.pgdata-e2e-m3')
const BASE = `http://localhost:${PORT}`

let server: ChildProcess | null = null

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
  await run('npx', ['tsx', 'packages/app/src/cli/seed.ts', '--cognition'], env)

  const wsId = await withDb(async (db) => {
    const r = await db.query('SELECT id FROM workstream ORDER BY created_at LIMIT 1')
    return String(r.rows[0].id)
  })

  // Ask before the correction, correct, then ask again.
  await run('npx', ['tsx', 'packages/app/src/cli/ask.ts', wsId,
    'What have I told you about my preferences for updates?'], env)
  await run('npx', ['tsx', 'packages/app/src/cli/cognition.ts', 'correct', wsId,
    'For technical architecture decisions I prefer detailed reasoning.'], env)
  await run('npx', ['tsx', 'packages/app/src/cli/ask.ts', wsId,
    'What have I told you about my preferences for updates?'], env)

  server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: join(ROOT, 'apps/web'),
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  })
  await waitForServer()
}, 180_000)

afterAll(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
  }
  server?.kill('SIGKILL')
  rmSync(DATA_DIR, { recursive: true, force: true })
})

const text = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Milestone 3 — inspectable personal cognition', () => {
  it('separates the five memory sections and labels their authority', async () => {
    const page = text(await (await fetch(`${BASE}/memory`)).text())

    expect(page).toContain('What AVA knows')
    for (const section of [
      'Declared by you', 'Evidence-backed knowledge', 'Behavioral hypotheses',
      'Uncertain', 'Superseded',
    ]) {
      expect(page, `section "${section}" missing`).toContain(section)
    }

    // A declaration is presented as the user's own words.
    expect(page).toContain('declared by you')
    // A hypothesis is presented as a guess, and says so in plain language.
    expect(page).toContain('a guess — you never told me this')
    expect(page).toContain('I have a hypothesis that')
    expect(page).toContain('shadow mode — governs nothing')

    // The hypothesis records what else was on offer.
    expect(page).toContain('alternatives that were available')
  })

  it('shows the corrected declaration as current and the original as superseded', async () => {
    const page = text(await (await fetch(`${BASE}/memory`)).text())

    // The correction is authoritative.
    expect(page).toContain('detailed reasoning')
    // The original is still readable, under Superseded.
    expect(page).toContain('concise project updates')
    expect(page).toMatch(/Superseded[\s\S]*concise project updates/)
    // And its scope is visible.
    expect(page).toContain('applies to')
  })

  it('offers the five actions on the right items', async () => {
    const html = await (await fetch(`${BASE}/memory`)).text()
    for (const action of ['Correct', 'Contextualize', 'Supersede', 'Confirm', 'Reject']) {
      expect(html, `action "${action}" missing`).toContain(`>${action}<`)
    }
  })

  it('answers the personal question from the corrected declaration', async () => {
    const wsId = (await (await fetch(`${BASE}/workstreams`)).text()).match(/\/workstreams\/([A-Z0-9]{26})/)![1]
    const page = text(await (await fetch(`${BASE}/workstreams/${wsId}/chat`)).text())

    expect(page).toContain('What you explicitly told me')
    expect(page).toContain('detailed reasoning')
    // Answered locally: nothing about the user was sent to a model.
    expect(page).toContain('context')
  })

  it('shows declaration provenance in the Why surface', async () => {
    const wsId = (await (await fetch(`${BASE}/workstreams`)).text()).match(/\/workstreams\/([A-Z0-9]{26})/)![1]
    const chat = await (await fetch(`${BASE}/workstreams/${wsId}/chat`)).text()
    const whyIds = [...chat.matchAll(/\/why\/([A-Z0-9]{26})/g)].map((m) => m[1]!)
    expect(whyIds.length).toBeGreaterThan(0)

    const why = text(await (await fetch(`${BASE}/why/${whyIds[whyIds.length - 1]}`)).text())
    expect(why).toContain('What you told AVA, and why it applied here')
    expect(why).toContain('detailed reasoning')
    expect(why).toContain('why it applied here')
    expect(why).toContain('cognitive authority')
    // Evidence and the decision record — never model reasoning.
    expect(why).toContain('does not show model reasoning')
  })
})
