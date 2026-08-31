import { buildProviderRegistry, callThroughBoundary, createTestContext } from '../index'
import { capture } from '../capture-service'

/**
 * Controlled provider verification (Slice 3 provider gate, §12).
 *
 * ONE external call, against CLASS 0 synthetic data only, in a throwaway
 * in-memory database. Its purpose is to verify the technical pipeline, not to
 * answer anything about real work.
 *
 * If ANTHROPIC_API_KEY is absent it reports that plainly and exits 0: the gate
 * implementation is still complete, it simply cannot be marked as verified by
 * a real call.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)
const setup = await buildProviderRegistry({
  ...process.env,
  AVA_MODEL_PROVIDER: hasKey ? 'anthropic' : 'mock',
} as NodeJS.ProcessEnv)

if (!hasKey) {
  console.log('PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED')
  console.log('reason: ANTHROPIC_API_KEY is not set')
  console.log(`registry: ${setup.registry.names().join(', ')}`)
  console.log(`active provider: ${setup.active}`)
  for (const note of setup.notes) console.log(`note: ${note}`)
  process.exit(0)
}

const ctx = await createTestContext()
const ws = await ctx.workstreams.create('Gate Verification', 'Synthetic. Not real work.')

// CLASS 0: entirely fictional content written for this check.
const seeded = await capture(ctx, {
  workstreamId: ws.id,
  type: 'decision',
  title: 'Synthetic decision for pipeline verification',
  content:
    'For the fictional Project Alpha, annotations are stored on the device only. ' +
    'This sentence exists solely to verify the provider pipeline.',
})
if (!seeded.ok) throw new Error('synthetic capture failed')

const started = Date.now()
const out = await callThroughBoundary(ctx, { registry: setup.registry, caps: setup.caps }, {
  archetype: 'state_query_answer',
  purpose: 'provider gate verification',
  promptId: 'gate.verification',
  promptVersion: 'v1',
  providerName: setup.active,
  evidenceIds: [seeded.evidence.id],
  synthetic: true,
  system:
    'You answer strictly from the provided evidence. ' +
    'Reply with JSON only: {"where_are_annotations_stored": string, "evidence_id": string}.',
  buildUserMessage: (items) =>
    items.map((i) => `[${i.id}] ${i.text}`).join('\n') +
    '\n\nWhere are annotations stored? Answer as JSON.',
  validate: (v: unknown) => {
    const o = v as Record<string, unknown>
    return typeof o?.where_are_annotations_stored === 'string' && typeof o?.evidence_id === 'string'
      ? (o as { where_are_annotations_stored: string; evidence_id: string })
      : null
  },
})

if (!out.ok) {
  console.log('CONTROLLED REAL CALL: FAILED')
  console.log(`stage: ${out.stage}`)
  console.log(`reason: ${out.reason}`)
  if (out.modelRunId) {
    const run = await ctx.modelRuns.findById(out.modelRunId)
    console.log(`model_run: ${run?.id} status=${run?.status}`)
  }
  await ctx.db.close()
  process.exit(1)
}

const run = await ctx.modelRuns.findById(out.modelRunId)
console.log('CONTROLLED REAL CALL: PASS')
console.log(`model identifier : ${out.modelIdentifier}`)
console.log(`input tokens     : ${run?.input_tokens}`)
console.log(`output tokens    : ${run?.output_tokens}`)
console.log(`latency ms       : ${run?.latency_ms ?? Date.now() - started}`)
console.log(`cost usd         : ${run?.actual_cost_usd}`)
console.log(`price table      : ${run?.price_table_version}`)
console.log(`evidence ids     : ${JSON.stringify(run?.evidence_ids)}`)
console.log(`prompt           : ${run?.prompt_id}@${run?.prompt_version}`)
console.log(`schema result    : valid`)
console.log(`model_run status : ${run?.status}`)
await ctx.db.close()
