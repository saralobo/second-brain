# AVA Interaction Layer v0.1 — Experience Freeze

```text
Status: FROZEN
Date: 2026-08-31
Frozen at commit: 0bc20be — the interaction layer tree, clean and green
Cognitive V0: FUNCTIONALLY COMPLETE — unchanged by this layer
Prospective Validation: NOT STARTED
Blocking owner decisions before Warm-up Day 1: 2
```

> The interface is frozen **before** Warm-up Day 1. Changing the instrument
> mid-study would invalidate the longitudinal comparison, which is the whole
> reason the validation start was deferred to this point.

**What is frozen is semantics, not pixels.** Colour values, radii, easing
curves and copy may be refined without a protocol deviation. Anything below
may not.

---

## Frozen — Global AVA shell

- **The root is AVA**, not a list of projects. Six destinations: Home · Live ·
  Today · Ask AVA · Workstreams · Memory.
- **Workstreams remain a context boundary, not the navigation model.**
- **The current scope is always visible**, and a question's scope is never
  implicit.

## Frozen — AVA Core semantics

- Eight states: `idle` `listening` `processing` `speaking` `attention`
  `degraded` `insufficient` `error`.
- **Every state corresponds to a real system condition.** No decorative state
  exists, and none may be added without a real condition behind it.
- **`degraded` and `insufficient` are driven by real `ContextHealthState`.**
- **`error` is visually distinct from `insufficient`.** Technical failure is not
  epistemic uncertainty and must never look like it.
- **State is never carried by motion or colour alone.** A text label is always
  present; `prefers-reduced-motion` yields static differentiated forms.

## Frozen — visual interaction principles

- Dark spatial environment; depth from translucency and layering.
- **AVA Core is the only expressive gradient surface.** Cards stay quiet.
- Motion encodes state. Nothing loops purely for atmosphere.
- Contrast met against the dark ground; full keyboard operation; voice is an
  addition to the interface, never a replacement.

## Frozen — Live semantics

- **Never listening by default.** Live is entered and ended deliberately.
- **Consent before the microphone opens**, server-rendered, revocable, naming
  exactly what is not local.
- **Microphone state visible at all times.** Ambiguous state is a defect.
- **Turn-based with automatic return to listening.** Continuing costs no click.
- **Interruption is by action** — click the Core or press Escape. This is not
  acoustic barge-in and is never described as full duplex.
- **An interrupted answer is marked interrupted** in the transcript.
- **Failure is reported as failure.** Transcription errors are never guessed at.
- **The transcript is not ephemeral**; it persists like any conversation.

## Frozen — voice architecture (ADR-24)

```text
browser SpeechRecognition → canonical AVA cognition → local speechSynthesis
```

- Speech output is **fully local**; no external TTS in v0.1.
- Speech input reaches the browser vendor in most browsers. **Disclosed, not
  minimised.**
- **No AVA content enters the audio path** — no evidence, no memory, no
  declarations, no Context Packets.
- The speech layer is confined to one file behind two interfaces, so replacing
  it with local Whisper is a file rather than a refactor.

## Frozen — voice does not own cognition

The voice layer may **never** independently create Evidence, create or modify
memory, create Declared Cognition, promote a hypothesis, make a state-changing
decision, bypass Context Health, bypass grounding, or bypass the provider
boundary.

**One brain. Live is a mode of interacting with it.**

## Frozen — conversation continuity

- Session state is **interaction context, not permanent cognition**. There is no
  second memory store for Live.
- Scope persists across turns within a session and is always visible.
- A follow-up is interpreted as continuation only where existing cognition and
  scope rules already allow it.

## Frozen — capture confirmation

- Every write is confirmed with a **specific restatement**, never a vague
  acknowledgement.
- **Ambiguity produces a question, never a write.**
- **`observedAt` is elicited** whenever the utterance implies the past.
- Declared autonomy limits and `must_confirm_action` bind unchanged.
- Every write routes through the existing domain services. No second path.

## Frozen — Why behaviour

- Reachable from every assertion, in both transports.
- Live shows a grounding indicator — source count and strength — and opens the
  visual Why without ending the session.
- **No chain-of-thought, in either mode.**

## Frozen — Global Today behaviour

- **Aggregation only.** No cross-workstream retrieval, no global Context Packet.
- Every item names its originating workstream.
- **No global score. No global Context Health.**
- Existing caps hold across the union: 3 per block, 10 per briefing.
- A workstream in `INSUFFICIENT` contributes nothing.
- Empty states are real answers, stated in words.

## Frozen — cross-workstream boundary

AVA may report across projects. She may **not** reason across them. A question
requiring a single Context Packet spanning workstreams is **refused with its
reason**, never answered from one project and presented as global.

ADR-23 remains deferred.

---

## Not frozen

Colour values · radii · easing durations · copy wording · Core geometry
parameters · voice selection order · layout spacing · which system voice is
chosen.

These may be refined during validation without a protocol deviation, provided
no frozen semantic above changes.

---

## Validation compatibility

### Resolved by this freeze

| Item | Resolution |
| --- | --- |
| `shown_at` semantics | **unchanged** — the server marked it delivered. Global Today delivers exactly as workstream Today does |
| `feedback_at`, `user_action_at`, `outcome_at` | **unchanged** |
| Validation export schema | **unchanged** — `v0.1`, byte-identical shape |
| Every intervention records its workstream | **yes** — D-21 denominators remain computable |
| Locked thresholds | **none altered** |
| Checkpoint scope | **unchanged** — per workstream. Global Today composes over independent per-workstream checkpoints; no schema change was made |

### Blocking owner decisions — 2

**BD-01 — D-19 withdrawal versus global Ask AVA.** *(Must be resolved before
Warm-up Day 1.)*

Global Ask and Live let the user reconstruct the briefing in one sentence:
*"What needs my attention today?"* During a withdrawal week that turns D-19
into a comparison of **push versus pull** rather than **proactivity versus
none**. That is a legitimate question and not the one D-19 was locked to
answer.

Options: restrict global attention queries during withdrawal weeks (preserves
the locked comparison, degrades the product for two weeks) · redefine D-19 as
push-versus-pull (honest, and a different hypothesis) · drop withdrawal (loses
the only evidence separating "AVA is useful" from "structured notes are
useful").

**Not chosen here.** It changes what the study measures.

**BD-02 — spoken delivery telemetry.** Live makes two events genuinely
observable: `spoken_delivery_started_at` and `spoken_delivery_completed_at`.

**`user_heard_at` is not observable** and must not be introduced. AVA can
observe that she spoke; she cannot observe that anyone listened. Renaming the
former as the latter is forbidden.

Whether to instrument the two observable events is an owner decision. Neither
alters a locked threshold.

### Clarifications required, non-blocking

- **PM-03 unit.** Attention waste is per briefing. With a global briefing the
  protocol must state whether PM-03 is measured globally, per workstream, or
  both. Per-workstream attribution is preserved either way.
- **D-16 modality.** The 60 min/week ceiling was locked against form-based
  capture. Speaking a decision is faster, so the same ceiling is a looser test
  of H-03. **The threshold is not changed**; the modality is recorded so a
  burden improvement caused by the interface is not read as evidence that manual
  capture is sustainable.
- **D-06 modality.** Coverage may behave differently when answering feedback is
  a spoken sentence rather than two dropdowns.

**No locked threshold is altered by this freeze.**

---

## Status

```text
AVA COGNITIVE V0 — FUNCTIONALLY COMPLETE
AVA INTERACTION LAYER v0.1 — FROZEN
AVA LIVE v0.1 — FUNCTIONAL
PROSPECTIVE VALIDATION — READY FOR FINAL PRE-EXECUTION LOCK
D-21 — PENDING
```

## Next gate

`Resolve final validation compatibility decisions and lock D-21`
