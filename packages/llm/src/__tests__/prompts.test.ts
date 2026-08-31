import { describe, expect, it } from 'vitest'
import { GROUNDED_ANSWER_V1, GROUNDED_ANSWER_V2, PromptRegistry } from '../prompts'

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
    expect(() => new PromptRegistry().get('grounded-answer', 'v9')).toThrow(/not registered/)
  })

  it('keeps v1 frozen when v2 is registered beside it', () => {
    const r = new PromptRegistry()
    // A ModelRun recording v1 must keep meaning what it meant when it ran.
    expect(r.get('grounded-answer', 'v1').system).toBe(GROUNDED_ANSWER_V1.system)
    expect(r.get('grounded-answer', 'v2').system).not.toBe(GROUNDED_ANSWER_V1.system)
  })

  it('v2 states the authority rules the answer contract now depends on', () => {
    const s = GROUNDED_ANSWER_V2.system
    expect(s).toMatch(/DECLARED BY THE USER/)
    expect(s).toMatch(/HYPOTHESES/)
    expect(s).toMatch(/NEVER write "you prefer X"/)
    expect(s).toMatch(/applies only inside the scope shown/)
    expect(s).toMatch(/superseded declaration/)
    // The rules v1 established must survive into v2.
    expect(s).toMatch(/ONLY the evidence provided/)
    expect(s).toMatch(/Never invent/)
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
