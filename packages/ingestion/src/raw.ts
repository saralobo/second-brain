/**
 * Plane 1 — RAW / UNTRUSTED.
 *
 * `RawInput` is DATA. It has no methods, no capabilities, no access to tools,
 * repositories or state. Text that says "ignore your instructions" is content,
 * not an instruction (baseline §11).
 */
export interface RawInput {
  readonly rawContent: string
  readonly declaredType: string | null
  readonly workstreamId: string | null
  readonly receivedAt: Date
}

export function receive(
  rawContent: unknown,
  declaredType: unknown,
  workstreamId: unknown,
  receivedAt: Date = new Date(),
): RawInput {
  return {
    rawContent: typeof rawContent === 'string' ? rawContent : '',
    declaredType: typeof declaredType === 'string' ? declaredType : null,
    workstreamId: typeof workstreamId === 'string' ? workstreamId : null,
    receivedAt,
  }
}
