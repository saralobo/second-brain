import { createTestContext } from '../context'
import { runAnswerEval, seedEvalCorpus } from '../eval/answer-eval'

/**
 * npm run eval:answers
 *
 * Runs in an in-memory database against synthetic data, in mock mode. It
 * never touches the developer's store and never contacts a provider.
 */
async function main(): Promise<void> {
  const ctx = await createTestContext()
  const ws = await seedEvalCorpus(ctx)
  const m = await runAnswerEval(ctx, ws)

  console.log('AVA grounded answering eval — pipeline only')
  console.log('')
  console.log(`cases:                  ${m.cases}`)
  console.log(`schema validity:        ${m.schemaValid}/${m.cases}`)
  console.log(`expected behaviour:     ${m.groundedCorrect}/${m.cases}`)
  console.log(`unsupported assertions: ${m.unsupportedAssertions}`)
  console.log(`evidence fidelity:      ${m.evidenceFidelity}/${m.cases}`)
  console.log(`abstentions:            ${m.abstentions} (expected ${m.expectedAbstentions})`)
  console.log(`latency p50 / max:      ${m.latencyMsP50}ms / ${m.latencyMsMax}ms`)
  console.log(`cost:                   $${m.costUsd.toFixed(6)}`)
  if (m.failures.length > 0) {
    console.log('')
    console.log('failures:')
    for (const f of m.failures) console.log(`  ${f.id}: ${f.detail}`)
  }
  console.log('')
  console.log('provider:  mock (no external call)')
  console.log('quality:   PENDING REAL PROVIDER')
  console.log('challenger: CHALLENGER EVAL DEFERRED UNTIL ADAPTER/EVAL GATE')
  console.log('')
  console.log('Synthetic corpus. A technical result, never product validation evidence.')

  await ctx.db.close()
  if (m.failures.length > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
