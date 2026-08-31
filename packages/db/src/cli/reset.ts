import { rm } from 'node:fs/promises'
import { resolveDataDir } from '../client'

/**
 * Local development reset.
 *
 * Explicit and destructive by design. Permitted only while there is no real
 * captured data: once real capture begins, the plan requires an export first.
 */
const dir = resolveDataDir(process.env.AVA_PGLITE_DIR ?? '.pgdata')

if (process.env.AVA_ALLOW_RESET !== '1') {
  console.error(
    'Refusing to reset. This deletes all locally captured data.\n' +
      `Set AVA_ALLOW_RESET=1 to confirm. Target: ${dir}`,
  )
  process.exit(1)
}

await rm(dir, { recursive: true, force: true })
console.log(`removed ${dir}`)
