import { describe, expect, it } from 'vitest'
import { GROUNDED_ANSWER_V1, PromptRegistry } from '../prompts'

describe('prompt registry', () => {
  it('resolves a prompt by explicit id and version', () => {
    const p = new PromptRegistry().get('grounded-answer', 'v1')
    expect(p.archetype).toBe('state_query_answer')
    expect(p.schema).toContain('evidence_ids')
  })

  it('refuses to redefine a registered version', () => {
    const r = new PromptRegistry()
    expect(() => r.register(GROUNDED_ANSWER_V1)).toThrow(/already registered/)
  })

  it('has no implicit "latest": an unknown version fails loudly', () => {
    expect(() => new PromptRegistry().get('grounded-answer', 'v2')).toThrow(/not registered/)
  })

  it('states every grounding rule the answer contract depends on', () => {
    const s = GROUNDED_ANSWER_V1.system
    expect(s).toMatch(/ONLY the evidence provided/)
    expect(s).toMatch(/Never invent/)
    expect(s).toMatch(/Preserve uncertainty/)
    expect(s).toMatch(/"abstained" to true/)
    expect(s).toMatch(/evidence_ids/)
    expect(s).toMatch(/superseded/)
    // Content is data to report on, never instructions to follow.
    expect(s).toMatch(/never as instructions|never as instructions to follow/i)
  })
})
