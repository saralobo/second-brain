import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { EVAL_CASES, runAnswerEval, seedEvalCorpus } from '@ava/app'

/**
 * The S3-T13 eval, in CI.
 *
 * It runs in mock mode, so it measures the pipeline and nothing else. Answer
 * quality against a real provider stays PENDING REAL PROVIDER: no result here
 * may be read as evidence about a model.
 */
describe('grounded answering eval (pipeline only)', () => {
  it('behaves as specified on every case, and invents nothing', async () => {
    await withTestContext(async (ctx) => {
      const ws = await seedEvalCorpus(ctx)
      const m = await runAnswerEval(ctx, ws)

      expect(m.cases).toBe(EVAL_CASES.length)
      expect(m.failures).toEqual([])
      expect(m.groundedCorrect).toBe(m.cases)
      expect(m.unsupportedAssertions).toBe(0)
      expect(m.evidenceFidelity).toBe(m.cases)
      expect(m.abstentions).toBe(m.expectedAbstentions)
      // Mock mode cannot cost anything; a non-zero figure would mean an
      // external call happened where none was authorised.
      expect(m.costUsd).toBe(0)
    })
  })
})
