import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Milestone 2 — Grounded Project Conversation, against the real built server.
 *
 * create workstream → capture → supersede → open chat → ask what changed
 * → see a grounded answer → inspect the evidence behind it.
 *
 * Asserts on server-rendered HTML. Streaming is deliberately not implemented
 * (Strategy A: buffer → validate → display), so there is no partial-token
 * behaviour that would require driving a real browser to observe.
 *
 * Deviation D-08: the questions are asked through the `ask` CLI, which runs
 * the identical `ask()` path the server action calls, because PGlite is
 * single-process and the running server holds the data directory. What this
 * suite proves is the rendering half — conversation, evidence references,
 * health, Why surface, abstention — against the real built server. The
 * server action itself is covered by the integration suite, not here.
 */
const ROOT = process.cwd()
const PORT = 3398
const DATA_DIR = join(ROOT, '.pgdata-e2e-m2')
const BASE = `http://localhost:${PORT}`

let server: ChildProcess | null = null

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

/** Refuses to run against a server left behind by an earlier run. */
async function freePort(): Promise<void> {
  await new Promise<void>((resolve) => {
    const p = spawn('sh', ['-c', `lsof -ti tcp:${PORT} | xargs -r kill -9`], { stdio: 'ignore' })
    p.on('exit', () => resolve())
  })
  await new Promise((r) => setTimeout(r, 300))
}

function run(cmd: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

beforeAll(async () => {
  if (!existsSync(join(ROOT, 'apps/web/.next'))) {
    throw new Error('run `npm run build:web` before the e2e suite')
  }
  await freePort()
  rmSync(DATA_DIR, { recursive: true, force: true })
  const env = { AVA_PGLITE_DIR: DATA_DIR }
  await run('npx', ['tsx', 'packages/db/src/cli/migrate.ts'], env)
  await run('npx', ['tsx', 'packages/app/src/cli/seed.ts', '--supersede'], env)

  // Asked before the server starts: PGlite allows a single writer.
  const wsId = await firstWorkstreamId(env)
  await run('npx', ['tsx', 'packages/app/src/cli/ask.ts', wsId,
    'What changed in this project?'], env)
  await run('npx', ['tsx', 'packages/app/src/cli/ask.ts', wsId,
    'What did we agree about the Zurich office lease renewal?'], env)

  // Detached so the whole process group can be killed: `npx` spawns
  // `next-server` as a child, and killing the wrapper alone leaves a server
  // still bound to the port. The next run then silently talks to the stale
  // server and asserts against yesterday's data.
  server = spawn('npx', ['next', 'start', '--port', String(PORT)], {
    cwd: join(ROOT, 'apps/web'),
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  })
  await waitForServer()
}, 120_000)

afterAll(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
  }
  server?.kill('SIGKILL')
  rmSync(DATA_DIR, { recursive: true, force: true })
})

const text = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/** Reads the seeded workstream id straight from the database, pre-server. */
async function firstWorkstreamId(env: Record<string, string>): Promise<string> {
  const { openDatabase } = await import('@ava/db')
  const previous = process.env.AVA_PGLITE_DIR
  process.env.AVA_PGLITE_DIR = env.AVA_PGLITE_DIR
  const db = await openDatabase()
  const res = await db.query<{ id: string }>('SELECT id FROM workstream ORDER BY created_at LIMIT 1')
  await db.close()
  if (previous === undefined) delete process.env.AVA_PGLITE_DIR
  else process.env.AVA_PGLITE_DIR = previous
  const id = res.rows[0]?.id
  if (!id) throw new Error('seed produced no workstream')
  return id
}

async function workstreamId(): Promise<string> {
  const home = await (await fetch(`${BASE}/workstreams`)).text()
  const m = home.match(/\/workstreams\/([A-Z0-9]{26})/)
  if (!m) throw new Error('no workstream on the workstreams page')
  return m[1]!
}

describe('Milestone 2 — grounded project conversation', () => {
  it('offers the chat surface from the workstream', async () => {
    const wsId = await workstreamId()
    const page = text(await (await fetch(`${BASE}/workstreams/${wsId}`)).text())
    expect(page).toContain('Ask AVA about this workstream')
  })

  it('explains the grounding rule on the chat surface', async () => {
    const wsId = await workstreamId()
    const page = text(await (await fetch(`${BASE}/workstreams/${wsId}/chat`)).text())
    expect(page).toContain('only evidence captured into this workstream')
    expect(page).toContain('AVA says so instead of filling the gap')
  })

  it('answers "what changed", cites evidence, and links to the Why surface', async () => {
    const wsId = await workstreamId()
    const html = await (await fetch(`${BASE}/workstreams/${wsId}/chat`)).text()
    const page = text(html)

    expect(page).toContain('you asked')
    expect(page).toContain('What changed in this project?')
    expect(page).toContain('AVA')
    expect(page).toMatch(/context (healthy|degraded)/)
    // Mock mode is disclosed rather than passed off as a model answer.
    expect(page).toContain('mock mode')
    expect(page).toContain('evidence behind this')

    const whyLink = html.match(/\/why\/([A-Z0-9]{26})/)
    expect(whyLink, 'no Why link was rendered').not.toBeNull()

    const why = text(await (await fetch(`${BASE}/why/${whyLink![1]}`)).text())
    expect(why).toContain('Why AVA said this')
    expect(why).toContain('Context health')
    expect(why).toContain('Evidence used')
    expect(why).toContain('grounded-answer')
    // The Why surface explains with evidence, never with model reasoning.
    expect(why).toContain('does not show model reasoning')
  })

  it('abstains rather than inventing an answer it has no evidence for', async () => {
    const wsId = await workstreamId()
    const page = text(await (await fetch(`${BASE}/workstreams/${wsId}/chat`)).text())
    expect(page).toContain('abstained')
    expect(page).toMatch(/do not have enough evidence/i)
    expect(page).not.toMatch(/the Zurich lease (was|is|will)/i)
  })
})
