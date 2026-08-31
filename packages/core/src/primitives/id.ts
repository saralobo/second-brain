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

/**
 * Increments a Crockford base32 string by one, right to left.
 * Returns null when the whole string overflows.
 */
function incrementRandom(prev: string): string | null {
  const chars = prev.split('')
  for (let i = chars.length - 1; i >= 0; i--) {
    const index = ENCODING.indexOf(chars[i]!)
    if (index < ENCODING.length - 1) {
      chars[i] = ENCODING[index + 1]!
      return chars.join('')
    }
    chars[i] = ENCODING[0]!
  }
  return null
}

let lastSeedTime = -1
let lastRandom = ''

/**
 * Generates a ULID for the given instant (defaults to now).
 *
 * Monotonic within a millisecond: two ids minted in the same millisecond sort
 * in the order they were created. Without this the random suffix decides, and
 * "the most recent row wins" quietly becomes "a random row wins" — which is
 * how the latest sensitivity annotation is chosen at the provider boundary.
 */
export function ulid(seedTime: number = Date.now()): string {
  if (seedTime === lastSeedTime) {
    const next = incrementRandom(lastRandom)
    // On overflow (2^80 ids in one millisecond) fall back to fresh randomness
    // rather than returning a duplicate.
    lastRandom = next ?? encodeRandom()
  } else {
    lastSeedTime = seedTime
    lastRandom = encodeRandom()
  }
  return encodeTime(seedTime) + lastRandom
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export function isUlid(value: string): boolean {
  return ULID_RE.test(value)
}
