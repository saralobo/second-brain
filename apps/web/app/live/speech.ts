/**
 * Browser speech, isolated behind two small interfaces.
 *
 * Confined to one file on purpose, exactly as the Anthropic SDK is: the rest of
 * the application talks to `Listener` and `Speaker` and knows nothing about the
 * Web Speech API. Swapping in local Whisper later is then a file, not a
 * refactor.
 *
 * ADR-24 records the honest position: speech OUTPUT here is fully local —
 * `speechSynthesis` uses operating-system voices and makes no network request.
 * Speech INPUT is not. `SpeechRecognition` is implemented in most browsers by
 * streaming audio to the browser vendor. That is a property of the platform, not
 * a choice AVA can make, and it is why Live requires explicit consent.
 */

export interface ListenerEvents {
  /** Partial text, updated while the user is still speaking. */
  onInterim: (text: string) => void
  /** The utterance, once the recogniser settles. */
  onFinal: (text: string) => void
  /** Rough vocal energy, 0–1, for the Core to react to. */
  onEnergy: (level: number) => void
  onError: (message: string) => void
  onEnd: () => void
}

export interface Listener {
  start: () => void
  stop: () => void
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  onaudiostart: (() => void) | null
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null
}

export function speechRecognitionAvailable(): boolean {
  return recognitionCtor() !== null
}

/**
 * Creates a listener.
 *
 * Energy comes from a separate `getUserMedia` analyser rather than from the
 * recogniser, which reports no levels. The two run on the same microphone
 * permission, and the analyser is what lets the Core react acoustically instead
 * of merely animating while a flag is true.
 */
export function createListener(events: ListenerEvents): Listener | null {
  const Ctor = recognitionCtor()
  if (Ctor === null) return null

  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'

  let audioCtx: AudioContext | null = null
  let stream: MediaStream | null = null
  let raf = 0

  const stopEnergy = (): void => {
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    void audioCtx?.close().catch(() => undefined)
    audioCtx = null
    events.onEnergy(0)
  }

  const startEnergy = async (): Promise<void> => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
      if (Ctx === undefined) return
      audioCtx = new Ctx()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = (): void => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) {
          const d = (v - 128) / 128
          sum += d * d
        }
        // RMS, scaled so ordinary speech lands near the middle of the range
        // rather than saturating the Core at the first syllable.
        const rms = Math.sqrt(sum / data.length)
        events.onEnergy(Math.min(1, rms * 4.5))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    } catch {
      // No analyser means no acoustic reactivity; recognition still works.
      events.onEnergy(0)
    }
  }

  recognition.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      const text = String(result[0]?.transcript ?? '')
      if (result.isFinal) {
        const trimmed = text.trim()
        if (trimmed !== '') events.onFinal(trimmed)
      } else {
        interim += text
      }
    }
    if (interim.trim() !== '') events.onInterim(interim.trim())
  }

  recognition.onerror = (e: any) => {
    const kind = String(e?.error ?? 'unknown')
    // Reported as what it is. A transcription failure is never guessed at.
    if (kind === 'no-speech') return
    events.onError(
      kind === 'not-allowed'
        ? 'Microphone permission was refused.'
        : `Speech recognition failed: ${kind}.`,
    )
  }

  recognition.onend = () => { events.onEnd() }

  return {
    start: () => {
      void startEnergy()
      try { recognition.start() } catch { /* already running */ }
    },
    stop: () => {
      stopEnergy()
      try { recognition.stop() } catch { /* already stopped */ }
    },
  }
}

export interface Speaker {
  speak: (text: string, onEnergy: (level: number) => void) => Promise<void>
  cancel: () => void
  available: boolean
  voiceName: string | null
}

/** Voices that read as feminine, in rough order of quality on macOS. */
const PREFERRED = ['samantha', 'ava', 'allison', 'serena', 'karen', 'moira', 'tessa', 'zira', 'female']

/**
 * Local speech output.
 *
 * `speechSynthesis` runs entirely on the device: nothing is uploaded, nothing
 * is billed, and the first audio starts in tens of milliseconds.
 *
 * The Core's reaction while AVA speaks is driven by `onboundary`, which fires
 * per word. That is genuinely her cadence rather than an animation timed to a
 * guess — coarser than an audio analyser, and honest about what it is.
 */
export function createSpeaker(): Speaker {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window
  let chosen: SpeechSynthesisVoice | null = null

  const pick = (): SpeechSynthesisVoice | null => {
    if (!available) return null
    if (chosen !== null) return chosen
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
    for (const name of PREFERRED) {
      const match = english.find((v) => v.name.toLowerCase().includes(name))
      if (match !== undefined) { chosen = match; return chosen }
    }
    chosen = english[0] ?? voices[0] ?? null
    return chosen
  }

  return {
    available,
    get voiceName() { return pick()?.name ?? null },
    cancel: () => { if (available) window.speechSynthesis.cancel() },
    speak: (text, onEnergy) => new Promise<void>((resolve) => {
      if (!available || text.trim() === '') { resolve(); return }
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const voice = pick()
      if (voice !== null) u.voice = voice
      // Calm and composed rather than brisk or breathy.
      u.rate = 1.0
      u.pitch = 1.0
      let pulse = 0
      u.onboundary = () => {
        pulse = 1
        onEnergy(pulse)
        // Decay between words, so the Core breathes with her speech instead of
        // flickering on and off.
        const decay = setInterval(() => {
          pulse -= 0.12
          if (pulse <= 0) { clearInterval(decay); onEnergy(0) } else onEnergy(pulse)
        }, 40)
      }
      const done = (): void => { onEnergy(0); resolve() }
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    }),
  }
}
