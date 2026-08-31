# AVA Interaction Implementation Plan v0.1

```text
Status: READY FOR IMPLEMENTATION
Experience package: ava-interaction-experience-package-v0.1.md
Architecture baseline: Architecture Package v0.2 Final — UNCHANGED
Cognitive V0: FUNCTIONALLY COMPLETE — not modified by this plan
Slices: I0 … I5
Blocked slices: I3 (needs ADR-24)
Prospective Validation: NOT STARTED
```

> This plan builds an interaction layer over a finished cognitive system. It
> adds no cognition, no ranking, no learning and no connectors.

---

## Scope discipline

The cognitive V0 took eight slices. This is deliberately smaller: six slices,
mostly presentation and aggregation, with exactly one new domain capability
(conversational capture) and one new transport (voice).

**Not built here:** ML · learned ranking · Work Graph · cross-workstream
retrieval · autonomous external actions · a new cognition model · statistical
personality · connectors · a formal design system.

**Rule for every slice.** No change to `packages/core`, `packages/retrieval` or
the opportunity, cognition and feedback engines. If a slice appears to need one,
that is a signal it has crossed into architecture and must stop for an ADR.

---

## Dependency graph

```text
I0 — Global Shell
   ↓
I1 — AVA Core ────────┐
   ↓                  │
I2 — Global Today     │
   ↓                  ↓
I4 — Conversational Capture + Why
   ↓
I5 — Experience Freeze

I3 — Live Voice Foundation   [BLOCKED — ADR-24]
   depends on I1; feeds I4
```

I3 is sequenced last among the buildable slices because it is the only one
gated on a decision this plan cannot make.

---

## I0 — Global Shell + Navigation

**Objective.** AVA becomes the entry point. Workstreams stop being the required
first choice.

**Tasks**

| ID | Task |
| --- | --- |
| `I0-T01` | Dark spatial layout replacing the centred light column; three surface depths |
| `I0-T02` | Six-destination navigation — Live · Today · Ask AVA · Workstreams · Memory · Why |
| `I0-T03` | Persistent scope indicator: the current scope is always visible |
| `I0-T04` | Restyle Memory to the new language, five sections **provably** still distinct |
| `I0-T05` | Restyle Why to the new language, full chain preserved |
| `I0-T06` | Accessibility pass: contrast on dark, keyboard paths, `prefers-reduced-motion` |
| `I0-T07` | `/live` and `/today` as placeholder routes so navigation is complete |

**Dependencies.** None.

**Tests.** Existing e2e assertions for Memory and Why must pass **unmodified** —
they check the five section headings, the hypothesis labelling and the Why
chain, which is exactly the semantic content a restyle risks losing. New: every
destination reachable by keyboard; every state label present as text.

**Acceptance.** A person can open AVA and reach any surface without choosing a
project first · the five memory sections remain visually distinct · every
existing test passes untouched · no route lost.

**Architecture impact.** None — presentation only.

**Validation impact.** `NO IMPACT`.

---

## I1 — AVA Core + Visual States

**Objective.** A single representation of AVA that carries system state.

**Tasks**

| ID | Task |
| --- | --- |
| `I1-T01` | AVA Core component: concentric non-figurative geometry |
| `I1-T02` | Seven states — idle, listening, processing, speaking, attention required, degraded, insufficient |
| `I1-T03` | Bind health states to real `ContextHealthState`, never to a decorative prop |
| `I1-T04` | Bind attention-required to real eligible-opportunity count |
| `I1-T05` | Text label for every state; reduced-motion static equivalents |
| `I1-T06` | Persist AVA Core across navigation without remount |

**Dependencies.** I0.

**Tests.** Each state renders a distinct, named form · health states
distinguishable without colour · reduced motion produces static differentiation,
not a frozen single form · **the state shown equals the state the backend
reported** — the one test that stops AVA Core becoming decoration.

**Acceptance.** A person who has learned the vocabulary can tell `DEGRADED` from
`INSUFFICIENT` without reading text · no state exists that does not correspond to
a real system condition.

**Architecture impact.** None.

**Validation impact.** `NO IMPACT`.

---

## I2 — Global Today + Cross-Workstream Read Model

**Objective.** Attention across everything, by aggregation. **Not** by
cross-workstream retrieval.

**Tasks**

| ID | Task |
| --- | --- |
| `I2-T01` | `globalBriefing()` — fan out `buildBriefing` per workstream, merge results |
| `I2-T02` | Merge ordering: existing deterministic comparator over the union |
| `I2-T03` | Caps across the union: 3 per block, 10 per briefing |
| `I2-T04` | Every item carries its originating workstream, always rendered |
| `I2-T05` | Per-item Context Health; **no global health computed** |
| `I2-T06` | Exclude items from workstreams in `INSUFFICIENT`, as locally |
| `I2-T07` | Global change list, open loops, upcoming commitments — same aggregation |
| `I2-T08` | Checkpoint scope decision implemented per §16 of the package |
| `I2-T09` | Global `/today`; workstream Today preserved unchanged |

**Dependencies.** I0. Blocked on the checkpoint scope decision (`I2-T08`).

**Tests.** A global briefing contains no evidence from a workstream other than
each item's own · every item names its workstream · caps hold across the union ·
no global health value is produced anywhere · the workstream Today is byte-for-
byte unchanged in behaviour · an `INSUFFICIENT` workstream contributes nothing ·
ordering is deterministic across runs.

**Acceptance.** *"What needs my attention?"* answered across all workstreams,
with each item's origin visible and no global score anywhere.

**Architecture impact.** **None** — aggregation only. Each per-workstream
computation respects its own boundary; outputs are concatenated. Any attempt to
build one Context Packet spanning workstreams stops for **ADR-23**.

**Validation impact.** `PROTOCOL CLARIFICATION REQUIRED` (PM-03 unit) ·
`INSTRUMENTATION CHANGE REQUIRED` (checkpoint scope). Both recorded in I5.

---

## I3 — Live Voice Foundation

> **BLOCKED — `ADR-24` (audio boundary and speech provider) must be resolved
> before any audio leaves the machine.**

**Objective.** Turn-based Live Mode over the unchanged cognitive pipeline.

**Tasks**

| ID | Task |
| --- | --- |
| `I3-T00` | **ADR-24 resolved**; provider policy verified or local STT chosen |
| `I3-T01` | Voice transport interface, provider-agnostic, mirroring `ModelProvider` |
| `I3-T02` | STT adapter behind that interface; SDK confined to one file |
| `I3-T03` | TTS adapter, same confinement |
| `I3-T04` | Live session: listening → processing → speaking → listening |
| `I3-T05` | Barge-in; interrupted answers marked interrupted in the transcript |
| `I3-T06` | Live transcript written through the **existing** conversation path |
| `I3-T07` | Grounding indicator on AVA Core during answers |
| `I3-T08` | Spoken abstention and spoken gap statement under `DEGRADED` |
| `I3-T09` | ModelRun per voice turn: cost, latency, tokens, provider |
| `I3-T10` | Failure paths: transcription failure reported as such, never guessed |
| `I3-T11` | Boundary test: **audio and transcript pass classification before any external call** |

**Dependencies.** I1, and ADR-24.

**Tests.** A voice turn produces the same DecisionRecord as the typed
equivalent · the voice layer writes no Evidence, memory, cognition or hypothesis
by itself · abstention is spoken, not silently downgraded · every turn has a
ModelRun with attributable cost · CLASS 3 material never reaches the speech
provider · barge-in leaves an honest transcript.

**Acceptance.** A spoken question yields the same grounded answer as the typed
one, with the same evidence and the same DecisionRecord.

**Architecture impact.** **New provider boundary.** ADR-24 required. The
cognitive pipeline is unchanged — voice is transport.

**Validation impact.** `INSTRUMENTATION CHANGE REQUIRED — OPPORTUNITY`
(`user_heard_at`, §17 #6). Whether to instrument it is an owner decision.

---

## I4 — Conversational Capture + Why in flow

**Objective.** Capture, declare and correct by conversation, without weakening
provenance.

**Tasks**

| ID | Task |
| --- | --- |
| `I4-T01` | Utterance classifier: question · capture · declaration · correction · decision · commitment |
| `I4-T02` | Ambiguity → **ask**, never infer |
| `I4-T03` | Specific verbal confirmation before any material write |
| `I4-T04` | `observedAt` elicitation: *"when did that happen?"* whenever the past is implied |
| `I4-T05` | Route every write through existing domain services — no new write path |
| `I4-T06` | Honour `must_confirm_action` and `autonomy_limit` unchanged |
| `I4-T07` | Ask AVA global surface with explicit scope selection |
| `I4-T08` | Refuse cross-workstream evidence questions **explicitly**, naming the limit |
| `I4-T09` | Why in flow: inline strength, evidence one step away, full chain on demand |

**Dependencies.** I2. Uses I3 when present; works typed without it.

**Tests.** A spoken capture produces a ledger row identical to the typed one ·
an ambiguous utterance produces a question, not a write · no write bypasses the
quarantine pipeline · `observedAt` is elicited rather than defaulted when the
past is implied · a cross-workstream evidence question is refused with its
reason, never answered from one workstream · declared autonomy limits still
bind.

**Acceptance.** *"Record that I decided to go with option B"* produces a
confirmed decision with correct provenance, and an ambiguous sentence produces a
clarifying question.

**Architecture impact.** **New product behaviour over existing domain paths.**
No new cognition, no new write path. `I4-T08` is the guard that keeps this from
drifting into ADR-23 territory.

**Validation impact.** `PROTOCOL CLARIFICATION REQUIRED` — D-16 burden was
locked against form-based capture (§17 #7).

---

## I5 — Experience Freeze + Validation Compatibility Audit

**Objective.** Freeze the interface **before** Warm-up Day 1, and record every
consequence for the locked protocol.

**Tasks**

| ID | Task |
| --- | --- |
| `I5-T01` | Interface freeze: record the commit as the validation baseline |
| `I5-T02` | Verify every Slice 0–7 test still passes, unmodified |
| `I5-T03` | Verify the validation export is unchanged in schema and content |
| `I5-T04` | Confirm `shown_at`, `feedback_at`, `user_action_at`, `outcome_at` unchanged in semantics |
| `I5-T05` | Record the checkpoint scope decision and its effect on PM-03 and D-08 |
| `I5-T06` | Record the PM-03 unit decision: global, per workstream, or both |
| `I5-T07` | Record the D-16 modality note |
| `I5-T08` | **Escalate the withdrawal-week conflict** (§17 #9) for an owner decision |
| `I5-T09` | Record the `user_heard_at` opportunity and its owner decision |
| `I5-T10` | Confirm every intervention still records its originating workstream (D-21) |
| `I5-T11` | Produce the protocol amendment list — **no threshold altered** |

**Dependencies.** I0, I1, I2, I4. I3 if built.

**Tests.** The full Slice 0–7 suite passes unmodified · the export byte-compares
on schema · no locked threshold changed · no timestamp semantics changed.

**Acceptance.** Interface frozen with a recorded commit · every validation
consequence classified · every open owner decision listed with its options.

**Architecture impact.** None.

**Validation impact.** This slice **is** the validation impact work.

---

## Amendments the protocol will need

Listed so they are visible now. **None is applied here, and no locked threshold
is touched.**

| # | Amendment | Type |
| --- | --- | --- |
| 1 | PM-03 unit under a global briefing | clarification |
| 2 | Checkpoint scope and its effect on "since the last checkpoint" | instrumentation |
| 3 | D-16 modality note — capture measured against conversational capture | clarification |
| 4 | D-06 note — coverage may behave differently with spoken feedback | clarification |
| 5 | **D-19 withdrawal versus global Ask AVA** | **methodological — owner decision** |
| 6 | `user_heard_at` — instrument or not | instrumentation — owner decision |
| 7 | D-21 as an evaluation cohort, not a scope restriction | clarification |

Amendments 5 and 6 are owner decisions. Amendment 5 must be resolved before
warm-up, because it determines what the withdrawal weeks measure.

---

## Sequencing recommendation

Build **I0 → I1 → I2 → I4 → I5**, treating I3 as parallel and gated.

Rationale: I0, I1, I2 and I4 deliver the experience thesis — AVA as entry point,
global attention, conversational capture — with **no architectural change and no
new provider**. I3 is the only slice that cannot start without a decision, and
Live Mode is the one part of the thesis that can arrive later without
invalidating the rest.

If ADR-24 resolves toward local on-device STT, I3 loses its provider-boundary
blocker entirely and can be built at any point after I1.

---

## Next gate

`Implement AVA Interaction Layer v0.1`
