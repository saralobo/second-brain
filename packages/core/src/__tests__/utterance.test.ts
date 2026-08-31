import { describe, expect, it } from 'vitest'
import { WHEN_QUESTION, classifyUtterance, confirmationFor } from '../index'

/**
 * Utterance classification (I4).
 *
 * The rule under test is that ambiguity produces a question and never a write.
 * A wrongly inferred capture puts a false row into an append-only ledger, and
 * the only remedy is a correction that is itself part of the record.
 */
describe('classifying what a sentence is doing', () => {
  it('recognises a question', () => {
    for (const q of [
      'What needs my attention today?',
      'What changed in the credit project?',
      'Tell me more about the proposal',
      'Which commitments are approaching?',
    ]) {
      const u = classifyUtterance(q)
      expect(u.kind, q).toBe('question')
      expect(u.writes).toBe(false)
    }
  })

  it('recognises an explicit decision', () => {
    const u = classifyUtterance('AVA, record that we decided to go with option B.')
    expect(u.kind).toBe('decision')
    expect(u.writes).toBe(true)
    expect(u.payload).not.toMatch(/^AVA, record that/i)
  })

  it('recognises a commitment', () => {
    const u = classifyUtterance('I need to present the pilot plan on Tuesday.')
    expect(u.kind).toBe('commitment')
    expect(u.writes).toBe(true)
  })

  it('recognises a declaration about how the user works', () => {
    const u = classifyUtterance(
      'Remember that for technical architecture I prefer detailed reasoning.')
    expect(u.kind).toBe('declaration')
    expect(u.writes).toBe(true)
  })

  /**
   * Checked before anything it could be mistaken for. "No — it was Thursday" is
   * a correction; treating it as a fresh capture would leave two contradictory
   * rows instead of a chain.
   */
  it('recognises a correction before it looks like a capture', () => {
    for (const c of [
      'Correction: that preference only applies to architecture decisions.',
      'Actually, we moved it to Thursday.',
      "No, that's wrong.",
    ]) {
      expect(classifyUtterance(c).kind, c).toBe('correction')
    }
  })

  it('recognises a request for evidence', () => {
    for (const w of ['Why?', 'Show me the evidence', 'Show me why']) {
      const u = classifyUtterance(w)
      expect(u.kind, w).toBe('why')
      expect(u.writes).toBe(false)
    }
  })

  it('refuses to guess when it cannot tell', () => {
    const u = classifyUtterance('The launch date thing')
    expect(u.kind).toBe('ambiguous')
    expect(u.writes).toBe(false)
    expect(u.reason).toContain('cannot tell')
  })

  it('treats an empty utterance as ambiguous, never as a write', () => {
    expect(classifyUtterance('   ').writes).toBe(false)
  })

  it('never marks an ambiguous utterance as writing', () => {
    for (const text of ['hmm', 'the credit project', 'option B', 'friday']) {
      const u = classifyUtterance(text)
      if (u.kind === 'ambiguous') expect(u.writes, text).toBe(false)
    }
  })
})

describe('temporal capture', () => {
  it('notices when the sentence places the event before now', () => {
    for (const past of [
      'Yesterday we changed the launch date.',
      'Last week we decided to use option B.',
      'We moved it three days ago.',
      'On Tuesday we agreed to ship.',
    ]) {
      expect(classifyUtterance(past).impliesPast, past).toBe(true)
    }
  })

  it('does not invent a past for something stated as happening now', () => {
    expect(classifyUtterance('We decided to go with option B.').impliesPast).toBe(false)
  })

  it('has a question to ask when the time is missing', () => {
    expect(WHEN_QUESTION).toBe('When did that happen?')
  })
})

/**
 * The confirmation has to be checkable. "Got it" cannot be verified against
 * what the user said; a specific sentence can, and a mis-transcription is
 * caught before it reaches the ledger rather than after.
 */
describe('confirmation before writing', () => {
  it('repeats what AVA understood, specifically', () => {
    const u = classifyUtterance('Record that we decided to launch Friday.')
    const line = confirmationFor(u, 'effective today')
    expect(line).toContain('decision')
    expect(line).toContain('launch Friday')
    expect(line).toContain('effective today')
    expect(line).toMatch(/confirm\?$/i)
  })

  it('never confirms with a vague acknowledgement', () => {
    for (const kind of ['decision', 'commitment', 'declaration', 'correction', 'capture'] as const) {
      const u = { ...classifyUtterance('Record that we shipped it.'), kind }
      const line = confirmationFor(u, 'effective today')
      expect(line.toLowerCase()).not.toBe('got it.')
      expect(line.length).toBeGreaterThan(20)
    }
  })

  it('says the earlier version survives when confirming a correction', () => {
    const u = classifyUtterance('Correction: it was Thursday.')
    expect(confirmationFor(u, 'effective today')).toContain('stays readable')
  })
})
