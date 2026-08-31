import { getContext } from '../context'
import { correctCognition, declareCognition, revokeCognition } from '../cognition-service'
import { rebuildStaleViews } from '../memory-service'
import type { CognitionType } from '@ava/core'

/**
 * Declared Cognition from the command line.
 *
 *   npm run cognition -- declare  <workstreamId> "<content>" [type]
 *   npm run cognition -- correct  <workstreamId> "<content>"
 *   npm run cognition -- list     [workstreamId]
 *   npm run cognition -- revoke   <cognitionId> "<reason>"
 *
 * `correct` applies to the most recent active declaration in the workstream,
 * which is what makes it usable from a script; the UI always corrects the
 * declaration the user is actually looking at.
 */
async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const ctx = await getContext()

  try {
    switch (command) {
      case 'declare': {
        const [workstreamId, content, type] = rest
        if (!workstreamId || !content) return usage()
        const out = await declareCognition(ctx, {
          content,
          cognitionType: (type as CognitionType) ?? 'contextual_preference',
          workstreamId,
        })
        console.log(`declared ${out.cognition.id} (v${out.cognition.version})`)
        console.log(`evidence ${out.evidence.id}`)
        break
      }
      case 'correct': {
        const [workstreamId, content] = rest
        if (!workstreamId || !content) return usage()
        const active = await ctx.cognition.listActive(workstreamId)
        const target = active[0]
        if (!target) {
          console.error('nothing to correct: no active declaration in this workstream')
          process.exitCode = 1
          return
        }
        const out = await correctCognition(ctx, { cognitionId: target.id, content })
        const rebuilt = await rebuildStaleViews(ctx, workstreamId)
        console.log(`corrected ${target.id} -> ${out.cognition.id} (v${out.cognition.version})`)
        console.log(`superseded ${out.superseded?.id ?? 'none'}`)
        console.log(`views rebuilt ${rebuilt.rebuilt}, dropped ${rebuilt.dropped}`)
        break
      }
      case 'revoke': {
        const [cognitionId, reason] = rest
        if (!cognitionId) return usage()
        await revokeCognition(ctx, cognitionId, reason ?? 'no longer applies')
        console.log(`revoked ${cognitionId}`)
        break
      }
      case 'list': {
        const [workstreamId] = rest
        const all = await ctx.cognition.listAll()
        for (const c of all) {
          const scoped = workstreamId && c.workstreamId !== null && c.workstreamId !== workstreamId
          if (scoped) continue
          console.log(
            `${c.status.padEnd(10)} v${c.version} ${c.cognitionType.padEnd(22)} ${c.id}  ${c.content}`,
          )
        }
        break
      }
      default:
        usage()
    }
  } finally {
    await ctx.db.close()
  }
}

function usage(): void {
  console.error('usage: npm run cognition -- <declare|correct|revoke|list> ...')
  process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
