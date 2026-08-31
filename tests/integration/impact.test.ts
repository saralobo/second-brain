import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { seedProjectAlpha, seedSupersedingEvidence } from '@ava/app'

/**
 * GS-02, impact half. The Opportunity half belongs to Slice 5 and is not
 * implemented or asserted here.
 */
describe('impact propagation without a Work Graph', () => {
  it('marks a dependent item as potentially impacted when its basis is superseded', async () => {
    await withTestContext(async (ctx) => {
      const seed = await seedProjectAlpha(ctx)
      await seedSupersedingEvidence(ctx, seed.workstreamId, seed.decisionObjectId)

      const changes = await ctx.changes.listByWorkstream(seed.workstreamId)
      const dependencyImpact = changes.find((c) => c.changeType === 'dependency_impacted')
      expect(dependencyImpact).toBeDefined()
      expect(dependencyImpact?.objectId).toBe(seed.artifactObjectId)
      expect(dependencyImpact?.candidateDependencies).toContain(seed.decisionObjectId)
    })
  })

  it('uses a flat relationship table, with no graph technology', async () => {
    await withTestContext(async (ctx) => {
      await seedProjectAlpha(ctx)
      const rels = await ctx.state.relationships()
      expect(rels.length).toBeGreaterThanOrEqual(1)
      expect(rels[0]?.kind).toBe('depends_on')
      const extensions = await ctx.db.query<{ extname: string }>('SELECT extname FROM pg_extension')
      expect(extensions.rows.map((r) => r.extname)).not.toContain('vector')
    })
  })
})
