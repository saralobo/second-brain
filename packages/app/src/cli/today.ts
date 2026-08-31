import { getContext } from '../context'
import { buildBriefing } from '../briefing-service'
import { closeCheckpoint, openCheckpoint } from '../opportunity-service'
import { prepareForOpportunity } from '../preparation-service'

/**
 * Today from the command line.
 *
 *   npm run today -- <workstreamId>
 *   npm run today -- <workstreamId> checkpoint [note]
 *   npm run today -- <workstreamId> prepare <opportunityId>
 *
 * The same code path as the web surface. No provider is contacted: the whole
 * opportunity engine is deterministic.
 */
async function main(): Promise<void> {
  const [workstreamId, command, ...rest] = process.argv.slice(2)
  if (!workstreamId) {
    console.error('usage: npm run today -- <workstreamId> [checkpoint|prepare <opportunityId>]')
    process.exitCode = 1
    return
  }
  const ctx = await getContext()

  if (command === 'checkpoint') {
    await openCheckpoint(ctx, workstreamId)
    const closed = await closeCheckpoint(ctx, workstreamId, rest.join(' ') || null)
    console.log(closed === null ? 'no open checkpoint; one has been opened' : `checkpoint ${closed.id} closed`)
    return
  }

  if (command === 'prepare') {
    const [opportunityId] = rest
    if (!opportunityId) {
      console.error('usage: npm run today -- <workstreamId> prepare <opportunityId>')
      process.exitCode = 1
      return
    }
    const outcome = await prepareForOpportunity(ctx, opportunityId)
    if (outcome.prepared) {
      console.log(`prepared ${outcome.artifact.id} (${outcome.artifact.executionMode}, $0.000000)`)
      console.log(outcome.artifact.body)
    } else {
      console.log(`not prepared — ${outcome.verdict}`)
      for (const r of outcome.reasons) console.log(`  ${r}`)
    }
    console.log(`decision record: ${outcome.decisionRecordId}`)
    return
  }

  await openCheckpoint(ctx, workstreamId)
  const briefing = await buildBriefing(ctx, workstreamId, { deliver: true })
  console.log(`context health: ${briefing.contextHealth}`)
  for (const gap of briefing.gaps) console.log(`  gap: ${gap}`)
  console.log('')
  for (const block of briefing.blocks) {
    console.log(`## ${block.title}`)
    if (block.items.length === 0) console.log(`  ${block.emptyMessage}`)
    for (const item of block.items) {
      console.log(`  - ${item.headline}`)
      console.log(`    ${item.detail}`)
      console.log(`    [${item.strength}]${item.whyHref ? ` why: ${item.whyHref}` : ''}`)
      if (item.note) console.log(`    ${item.note}`)
      if (item.opportunityId) console.log(`    opportunity: ${item.opportunityId}`)
    }
    console.log('')
  }
  if (briefing.droppedByCap > 0) {
    console.log(`${briefing.droppedByCap} item(s) held back by the 10-item briefing cap`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
