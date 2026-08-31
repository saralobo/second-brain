import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from './client'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export interface AppliedMigration {
  name: string
  appliedAt: Date
}

/**
 * Forward-only migrations. An applied migration is never edited: a change is
 * a new file. The runner records what it applied so CI can prove the schema
 * builds from zero.
 */
export async function migrate(db: Database): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migration (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  const applied = await db.query<{ name: string }>('SELECT name FROM _migration')
  const done = new Set(applied.rows.map((r) => r.name))

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const newlyApplied: string[] = []

  for (const file of files) {
    if (done.has(file)) continue
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    await db.exec(sql)
    await db.query('INSERT INTO _migration (name) VALUES ($1)', [file])
    newlyApplied.push(file)
  }

  return newlyApplied
}

export async function appliedMigrations(db: Database): Promise<string[]> {
  const res = await db.query<{ name: string }>('SELECT name FROM _migration ORDER BY name')
  return res.rows.map((r) => r.name)
}

export async function availableMigrations(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
}
