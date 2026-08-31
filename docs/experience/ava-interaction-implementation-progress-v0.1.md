# AVA Interaction Layer v0.1 — Implementation Progress

```text
Status: COMPLETE
Date: 2026-08-31
Slices: I0 … I5, all PASS
ADR-24: ACCEPTED
Cognitive V0: UNCHANGED — no core, retrieval, opportunity, cognition or feedback engine touched
Prospective Validation: NOT STARTED
```

---

## Slice status

| Slice | Objective | Status |
| --- | --- | --- |
| **I0** | Global shell, AVA as entry point | PASS |
| **I1** | AVA Core with semantic states | PASS |
| **I2** | Global Today by aggregation | PASS |
| **I3** | Live voice, turn-based | PASS |
| **I4** | Conversational capture + Why in flow | PASS |
| **I5** | Experience freeze + validation audit | PASS |

---

## What was built

### I0 — Global shell

`/` is AVA. The workstream list moved to `/workstreams` and became one
destination among six: **Home · Live · Today · Ask AVA · Workstreams · Memory**.

Dark spatial environment, layered translucency, no drop shadows. The home
surface leads with AVA Core, a greeting, and one line of landscape — *"3 things
need your attention. 3 changes since your last checkpoint. 2 open loops."* —
then three ways in. Information supports the conversation rather than competing
with it.

### I1 — AVA Core

`apps/web/app/_core/ava-core.tsx`. Canvas 2D, three overlapping translucent
lobes sharing a centre, each with its own radial gradient and phase, composited
with `lighter`. The silhouette is a polar radius perturbed by a small sum of
sines.

Canvas rather than WebGL, deliberately: the look here comes from layered
gradients and soft compositing, both of which Canvas does well, and a shader
pipeline would have added a fallback path for no visible gain at 300px.

**Eight states**, each differing in more than colour — amplitude, coherence,
rotation direction and silhouette completeness all change:

| State | Behaviour |
| --- | --- |
| idle | slow even breathing, whole form |
| listening | expands, deforms with live vocal energy |
| processing | contracts, rotation reverses inward, reactivity off |
| speaking | rhythm follows AVA's own word boundaries |
| attention | steady off-axis warm accent, never flashing |
| degraded | coherence drops, an arc opens |
| insufficient | arc opens further, luminance halves |
| error | fragmented and irregular — visibly not the same as uncertainty |

States are bound to real conditions: `attention` reads the eligible-opportunity
count, `degraded` reads real `ContextHealthState`. A text label is always
present, and `prefers-reduced-motion` renders a static differentiated form
rather than a frozen single shape.

### I2 — Global Today

`buildGlobalBriefing()` fans out `buildBriefing` per workstream and merges the
outputs. **Aggregation, not cross-workstream retrieval** — each workstream
computed behind its own `WHERE workstream_id = $1`, and no evidence crossed.

Every item carries its workstream and its own Context Health. There is no
global health value and no global score. Caps hold across the union: 3 per
block, 10 per briefing.

### I3 — Live

Per ADR-24: browser `SpeechRecognition` → canonical AVA cognition → local
`speechSynthesis`.

- **Consent gate**, server-rendered by default. The disclosure names exactly
  what is not local.
- **Acoustic reactivity** from a `getUserMedia` analyser running alongside the
  recogniser, since the recogniser reports no levels. RMS, smoothed, so the
  Core breathes rather than flickers.
- **Speaking reactivity** from `onboundary`, which fires per word — genuinely
  her cadence, coarser than an analyser and honest about it.
- **Return to listening is automatic** after every answer. The second question
  costs no click.
- **Interruption** by clicking the Core or pressing Escape. The partial answer
  stays in the transcript marked interrupted.
- **Feminine voice** selected from installed system voices, preferring
  Samantha / Ava / Allison / Serena on macOS.
- **Failure is reported as failure.** A transcription error says so; it is never
  guessed at.

### I4 — Conversational capture

`classifyUtterance` in `packages/core` distinguishes question · capture ·
declaration · correction · decision · commitment · why · **ambiguous**.

Every write is confirmed with a specific sentence — *"I'll register a decision:
use option B, effective today. Confirm?"* — never *"Got it."* A vague
acknowledgement cannot be checked against what was said; a specific one can, and
a mis-transcription is caught before it reaches the ledger.

Every write routes through the **same** domain services the forms use. There is
no second write path for speech.

`observedAt` is elicited, not defaulted: *"Yesterday we changed the launch
date"* produces **"When did that happen?"** rather than a row dated now. This is
the F-15 discipline carried into conversation.

Cross-workstream evidence questions are **refused with their reason** rather
than answered from one project and presented as global.

---

## Findings

- **F-19 — the consent gate was invisible without JavaScript.** Consent state
  initialised as `null` and resolved in an effect, so the server rendered
  "Loading…" and the ADR-24 disclosure existed only after hydration. A privacy
  safeguard that depends on client JavaScript is not a safeguard. Fixed by
  defaulting to *not consented*, which server-renders the disclosure and errs in
  the safe direction.

- **F-20 — imperative questions were classified as ambiguous.** "Compare the
  decisions across my projects" matched no interrogative and fell through to
  ambiguous, so AVA asked what was meant when it was perfectly clear. Added
  `compare`, `summarise`, `explain`, `describe`, `find` to the question pattern.

- **F-21 — existing e2e discovered workstreams at `/`.** The list moved to
  `/workstreams` in I0. Only the discovery route was changed; every assertion
  was left intact, and a new assertion was added that the root opens on AVA
  rather than on a list of projects.

---

## Deviations

- **D-26** — `packages/core/src/conversation/` added for utterance
  classification. Domain logic, deterministic and pure, placed in core with the
  other classifiers. It reads sentences; it decides nothing about belief.
- **D-27** — the old `/capture` form route is retained and unlinked from the
  primary navigation. Conversational capture supersedes it as the primary path;
  removing it would have deleted the only surface exercising several capture
  types in the Milestone 1 e2e.
- **D-28** — Live's scope selector is duplicated on the consent screen so the
  user can see what AVA can be asked about before enabling a microphone.

---

## Tests

| | |
| --- | --- |
| lint | `import boundaries: ok` |
| typecheck | exit 0 |
| unit + integration + golden + validation | **410 passed**, 39 files |
| e2e | **46 passed**, 6 files |
| build:web | exit 0 |

New: `packages/core/src/__tests__/utterance.test.ts` (15) ·
`tests/integration/conversation.test.ts` (14) ·
`tests/e2e/interaction-layer.test.ts` (18).

**Coverage limits, stated rather than implied.** The e2e harness is
fetch-based. It exercises the shell, the Core's rendered state, Global Today,
the consent gate, the scope selector and the conversational write path through
the server action. It does **not** exercise real microphone permission, real
speech recognition or real speech synthesis — those are browser capabilities a
fetch harness cannot reach, and no assertion here should be read as hardware
testing.

---

## Manual review

**Verified by running the built server:** the root opens on AVA with a real
greeting and a real landscape line · Core state is `attention` when three
opportunities are eligible · Global Today composes across two workstreams with
every item naming its origin · hedged language survives ("may need review",
"AVA is reporting the window, not predicting") · the consent gate is
server-rendered with the full disclosure · the five memory sections remain
distinct · the Why chain is intact.

**Not verified in this environment, and named as such:**

- **The rendered appearance of AVA Core.** The animation loop, state profiles,
  transitions and reduced-motion path are implemented and their wiring is
  tested, but no one has looked at the pixels here. Whether it reaches the
  visual quality the owner asked for is a judgement that requires a person and a
  screen.
- **Speech quality and voice fit.** Voice selection prefers feminine system
  voices; how any of them actually sound depends on what is installed on the
  machine.
- **Perceived conversational continuity and latency.** Measurable only in use.

These are the items the quality bar asks for and they remain open until the
owner reviews them.

---

## Architecture integrity

✅ `packages/core` opportunity, cognition, feedback and context engines
unchanged · ✅ `packages/retrieval` unchanged except nothing · ✅ no ML, no
learned ranking, no Work Graph, no graph reasoning, no connectors, no
personality scoring, no new opportunity categories · ✅ no cross-workstream
retrieval — ADR-23 remains deferred · ✅ every write goes through existing
domain paths · ✅ H-01 … H-06 remain `NOT TESTED` · ✅ ADR-21 Gate B remains
`OPEN`.
