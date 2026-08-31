import {
  getContext, seedArchitectureBCorrection, seedDeclaredCognition, seedProactiveScenario,
  seedProjectAlpha, seedSupersedingEvidence,
} from '@ava/app'

/**
 * Seeds the synthetic Project Alpha scenario.
 * Synthetic content only. Never validation evidence.
 */
const ctx = await getContext()
const seed = await seedProjectAlpha(ctx)
console.log(`workstream   ${seed.workstreamId}`)
console.log(`decision     ${seed.decisionObjectId}`)
console.log(`dependent    ${seed.artifactObjectId}`)

if (process.argv.includes('--cognition')) {
  const cognition = await seedDeclaredCognition(ctx, seed.workstreamId)
  console.log(`declaration  ${cognition.cognitionId}`)
  console.log(`hypothesis   ${cognition.hypothesisId ?? 'none formed'}`)
}

if (process.argv.includes('--supersede')) {
  await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)
  console.log('superseding evidence captured')
}
if (process.argv.includes('--proactive')) {
  const proactive = await seedProactiveScenario(ctx)
  console.log(`proactive ws ${proactive.workstreamId}`)
  console.log(`decision     ${proactive.decisionObjectId}`)
  console.log(`artifact     ${proactive.artifactObjectId}`)
  if (process.argv.includes('--supersede')) {
    await seedArchitectureBCorrection(ctx, proactive.workstreamId, proactive.decisionObjectId)
    console.log('architecture B correction captured')
  }
}
await ctx.db.close()
