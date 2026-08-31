import { writeFile } from 'node:fs/promises'
import { getContext } from '../context'
import { buildValidationExport, toJsonl } from '../validation/export'
import { VALIDATION_SCHEMA_VERSION } from '../validation/read-model'

/**
 * Validation export from the command line.
 *
 *   npm run validation:export -- <workstreamId> [outputPath]
 *
 * Writes a local JSONL file. Nothing is sent anywhere, and the file carries
 * ids, categories, versions and timestamps — never content.
 */
async function main(): Promise<void> {
  const [workstreamId, outputPath] = process.argv.slice(2)
  if (!workstreamId) {
    console.error('usage: npm run validation:export -- <workstreamId> [outputPath]')
    process.exitCode = 1
    return
  }
  const ctx = await getContext()
  try {
    const exported = await buildValidationExport(ctx, workstreamId)
    const jsonl = toJsonl(exported)
    const path = outputPath ?? `validation-export-${workstreamId}.jsonl`
    await writeFile(path, jsonl, 'utf8')

    console.log(`schema:        ${VALIDATION_SCHEMA_VERSION}`)
    console.log(`interventions: ${exported.interventions.length}`)
    console.log(`  shown:       ${exported.interventions.filter((i) => i.timeline.opportunityShownAt.value !== null).length}`)
    console.log(`  suppressed:  ${exported.interventions.filter((i) => i.status === 'suppressed').length}`)
    console.log(`changes with no opportunity: ${exported.unraisedChanges.length}`)
    console.log(`model runs:    ${exported.modelRuns.length}`)
    console.log(`written to     ${path}`)
    console.log('')
    console.log('n is small and the data is synthetic unless real use produced it.')
    console.log('This file contains observations. It contains no result.')
  } finally {
    await ctx.db.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
