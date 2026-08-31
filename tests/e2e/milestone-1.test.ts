import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Milestone 1 end to end, against the real built server.
 *
 * This asserts on server-rendered HTML rather than driving a browser: the
 * pages are server components, so what the server renders is what a person
 * sees. Browser-level automation is deferred (see the Batch 1 execution log).
 */
const ROOT = process.cwd()
const PORT = 3399
const DATA_DIR = join(ROOT, '.pgdata-e2e')
const BASE = `http://localhost:${PORT}`

let server: ChildProcess | null = null

async function waitForServer(timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2_000) })
      if (res.ok) return
    } catch {
      // not up yet
    }
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

describe('Milestone 1 — capture and change loop, in the browser-facing output', () => {
  it('lists the workstream on the workstreams surface', async () => {
    // Interaction Layer I0 moved the workstream list off the root: AVA is the
    // entry point now, and workstreams are one destination among six.
    const html = await (await fetch(`${BASE}/workstreams`)).text()
    expect(text(html)).toContain('Project Alpha')
  })

  it('opens on AVA rather than on a list of projects', async () => {
    const html = text(await (await fetch(BASE)).text())
    expect(html).toContain('AVA')
    // The root offers conversation, not a filing cabinet.
    expect(html).toMatch(/Talk to AVA/i)
  })

  it('offers all ten capture types', async () => {
    const html = await (await fetch(`${BASE}/capture`)).text()
    for (const t of [
      'note', 'event', 'decision', 'goal', 'commitment',
      'question', 'risk', 'correction', 'preference', 'principle',
    ]) {
      expect(html, `capture type ${t} missing`).toContain(`value="${t}"`)
    }
  })

  it('shows current state, the detected change, and the still-reachable past', async () => {
    const home = await (await fetch(`${BASE}/workstreams`)).text()
    const match = home.match(/\/workstreams\/[A-Z0-9]{26}/)
    expect(match).not.toBeNull()

    const page = text(await (await fetch(`${BASE}${match![0]}`)).text())

    // Current state points at the superseding decision.
    expect(page).toContain('Current state')
    expect(page).toContain('encrypted store')
    expect(page).toContain('superseded')

    // The earlier version is still reachable, with its original wording.
    expect(page).toContain('earlier version')
    expect(page).toContain('store annotations locally only')

    // The change is displayed with its detector, and no model took part.
    expect(page).toContain('Recent changes')
    expect(page).toMatch(/stage1_identity|stage3_rules/)
    expect(page).not.toContain('stage5_semantic')

    // Impact reached the dependent item.
    expect(page).toContain('dependency_impacted')

    // Provenance is inspectable.
    expect(page).toContain('Recent evidence')
    expect(page).toContain('origin: user')
    expect(page).toContain('ESTABLISHED')
  })

  it('renders an empty state rather than an error for an unknown workstream', async () => {
    const res = await fetch(`${BASE}/workstreams/01AAAAAAAAAAAAAAAAAAAAAAAA`)
    expect(text(await res.text())).toContain('Workstream not found')
  })
})
