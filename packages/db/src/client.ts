import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, parse } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

/**
 * Locates the repository root by walking up from the current directory until
 * it finds the workspace root package.
 *
 * The current working directory differs by caller — Next.js runs from
 * apps/web, the CLIs run from the repository root — so a relative data
 * directory would otherwise resolve to two different databases. Anchoring on
 * the workspace root makes `.pgdata` mean one place.
 */
function findRepoRoot(start: string = process.cwd()): string {
  let dir = start
  const { root } = parse(dir)
  while (true) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string; workspaces?: unknown }
        if (parsed.name === 'ava' || parsed.workspaces !== undefined) return dir
      } catch {
        // An unreadable package.json is not the root we are looking for.
      }
    }
    if (dir === root) return start
    dir = dirname(dir)
  }
}

/** Resolves a data directory to an absolute path, anchored at the repo root. */
export function resolveDataDir(dir: string): string {
  return isAbsolute(dir) ? dir : join(findRepoRoot(), dir)
}

export interface QueryResult<T> {
  rows: T[]
}

export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

class PGliteDatabase implements Database {
  constructor(private readonly db: PGlite) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.db.query<T>(sql, params)
    return { rows: res.rows }
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql)
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}

export interface OpenOptions {
  /** Filesystem directory for durable local data. Omit for in-memory. */
  dataDir?: string | undefined
}

export async function openDatabase(options: OpenOptions = {}): Promise<Database> {
  const mode = process.env.AVA_DB_MODE ?? 'pglite'
  if (mode === 'server') {
    throw new Error(
      'AVA_DB_MODE=server requires a PostgreSQL driver that is not installed in Batch 1. ' +
        'Use the default embedded mode (AVA_DB_MODE=pglite).',
    )
  }
  const dir = options.dataDir ?? process.env.AVA_PGLITE_DIR ?? '.pgdata'
  const pg = new PGlite(resolveDataDir(dir))
  await pg.waitReady
  return new PGliteDatabase(pg)
}

/** In-memory database for tests. Never touches the developer's data dir. */
export async function openTestDatabase(): Promise<Database> {
  const pg = new PGlite()
  await pg.waitReady
  return new PGliteDatabase(pg)
}
