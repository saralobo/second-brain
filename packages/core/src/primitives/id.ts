/**
 * Stable identifiers. ULID: lexicographically sortable by time, which suits an
 * append-oriented ledger. Spec requires only "stable ID, never reused".
 *
 * Implemented locally with Crockford base32 so `core` keeps no dependencies.
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LEN = 10
const RANDOM_LEN = 16

function randomByte(): number {
  // Math.random is sufficient here: IDs need uniqueness, not unpredictability.
  // Nothing in AVA derives authorisation or secrecy from an ID.
  return Math.floor(Math.random() * 256)
}

function encodeTime(now: number): string {
  let out = ''
  let t = now
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = t % 32
    out = ENCODING[mod] + out
    t = (t - mod) / 32
  }
  return out
}

function encodeRandom(): string {
  let out = ''
  for (let i = 0; i < RANDOM_LEN; i++) out += ENCODING[randomByte() % 32]
  return out
}

/** Generates a ULID for the given instant (defaults to now). */
export function ulid(seedTime: number = Date.now()): string {
  return encodeTime(seedTime) + encodeRandom()
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export function isUlid(value: string): boolean {
  return ULID_RE.test(value)
}
