import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { openDatabase, openDatabaseFromDump } from '../client'

/**
 * Local backup and restore (deviation D-02, resolved in Slice 7).
 *
 *   npm run db:backup -- [path]
 *   npm run db:restore -- <path> --verify
 *
 * Writes a gzipped snapshot to the local filesystem. Nothing is uploaded
 * anywhere: ADR-22 keeps the ledger, the memory and the whole evidence trail
 * on this machine, and a backup that left it would quietly undo that.
 *
 * `--verify` opens the snapshot and counts its rows without touching the live
 * directory. A backup nobody has restored is a hypothesis, not a backup.
 */
async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (command === 'restore') {
    const path = rest.find((a) => !a.startsWith('--'))
    if (!path) {
      console.error('usage: npm run db:restore -- <path> [--verify]')
      process.exitCode = 1
      return
    }
    const dump = new Uint8Array(await readFile(path))
    const db = await openDatabaseFromDump(dump)
    try {
      const counts = await rowCounts(db)
      console.log(`restored from ${path}`)
      for (const [table, n] of counts) console.log(`  ${table}: ${n}`)
      if (rest.includes('--verify')) {
        console.log('')
        console.log('VERIFY ONLY — the live data directory was not modified.')
        console.log('To adopt this snapshot, stop AVA and replace the data directory manually.')
      }
    } finally {
      await db.close()
    }
    return
  }

  const path = command ?? `ava-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.tar.gz`
  const db = await openDatabase()
  try {
    const dump = await db.dump()
    await mkdir(dirname(path), { recursive: true }).catch(() => undefined)
    await writeFile(path, dump)
    const counts = await rowCounts(db)
    console.log(`wrote ${path} (${(dump.byteLength / 1024).toFixed(1)} KiB)`)
    for (const [table, n] of counts) console.log(`  ${table}: ${n}`)
    console.log('')
    console.log('Local file only. Nothing was uploaded.')
    console.log(`Verify it now: npm run db:restore -- ${path} --verify`)
  } finally {
    await db.close()
  }
}

/** The tables the prospective evidence trail depends on. */
const TABLES = [
  'evidence', 'validation_event', 'decision_record', 'opportunity',
  'opportunity_generation', 'feedback', 'user_action', 'outcome',
  'declared_cognition', 'model_run',
] as const

async function rowCounts(db: Awaited<ReturnType<typeof openDatabase>>): Promise<[string, number][]> {
  const out: [string, number][] = []
  for (const table of TABLES) {
    const res = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)
    out.push([table, Number(res.rows[0]?.n ?? '0')])
  }
  return out
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
