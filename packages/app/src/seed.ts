import { newRelationship } from '@ava/core'
import type { AppContext } from './context'
import { capture } from './capture-service'

/**
 * Controlled synthetic seed (implementation plan §23).
 *
 * Entirely fictional. It exists to develop and demonstrate the Milestone 1
 * loop before real use.
 *
 * It is NEVER evidence of validation. A synthetic scenario proves the code
 * does what it was written to do; it says nothing about whether the product
 * thesis holds. Any report that counted these rows would be contaminated.
 */
export interface SeedResult {
  workstreamId: string
  decisionObjectId: string
  artifactObjectId: string
  evidenceIds: string[]
}

export async function seedProjectAlpha(ctx: AppContext): Promise<SeedResult> {
  const ws = await ctx.workstreams.create(
    'Project Alpha',
    'Synthetic development scenario. Not real work, not validation evidence.',
  )
  const evidenceIds: string[] = []

  const goal = await capture(ctx, {
    workstreamId: ws.id,
    type: 'goal',
    title: 'Ship a first usable version of the Alpha reader',
    content: 'The Alpha reader should let a person read and annotate a document offline.',
  })
  if (goal.ok) evidenceIds.push(goal.evidence.id)

  const decision = await capture(ctx, {
    workstreamId: ws.id,
    type: 'decision',
    title: 'Decision A: store annotations locally only',
    content:
      'Annotations are stored on the device only. No sync service in the first version, ' +
      'because offline reliability matters more than multi-device access right now.',
  })
  if (!decision.ok || !decision.change) throw new Error('seed: decision capture failed')
  evidenceIds.push(decision.evidence.id)
  const decisionObjectId = decision.change.objectId

  const artifact = await capture(ctx, {
    workstreamId: ws.id,
    type: 'risk',
    title: 'Sync spec drafted on top of Decision A',
    content:
      'A short storage spec was written assuming local-only annotations, following Decision A.',
    fields: { dependsOn: decisionObjectId },
  })
  if (!artifact.ok || !artifact.change) throw new Error('seed: dependent item capture failed')
  evidenceIds.push(artifact.evidence.id)
  const artifactObjectId = artifact.change.objectId

  // Explicit declared dependency: the spec depends on Decision A.
  await ctx.state.addRelationship(
    newRelationship(artifactObjectId, 'risk', decisionObjectId, 'decision', 'depends_on', [
      artifact.evidence.id,
    ]),
  )

  return { workstreamId: ws.id, decisionObjectId, artifactObjectId, evidenceIds }
}

/**
 * The superseding step, kept separate so a developer can watch the change
 * appear rather than finding it already present.
 */
export async function seedSupersedingEvidence(
  ctx: AppContext, workstreamId: string, decisionObjectId: string,
): Promise<void> {
  await capture(ctx, {
    workstreamId,
    type: 'correction',
    title: 'Decision A replaced: annotations sync through an encrypted store',
    content:
      'Two testers lost annotations after reinstalling. Local-only storage no longer holds. ' +
      'Annotations will sync through an encrypted store instead.',
    supersedesStateObjectId: decisionObjectId,
  })
}
