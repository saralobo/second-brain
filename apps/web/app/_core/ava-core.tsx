'use client'

import { useEffect, useRef } from 'react'

/**
 * AVA Core — her visual presence.
 *
 * A non-figurative fluid core: several overlapping translucent lobes sharing a
 * centre, each with its own radial gradient and phase, composited additively.
 * The silhouette is a polar radius perturbed by a small sum of sines, which is
 * cheap and reads as organic motion rather than as a spinning shape.
 *
 * Canvas 2D rather than WebGL, deliberately. The look here comes from layered
 * gradients and soft compositing, both of which Canvas does well; WebGL would
 * add a shader pipeline and a fallback path for no visible gain at this size.
 *
 * Motion carries meaning. Every state differs in more than colour — amplitude,
 * coherence, rotation direction and silhouette completeness all change — so the
 * state remains readable without colour vision and, under reduced motion, from
 * a single static frame.
 */
export type CoreState =
  | 'idle' | 'listening' | 'processing' | 'speaking'
  | 'attention' | 'degraded' | 'insufficient' | 'error'

export const CORE_STATES: readonly CoreState[] = [
  'idle', 'listening', 'processing', 'speaking',
  'attention', 'degraded', 'insufficient', 'error',
] as const

/** Plain-language label. Never omitted: motion is never the only carrier. */
export const CORE_STATE_LABEL: Record<CoreState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
  attention: 'Needs your attention',
  degraded: 'Context is incomplete',
  insufficient: 'Not enough context',
  error: 'Something failed',
}

interface Profile {
  /** Base radius as a fraction of the canvas. */
  scale: number
  /** How far the silhouette deviates from a circle. */
  wobble: number
  /** Radians per second. Negative reads as inward. */
  spin: number
  /** 0 = fragmented, 1 = fully coherent. Drives lobe alignment. */
  coherence: number
  /** Fraction of the silhouette that is missing, as an open arc. */
  opening: number
  /** Overall luminance multiplier. */
  glow: number
  hues: [number, number, number]
  /** Whether live audio amplitude deforms the surface. */
  reactive: boolean
}

const PROFILES: Record<CoreState, Profile> = {
  // Available, not demanding. Slow, even, whole.
  idle: { scale: 0.60, wobble: 0.045, spin: 0.10, coherence: 1, opening: 0, glow: 0.82, hues: [226, 258, 208], reactive: false },
  // Reacts to what it hears. Expanded and alert.
  listening: { scale: 0.64, wobble: 0.075, spin: 0.16, coherence: 1, opening: 0, glow: 1.0, hues: [222, 250, 200], reactive: true },
  // Contracted and turning inward. Deliberately unlike listening.
  processing: { scale: 0.50, wobble: 0.030, spin: -0.85, coherence: 0.72, opening: 0, glow: 0.88, hues: [232, 268, 214], reactive: false },
  // AVA is the active speaker; rhythm follows her own audio.
  speaking: { scale: 0.63, wobble: 0.085, spin: 0.22, coherence: 1, opening: 0, glow: 1.05, hues: [268, 292, 232], reactive: true },
  // A steady off-axis accent. Never flashing.
  attention: { scale: 0.61, wobble: 0.050, spin: 0.13, coherence: 0.94, opening: 0, glow: 0.95, hues: [42, 30, 214], reactive: false },
  // Visibly incomplete: the form does not close.
  degraded: { scale: 0.58, wobble: 0.060, spin: 0.09, coherence: 0.55, opening: 0.16, glow: 0.72, hues: [40, 26, 210], reactive: false },
  // Further open, dimmer. She looks less certain because she is.
  insufficient: { scale: 0.53, wobble: 0.038, spin: 0.06, coherence: 0.34, opening: 0.30, glow: 0.50, hues: [220, 228, 200], reactive: false },
  // Technical failure. Fragmented and irregular — not the same as uncertainty.
  error: { scale: 0.55, wobble: 0.130, spin: 0.42, coherence: 0.22, opening: 0.09, glow: 0.86, hues: [354, 8, 340], reactive: false },
}

const LOBES = 3
const POINTS = 96

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function lerpProfile(a: Profile, b: Profile, t: number): Profile {
  return {
    scale: lerp(a.scale, b.scale, t),
    wobble: lerp(a.wobble, b.wobble, t),
    spin: lerp(a.spin, b.spin, t),
    coherence: lerp(a.coherence, b.coherence, t),
    opening: lerp(a.opening, b.opening, t),
    glow: lerp(a.glow, b.glow, t),
    hues: [
      lerp(a.hues[0], b.hues[0], t),
      lerp(a.hues[1], b.hues[1], t),
      lerp(a.hues[2], b.hues[2], t),
    ],
    reactive: t < 0.5 ? a.reactive : b.reactive,
  }
}

export interface AvaCoreProps {
  state: CoreState
  /** Live audio energy, 0–1. Read only in reactive states. */
  amplitude?: number
  size?: number
  /** Rendered as a button when Live can be entered by pressing the Core. */
  onActivate?: () => void
  activateLabel?: string
}

export function AvaCore({
  state, amplitude = 0, size = 260, onActivate, activateLabel,
}: AvaCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<CoreState>(state)
  const ampRef = useRef(0)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { ampRef.current = amplitude }, [amplitude])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    let raf = 0
    let t = 0
    let shown: Profile = { ...PROFILES[stateRef.current] }
    // Smoothed amplitude: raw levels are jittery, and a jittery core reads as
    // broken rather than as responsive.
    let smoothAmp = 0
    let last = performance.now()

    const draw = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!reduced) t += dt

      const target = PROFILES[stateRef.current]
      // Transitions are eased rather than cut: the transition is part of the
      // information, and a hard swap loses it.
      shown = reduced ? target : lerpProfile(shown, target, Math.min(dt * 4.5, 1))

      const raw = shown.reactive ? Math.max(0, Math.min(1, ampRef.current)) : 0
      smoothAmp = reduced ? raw : smoothAmp + (raw - smoothAmp) * Math.min(dt * 9, 1)

      const c = size / 2
      const base = size * shown.scale * (1 + smoothAmp * 0.17)

      ctx.clearRect(0, 0, size, size)
      ctx.globalCompositeOperation = 'lighter'

      for (let lobe = 0; lobe < LOBES; lobe++) {
        const phase = (lobe / LOBES) * Math.PI * 2
        // Low coherence pushes the lobes apart, so an incomplete context reads
        // as a form that has not settled.
        const drift = (1 - shown.coherence) * size * 0.085
        const cx = c + Math.cos(t * 0.5 + phase) * drift
        const cy = c + Math.sin(t * 0.42 + phase * 1.3) * drift
        const hue = shown.hues[lobe] ?? shown.hues[0]

        ctx.beginPath()
        for (let i = 0; i <= POINTS; i++) {
          const a = (i / POINTS) * Math.PI * 2

          // The opening: a wedge where the radius collapses toward the centre,
          // leaving the silhouette visibly unclosed.
          let openFactor = 1
          if (shown.opening > 0) {
            const gapCentre = Math.PI * 1.5
            let d = Math.abs(((a - gapCentre + Math.PI) % (Math.PI * 2)) - Math.PI)
            const half = shown.opening * Math.PI
            if (d < half) openFactor = 0.34 + 0.66 * (d / half)
          }

          const spin = t * shown.spin
          const w =
            Math.sin(a * 3 + spin * 2.1 + phase) * 0.55 +
            Math.sin(a * 5 - spin * 1.4 + phase * 2) * 0.30 +
            Math.sin(a * 2 + spin * 0.7) * 0.35
          const amp = shown.wobble + smoothAmp * 0.10
          const r = base * (1 + w * amp) * openFactor

          const x = cx + Math.cos(a) * r
          const y = cy + Math.sin(a) * r * 0.97
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()

        const g = ctx.createRadialGradient(
          cx - base * 0.22, cy - base * 0.28, base * 0.05,
          cx, cy, base * 1.18,
        )
        const a1 = 0.40 * shown.glow
        const a2 = 0.17 * shown.glow
        g.addColorStop(0, `hsla(${hue}, 92%, 76%, ${a1})`)
        g.addColorStop(0.45, `hsla(${hue + 14}, 84%, 62%, ${a2})`)
        g.addColorStop(1, `hsla(${hue + 26}, 74%, 46%, 0)`)
        ctx.fillStyle = g
        ctx.fill()
      }

      // Inner light: the sense of volume, and the fastest read on luminance.
      const core = ctx.createRadialGradient(
        c - base * 0.14, c - base * 0.18, 0, c, c, base * 0.72,
      )
      core.addColorStop(0, `hsla(${shown.hues[0]}, 100%, 92%, ${0.30 * shown.glow})`)
      core.addColorStop(1, 'hsla(0, 0%, 100%, 0)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(c, c, base * 0.72, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalCompositeOperation = 'source-over'

      if (!reduced) raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size])

  const label = CORE_STATE_LABEL[state]

  const canvas = (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`AVA — ${label}`}
      data-core-state={state}
    />
  )

  if (onActivate === undefined) {
    return <span className="core-mount">{canvas}</span>
  }
  return (
    <span className="core-mount">
      <button type="button" className="core-button" onClick={onActivate}
        aria-label={activateLabel ?? `AVA — ${label}`}>
        {canvas}
      </button>
    </span>
  )
}

/** The text label. Separate so surfaces can place it independently. */
export function CoreStateLabel({ state }: { state: CoreState }) {
  return (
    <div className="core-state" data-state={state} aria-live="polite">
      {CORE_STATE_LABEL[state]}
    </div>
  )
}
