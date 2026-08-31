# ADR-24 — V0 Live Audio Boundary and Speech Path

```text
Status: ACCEPTED
Date: 2026-08-31
Supersedes: nothing
Amends: ADR-22 — extends the provider boundary to cover pre-evidence audio
Blocks: nothing once accepted
Required by: Interaction Layer I3 — Live
```

---

## Context

ADR-22 governs what crosses the model boundary: **evidence**, after retrieval,
sensitivity classification, minimisation and redaction, with `evidence_ids`
recorded on a `ModelRun`.

Live Mode introduces something that pipeline never contemplated.

**Audio is pre-evidence.** A spoken utterance has not been classified, cannot be
minimised before it is understood, and may contain speech from people who never
agreed to be recorded — CLASS 3 material arriving through a channel the existing
rules do not describe. Every safeguard in ADR-22 operates on text that has
already been retrieved and labelled. Audio arrives before any of that exists.

The owner has also made an explicit product decision: **Live is not an optional
enhancement.** The target is a conversation that feels continuous, not a
push-to-talk form with text-to-speech attached. Architecture exists to support
that safely, not to refuse it.

So this ADR has to hold two things at once, and saying so plainly is the point:
a privacy posture worth keeping, and a Live experience worth using.

---

## What the runtime actually offers

Assessed against the real repository, not against a wish list. AVA is a Next.js
15 application running locally, and the browser is the only place audio can be
captured.

| Path | Where audio goes | Latency | Effort | Cost |
| --- | --- | --- | --- | --- |
| Browser `SpeechRecognition` | **browser vendor's servers, in most browsers** | ~200–600ms, streaming interim results | very low | none |
| Local Whisper (WASM) | nowhere — stays on device | 1.5–6s after the utterance ends, plus a 40–150MB model download | high | none |
| External STT API | a chosen provider | ~300–800ms | medium | per minute |
| Browser `speechSynthesis` | **nowhere — system voices, offline** | starts in ~50ms | very low | none |
| External TTS API | a chosen provider | ~400ms to first audio | medium | per character |
| External realtime voice | a provider, continuously | sub-second | high | per minute of open session |

**The finding that decides this ADR.** The web platform is asymmetric. Speech
**output** is genuinely local: `speechSynthesis` uses operating-system voices
and makes no network request. Speech **input** is not: `SpeechRecognition` is
implemented in most browsers by streaming audio to the vendor. It presents as a
browser API, and it is a network service wearing a browser API's clothes.

This asymmetry is not something AVA can fix by choosing carefully. It is a
property of the platform, and pretending otherwise would be the silent
weakening of ADR-22 this document exists to prevent.

---

## Options

### Option A — Local turn-based
Local Whisper WASM → canonical cognition → local `speechSynthesis`.

**Privacy: excellent.** No audio leaves the machine, ever. ADR-22 needs no
amendment because nothing crosses.
**Experience: poor, and poor in the specific way the owner ruled out.** Whisper
WASM cannot stream: it transcribes an utterance after it ends. The interaction
becomes press → speak → stop → wait 2–6s → answer. There is no reactive
listening state because there is no interim result. That is the
`press / wait / speak / stop / wait` sequence §1 of the brief names explicitly
as not being Live.
**Cost:** none, plus a large first-run model download.

### Option B — Hybrid Live *(recommended)*
Browser `SpeechRecognition` → canonical cognition → local `speechSynthesis`.

**Privacy: mixed, and the mix must be disclosed.** Output is fully local.
Input audio reaches the browser vendor in most browsers. No AVA content —
no evidence, no memory, no declarations — is involved: what crosses is the
user's own utterance, before AVA has interpreted it.
**Experience: good.** Interim results arrive continuously while the user speaks,
so the Core can react acoustically in real time. `speechSynthesis` begins in
tens of milliseconds. Turn boundaries exist but are perceptually thin.
**Cost:** none.

### Option C — External realtime voice transport
A realtime provider holding an open bidirectional session.

**Not rejected merely because audio crosses.** Evaluated on its merits:

| Factor | Assessment |
| --- | --- |
| Retention | provider-dependent; requires verification that cannot be done from documentation |
| Training policy | must be contractually confirmed as excluded |
| Third-party speech | **worst case of the three.** An open microphone transmits everything in the room, including people who never consented |
| Region | provider-dependent |
| Raw audio handling | continuous, unclassified, unminimisable |
| Session storage | provider-dependent |
| Consent | a single consent cannot meaningfully cover an open-ended open microphone |
| Cost | per minute of session, including silence |
| Latency | **best** — sub-second, native barge-in |
| Interruption | **best** — true acoustic full duplex |
| Observability | **worst** — a session is not a turn, so per-answer cost cannot be attributed, and D-14 (`cost/useful_intervention`) becomes an allocation exercise |
| Lock-in | high — the interaction model becomes provider-shaped |

**Experience: the best available.** It is what genuinely continuous
conversation feels like, and it would be dishonest to claim otherwise.

---

## Decision

**Option B — Hybrid Live.**

```text
browser SpeechRecognition  →  canonical AVA cognition  →  local speechSynthesis
     (disclosed)                   (unchanged)              (fully offline)
```

### Conditions, binding

1. **Explicit consent before first use.** Live cannot start until the user has
   been shown, in plain language, that speech recognition is performed by the
   browser and that in most browsers the audio reaches the browser vendor.
   Consent is recorded locally and is revocable.
2. **No AVA content in the audio path.** What crosses is the raw utterance only.
   Evidence, memory, declarations and Context Packets never enter the speech
   channel. The cognition that follows uses the existing ADR-22 pipeline
   unchanged.
3. **Visible microphone state at all times.** The user must never be uncertain
   whether AVA is listening. Ambiguous microphone state is treated as a defect.
4. **Never listening by default.** Live is entered deliberately and ends
   deliberately.
5. **Output stays local.** `speechSynthesis` only. No external TTS in v0.1.
6. **Third-party speech.** The consent copy states that anything audible is
   captured, so the user can judge the room. AVA cannot detect other speakers
   and does not claim to.
7. **Local Whisper remains the upgrade path.** If a streaming on-device model
   becomes practical, Option A's privacy with Option B's responsiveness is the
   destination, and this ADR is revisited.

### ADR-22 amendment

ADR-22 is extended, not weakened. A new class of boundary crossing is named:

> **Pre-evidence audio.** Raw audio captured for transcription is a boundary
> crossing that the evidence pipeline cannot protect, because classification
> requires text that does not yet exist. It is permitted only under explicit,
> informed, revocable consent, only for utterances the user deliberately
> addressed to AVA, and never for AVA-held content.

Everything downstream of transcription is unchanged: the transcript enters the
canonical pipeline exactly as typed input does, and every existing
classification, minimisation, redaction, policy and budget rule applies.

---

## Why not Option A

Option A is the safest architecture and it does not deliver the product.

Without interim results there is no reactive listening state, and without a
reactive listening state the Core cannot respond acoustically — which is the
specific quality the owner asked for. A 2–6 second wait after every utterance
is not a rough edge on a conversation; it is a different interaction model.

Choosing it and calling the result Live would be hiding a UX degradation behind
architectural purity. The honest position is that Option A is available, that it
is strictly more private, and that it costs the experience the product is being
built around.

## Why not Option C

Option C is the best experience and the worst privacy posture, and the gap
between it and Option B is not proportionate.

An open microphone transmits speech nobody addressed to AVA, from people who
did not consent, in a room AVA cannot classify. Option B transmits one utterance
the user deliberately spoke. That is a categorical difference, not a matter of
degree — and it buys sub-second latency over a pipeline that deliberately takes
a second or more to think.

It also breaks the cost observability that D-14 is locked against, which would
compromise a validation threshold that was fixed before any data was seen.

Option C stays open. If turn-based Live proves conversationally stiff in real
use, it becomes a candidate — with its own ADR, its own consent model and its
own provider verification.

---

## Trade-offs, stated plainly

**What is given up.** Full-duplex acoustic barge-in. The user can interrupt AVA
instantly, but by acting — clicking the Core or pressing a key — not by simply
starting to talk over her. Turn boundaries exist. They are made thin, and they
are not eliminated.

**What is accepted.** In most browsers, the user's spoken utterances reach the
browser vendor. This is disclosed rather than minimised, and it is the single
place where AVA is less local than the rest of the system.

**What is kept.** Speech output is entirely offline. AVA's cognition, ledger,
memory and evidence never touch the speech path. One brain, one pipeline, one
set of epistemic rules.

---

## Consequences

- Live is buildable in Interaction Layer I3 with no external provider account,
  no new cost and no new server-side dependency.
- Browser support is a real constraint: `SpeechRecognition` is unavailable in
  some browsers, and Live degrades to the typed path there, stating why.
- Speech quality depends on the operating system's installed voices, which
  varies by machine and is outside AVA's control.
- The consent record is local state and is part of what the interaction freeze
  covers.

---

## Validation impact

- `spoken_delivery_started_at` and `spoken_delivery_completed_at` are genuinely
  observable and may be instrumented. **`user_heard_at` is not** — AVA can
  observe that she spoke, never that anyone listened. Renaming the former as the
  latter is forbidden.
- No locked threshold changes.
- Speech recognition cost is zero, so D-14 and D-15 are unaffected by Live.

---

## Follow-up

- Revisit if a streaming on-device model becomes practical (Option A's privacy,
  Option B's responsiveness).
- Revisit if turn-based Live proves conversationally inadequate after real use
  (Option C, with its own ADR).
