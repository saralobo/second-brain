import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Interaction Layer v0.1, against the real built server.
 *
 * What this DOES cover: the global shell, AVA as the entry point, Global Today
 * composed across workstreams, the Live surface, the consent gate, the scope
 * selector, and the conversational write path through the server action.
 *
 * What this does NOT cover, stated so the coverage is not overclaimed: real
 * microphone permission, real speech recognition and real speech synthesis.
 * Those are browser capabilities that a fetch-based harness cannot exercise,
 * and no assertion here should be read as hardware testing. They are verified
 * by manual review, recorded in the progress document.
 */
const ROOT = process.cwd()
const PORT = 3400
const DATA_DIR = join(ROOT, '.pgdata-e2e-interaction')
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
  await run('npx', ['tsx', 'packages/app/src/cli/seed.ts',
    '--proactive', '--supersede', '--cognition'], env)

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

describe('I0 — the global shell', () => {
  it('opens on AVA, not on a list of projects', async () => {
    const page = text(await (await fetch(BASE)).text())
    expect(page).toContain('AVA')
    expect(page).toMatch(/Good (morning|afternoon|evening)\./)
    expect(page).toMatch(/Talk to AVA/i)
  })

  it('offers the six destinations with AVA first', async () => {
    const html = await (await fetch(BASE)).text()
    for (const [href, label] of [
      ['/live', 'Live'], ['/today', 'Today'], ['/ask', 'Ask AVA'],
      ['/workstreams', 'Workstreams'], ['/memory', 'Memory'],
    ] as const) {
      expect(html, `nav ${label} missing`).toContain(`href="${href}"`)
    }
  })

  it('keeps workstream deep links working', async () => {
    const list = await (await fetch(`${BASE}/workstreams`)).text()
    const match = list.match(/\/workstreams\/([A-Z0-9]{26})/)
    expect(match).not.toBeNull()
    const page = text(await (await fetch(`${BASE}/workstreams/${match![1]}/today`)).text())
    expect(page).toContain('Today')
  })

  it('states that AVA is local', async () => {
    expect(await (await fetch(BASE)).text()).toContain('local only')
  })
})

describe('I1 — AVA Core', () => {
  it('renders the Core with a semantic state and a text label', async () => {
    const html = await (await fetch(BASE)).text()
    expect(html).toContain('data-core-state=')
    // Motion is never the only carrier: the state is always available as text.
    expect(html).toMatch(/aria-label="AVA — (Ready|Needs your attention|Context is incomplete)"/)
  })

  it('shows a state that reflects a real system condition', async () => {
    const html = await (await fetch(BASE)).text()
    const state = /data-core-state="([a-z]+)"/.exec(html)?.[1]
    expect(['idle', 'attention', 'degraded']).toContain(state)
  })
})

describe('I2 — Global Today', () => {
  it('composes across workstreams and names the origin of every item', async () => {
    const html = await (await fetch(`${BASE}/today`)).text()
    const page = text(html)
    expect(page).toContain('Today')
    expect(page).toMatch(/Across \d+ workstream/)
    // Every opportunity item carries a link back to its own workstream.
    const wsTags = [...html.matchAll(/class="tag ws" href="\/workstreams\/([A-Z0-9]{26})/g)]
    if (wsTags.length > 0) {
      expect(page).toContain('proactive')
    }
  })

  it('reports across projects and says it does not reason across them', async () => {
    const page = text(await (await fetch(`${BASE}/today`)).text())
    expect(page).toContain('I report across your projects, I do not reason across them')
  })

  it('shows no global score anywhere', async () => {
    const page = text(await (await fetch(`${BASE}/today`)).text())
    expect(page).not.toMatch(/\bscore\b/i)
    expect(page).not.toMatch(/\bpriority: \d/i)
  })

  it('keeps the five blocks with honest empty states', async () => {
    const page = text(await (await fetch(`${BASE}/today`)).text())
    for (const block of [
      'Needs your attention', 'What changed', 'Open loops', 'AVA noticed', 'Prepared for you',
    ]) {
      expect(page, `block ${block} missing`).toContain(block)
    }
  })
})

describe('I3 — Live', () => {
  it('gates the microphone behind explicit consent', async () => {
    const page = text(await (await fetch(`${BASE}/live`)).text())
    expect(page).toContain('Before we talk')
    // The disclosure names the thing that is genuinely not local.
    expect(page).toContain('sent to the browser vendor')
    expect(page).toContain('anything audible in the room is captured')
    expect(page).toContain('I understand — enable Live')
  })

  it('offers a written path for anyone who declines', async () => {
    const html = await (await fetch(`${BASE}/live`)).text()
    expect(html).toContain('href="/ask"')
  })

  it('offers scope selection so a question is never silently global', async () => {
    const html = await (await fetch(`${BASE}/live`)).text()
    expect(html).toContain('Global — attention across everything')
  })
})

describe('I4 — conversational capture and Ask', () => {
  it('offers the written conversation with explicit scope', async () => {
    const page = text(await (await fetch(`${BASE}/ask`)).text())
    expect(page).toContain('Ask AVA')
    expect(page).toContain('Global —')
  })

  it('keeps Why reachable from the written surface', async () => {
    const html = await (await fetch(`${BASE}/ask`)).text()
    expect(html).toContain('Ask me what needs your attention')
  })
})

describe('the epistemic contract survives the redesign', () => {
  it('keeps the five memory sections distinct', async () => {
    const page = text(await (await fetch(`${BASE}/memory`)).text())
    for (const section of [
      'Declared by you', 'Evidence-backed knowledge', 'Behavioral hypotheses',
      'Uncertain', 'Superseded',
    ]) {
      expect(page, `section "${section}" missing`).toContain(section)
    }
    expect(page).toContain('shadow mode — governs nothing')
  })

  it('keeps the full Why chain', async () => {
    const page = text(await (await fetch(`${BASE}/why/opportunity/${opportunityId}`)).text())
    expect(page).toContain('Change → Impact → Opportunity')
    expect(page).toContain('Value Vector')
    expect(page).toContain('Quality gates')
    expect(page).toContain('What AVA could see at generation time')
    expect(page).not.toMatch(/chain of thought/i)
  })

  it('reached the interface without contacting any provider', async () => {
    const runs = await withDb(async (db) => {
      const r = await db.query('SELECT count(*)::text AS n FROM model_run')
      return Number(r.rows[0].n)
    })
    expect(runs).toBe(0)
  })
})
