import { getContext, seedProjectAlpha, seedSupersedingEvidence } from '@ava/app'

/**
 * Seeds the synthetic Project Alpha scenario.
 * Synthetic content only. Never validation evidence.
 */
const ctx = await getContext()
const seed = await seedProjectAlpha(ctx)
console.log(`workstream   ${seed.workstreamId}`)
console.log(`decision     ${seed.decisionObjectId}`)
console.log(`dependent    ${seed.artifactObjectId}`)

if (process.argv.includes('--supersede')) {
  await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)
  console.log('superseding evidence captured')
}
await ctx.db.close()
