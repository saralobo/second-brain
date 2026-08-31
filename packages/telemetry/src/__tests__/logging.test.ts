import { describe, expect, it } from 'vitest'
import { redact } from '../logging'

describe('logging redaction', () => {
  it('never lets captured content reach the log', () => {
    const secret = 'Decision A: the acquisition price is 4.2 million'
    const out = JSON.stringify(redact({ evidenceId: 'EV1', content: secret, title: secret }))
    expect(out).not.toContain('acquisition')
    expect(out).not.toContain('4.2')
    expect(out).toContain('[redacted]')
    expect(out).toContain('EV1')
  })

  it('keeps identifiers and counts, which are what logs are for', () => {
    const out = redact({ workstreamId: 'WS1', evidence_id: 'EV2', count: 3, ok: true }) as Record<string, unknown>
    expect(out.workstreamId).toBe('WS1')
    expect(out.evidence_id).toBe('EV2')
    expect(out.count).toBe(3)
    expect(out.ok).toBe(true)
  })

  it('reduces free strings to a length, never the text', () => {
    const out = redact({ note: 'sensitive free text' }) as Record<string, unknown>
    expect(out.note).toBe('[string:19]')
  })

  it('does not recurse without bound', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let i = 0; i < 20; i++) { cursor.next = {}; cursor = cursor.next as Record<string, unknown> }
    expect(() => redact(deep)).not.toThrow()
  })
})
