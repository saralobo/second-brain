# AVA Interaction Experience Package v0.1

```text
Status: DRAFT — READY FOR IMPLEMENTATION PLANNING
Architecture baseline: Architecture Package v0.2 Final — UNCHANGED
AVA Cognitive V0: FUNCTIONALLY COMPLETE
AVA Interaction Layer: NOT IMPLEMENTED
Prospective Validation: NOT STARTED
ADRs required: 2 (see §16)
```

> I open AVA, talk to her, and she already understands the active landscape of
> my work.

**This document changes no code and no cognitive architecture.** Where a
proposed experience would require crossing a frozen boundary, it is marked
`ADR REQUIRED` and left unresolved.

---

## 1. Experience thesis

The product's claim is a *personal intelligence*, not a project management
application. Three consequences follow, and they are structural rather than
stylistic:

1. **AVA is the top-level object, not the workstream.** Choosing a project
   before the product becomes useful is the interaction model of a filing
   cabinet. A personal intelligence already knows the landscape.
2. **Conversation is the primary surface.** Forms are the fallback, not the
   default.
3. **Workstreams remain real, but become context boundaries rather than
   navigation.** They are how AVA keeps one project's evidence out of another's
   answers — a privacy and correctness property, not an information hierarchy.

The distinction matters because the second and third are in tension: a global
conversation wants to see everything, and the context boundary exists to stop
exactly that. §2 resolves this deliberately rather than by convenience.

---

## 2. Current frontend gap

Assessed against the code, not against impression.

| Property | Today | Required |
| --- | --- | --- |
| Entry point | `/` lists workstreams | AVA herself |
| Today | `/workstreams/[id]/today` — per project only | global, composed |
| Chat | `/workstreams/[id]/chat` — per project only | global, with scoped drill-down |
| Memory | `/memory` — already global | keep, restyle |
| Why | per record — already reachable | keep, integrate into flow |
| AVA's presence | none — no visual representation exists | AVA Core (§4) |
| System state | text tags only | encoded in motion and form |
| Voice | none | Live Mode (§7) |
| Palette | light, 940px column, no depth | dark, spatial, translucent |
| Motion | none | state-bearing |

**The honest summary:** the current frontend is a correct, legible admin
interface over a cognitive system. Everything it shows is true and traceable —
that was the point of Slices 3–7 — and none of it feels like talking to
anything. The gap is not polish. It is that the product's mental model is
currently *the database's* mental model.

**What must be preserved.** The current UI does several things that are easy to
lose in a redesign and expensive to rebuild: ordinal strength shown next to
every claim, `NOT PROVIDED` never rendered as a negative, gaps stated when
context is degraded, five memory sections kept visually distinct, and a route to
Why from every assertion. These are not decoration; they are the epistemic
contract made visible. §12, §13 and §15 carry them forward explicitly.

---

## 3. Global information architecture

```text
AVA
├── Live          voice conversation, first-class mode
├── Today         global attention surface, composed across workstreams
├── Ask AVA       conversation, global by default, scopeable
├── Workstreams   focused project context
├── Memory        what AVA knows — already global
└── Why           evidence and provenance — reachable from everywhere
```

Workstreams stop being the entry point and become one destination among six.

### Scope model

Three scopes, and every surface declares which it is operating in. This is the
load-bearing table of the whole package.

| Scope | Contains | Crosses workstreams? | Status in V0 |
| --- | --- | --- | --- |
| **Global** | Opportunities, changes, commitments, checkpoints | by **aggregation** of per-workstream results | read-model work |
| **Workstream** | Evidence, Current State, ChangeRecords, Context Packet, Context Health | **never** — enforced by `WHERE workstream_id = $1` | already enforced |
| **Personal cognition** | Declared Cognition, Behavioral Hypotheses | **already global** where `workstream_id IS NULL` | already supported |

**The critical asymmetry.** Personal cognition is already global by design:
`buildContextPacket` admits declarations where `workstreamId === null ||
workstreamId === req.workstreamId`. Work evidence is not, and never has been —
every retrieval query is scoped by workstream at the SQL level.

So *"what do you know about how I prefer to handle this kind of decision?"* is
answerable globally **today**, with no architectural change. *"What did we
decide about the API across all my projects?"* is not, and cannot be made so by
UI work.

---

## 4. Cross-workstream experience

Each question classified by what it actually requires.

| Question | Requires | Status |
| --- | --- | --- |
| What needs my attention across everything? | union of per-workstream opportunities, re-ranked by existing rules | **read-model work** |
| What changed across my projects? | union of `listByWorkstream` change records | **read-model work** |
| Which commitments are approaching? | union of `commitment` state objects with `dueAt` | **read-model work** |
| Where are my unresolved loops? | union of open questions and unresolved outcomes | **read-model work** |
| What do you know about how I prefer X? | global Declared Cognition | **already supported** |
| Is something in one project competing with something elsewhere? | reasoning **across** two workstreams' evidence | **`ADR REQUIRED`** |

### The boundary, stated precisely

Aggregating *results* across workstreams is not the same as retrieving *evidence*
across them.

- **Aggregation** takes N independent per-workstream computations, each of which
  already respected its own boundary, and concatenates the outputs. No evidence
  from project A ever enters a Context Packet built for project B. This is
  read-model work and needs no ADR.
- **Cross-workstream retrieval** would build one Context Packet containing
  evidence from several workstreams. That is a different system: it breaks the
  isolation that `WHERE workstream_id = $1` currently guarantees, changes what
  can cross the provider boundary in a single call, and makes Context Health —
  which the specification defines as **per task, with no global system health**
  — ambiguous.

**`ADR REQUIRED` — ADR-23: Cross-workstream retrieval and global Context Packet.**
Needed before any feature that reasons across projects rather than reporting
across them. Conflict detection ("something here competes with something there")
is squarely on the far side of this line and is **out of scope for Interaction
Layer v0.1**.

### Global Today composition rules

Because health is per-workstream and no global health exists:

- every item carries **its own** Context Health and its **originating
  workstream**, always visible;
- items from a workstream in `INSUFFICIENT` context are **not** promoted into
  the global surface, exactly as they are not promoted locally;
- there is **no global score**. Ordering reuses the existing deterministic
  comparator — time sensitivity, then consequence, then evidence strength, then
  oldest-first — applied to the merged set;
- the existing caps hold: 3 per block, 10 per briefing, now across the union.

---

## 5. AVA Core

A single central representation of AVA, present on every surface. It is the
product's one piece of persistent identity, and it earns its place by carrying
information.

### States

| State | What it means | Visual behaviour |
| --- | --- | --- |
| **idle** | nothing pending | slow, even breathing; low luminance |
| **listening** | audio is being captured | outward expansion, tracking amplitude — a genuine input indicator |
| **processing** | retrieval, health, policies running | inward rotation, no pulse; deliberately *not* a progress bar, because duration is unknown |
| **speaking** | AVA is producing output | rhythm follows the cadence of speech |
| **attention required** | eligible opportunities are waiting | a steady off-axis accent; never flashing |
| **degraded context** | `DEGRADED` — answers carry stated gaps | the form becomes visibly incomplete: an arc opens |
| **insufficient context** | `INSUFFICIENT` — AVA will abstain | the arc opens further and luminance drops. **AVA looks less certain because she is** |

### Principles

**Motion encodes state; it never decorates.** If a viewer cannot name what a
motion means, it should not exist. The three health states in particular must be
readable without text — a person who has learned this vocabulary should know AVA
is about to abstain before she says so.

**Restraint is the identity.** The visual budget is spent on one element that
means something, not on ambient particles.

**Explicitly avoided:** cartoon avatar · humanoid face · neon cyberpunk ·
the generic assistant orb · decorative dashboard chrome.

**Form direction:** a concentric, non-figurative structure — rings and arcs on a
shared centre, reading as instrumentation rather than as a creature. Geometry
carries the information: completeness of the arc is health, rate is activity,
luminance is confidence.

**Accessibility.** State must never be conveyed by motion alone. Every state has
a text label available, `prefers-reduced-motion` replaces animation with static
form differences, and the three health states are distinguishable without
colour.

---

## 6. Visual language

Direction, not a design system. No tokens are built here.

**Environment.** Dark, spatial, with depth from translucency and layered
surfaces rather than from drop shadows. Content sits *in* an environment instead
of *on* a page. The current 940px centred column becomes a spatial layout with a
persistent AVA presence and content surfaces arranged around it.

**Surface model.** Three depths — ambient (the environment), informational
(content panels, translucent, subtly bordered), and focal (the active
conversation or the item under inspection). Nothing floats without a reason.

**Typography.** One precise sans for interface and content; one monospace for
identifiers, timestamps and evidence references. Identifiers stay monospaced —
they are machine facts, and the current UI is right to distinguish them.

**Information density: high, noise: low.** These are compatible and are usually
confused. Density is how much information a surface carries; noise is how much
of it is not information. AVA should carry a lot and decorate none of it.

**Motion principles.** State transitions are animated because the transition is
the information. Entrances and exits are fast and quiet. Nothing loops purely for
atmosphere. Duration budget: state changes under 200ms, AVA Core transitions
under 400ms.

**State colour, conceptually.** A restrained palette where colour is reserved for
meaning: one accent for AVA's presence, and distinct treatments for the three
health states, for superseded content and for declared-versus-inferred
authority. The Slice 4 distinction between *declared by you* and *a guess* must
survive the restyle — it is currently carried by a dashed border and must remain
at least as legible.

**Accessibility constraints.** Contrast targets met against the dark ground, not
assumed · colour never the sole carrier · full keyboard operation · reduced
motion honoured · voice is an addition to the interface, never a replacement,
because a voice-only path would exclude anyone who cannot use it.

**Desktop-first for V0.** The validation runs on one machine with one user, and
spatial layouts with a persistent presence need room. **Path to mobile:** the
scope model in §3 is device-independent; a phone would collapse the spatial
layout to a single column with AVA Core as a persistent header, and Live becomes
the primary mode rather than one of six. Not built in v0.1.

---

## 7. Feminine identity

AVA is feminine in identity and voice.

### Interaction principles

She is **intelligent** — she answers what was asked, including when the honest
answer is that the evidence does not support one. **Calm** — no exclamation, no
performed enthusiasm. **Confident** — she states what she knows without hedging
for social comfort, and states uncertainty as fact rather than as apology.
**Concise by default, deep on request.** **Non-submissive** — she does not
apologise for existing, thank the user for asking, or ask permission to be
useful. **Able to challenge** — when the evidence contradicts what the user
said, she says so plainly and shows it. **Able to abstain** — "I don't have
enough to answer that" is a complete answer, delivered without embarrassment.

### Explicitly avoided

Eagerness · apology as a verbal tic · flirtation or deference · performed
emotion · a persona that is more present than the information · pet names ·
anything that makes her sound grateful to be consulted.

### The invariant that matters most

> **Gender presentation does not alter epistemic rules or authority.**

Personality is surface. Declared Cognition, Context Health, grounding validation
and abstention remain exactly as authoritative as they are today. A warmer voice
does not license a weaker claim, and the `unsupported_preference_claim`
validation failure applies identically whatever the phrasing.

Concretely: AVA's tone may change how *"I have a hypothesis that X may apply —
you have not told me this"* is delivered. It may never change it into
*"you prefer X"*.

---

## 8. Live Mode

A first-class mode, not a feature inside chat.

### Flow

```text
enter Live
→ listening        AVA Core expands, tracks amplitude
→ user speaks
→ processing       existing retrieval / health / policy pipeline
→ speaking         answer delivered, transcript written in parallel
→ listening        conversation continues
→ end session      transcript and DecisionRecords persist
```

### Behaviours

**Entry.** Explicit and deliberate — a control the user presses. AVA never
begins listening on her own. Always-on listening is not a v0.1 behaviour and
would need its own decision.

**Interruption / barge-in.** The user may interrupt speech at any time; AVA
stops immediately. What she had already said stays in the transcript, marked as
interrupted, because a partially delivered answer is not the same as a delivered
one and the record must not claim otherwise.

**Transcript.** Written continuously and visible during the session. Every AVA
turn carries the same evidence references its written form would, and the same
DecisionRecord.

**Evidence during voice.** A subtle indicator on AVA Core shows an answer is
grounded and how many sources it rests on. Detail is available on demand —
*"show me the evidence"* opens Why visually without leaving the session.

**Abstention.** Spoken as plainly as it is written: the gap is named. A
`DEGRADED` answer carries its stated gap in speech, not only on screen —
otherwise the epistemic contract holds only for people who are looking.

**Uncertainty and errors.** Transcription failure is reported as transcription
failure, never guessed at. If AVA is unsure what was asked, she asks — she does
not answer a question she inferred. Provider failure ends the turn with a
statement of what failed, and the written path stays available.

**End of session.** Transcript, DecisionRecords and any captures persist exactly
as their written equivalents do. Nothing about a session is ephemeral.

---

## 9. Voice architecture

### Option A — turn-based

`speech-to-text → AVA cognitive pipeline → text-to-speech`

| | |
| --- | --- |
| Experience | good; feels like conversation with a considered pause |
| Latency | STT + cognition + TTS, sequential; roughly 2–5s per turn |
| Complexity | **low** — two well-bounded calls around the existing pipeline |
| Provider | STT and TTS, either or both potentially external |
| Privacy | audio crosses only in discrete, inspectable turns |
| Cost | per-minute STT + per-character TTS, both measurable per turn |
| Observability | **excellent** — each turn is a ModelRun with its own cost and latency |
| Fallback | degrades cleanly to typing; the pipeline is unchanged |

### Option B — realtime conversational

Continuous bidirectional audio with native barge-in.

| | |
| --- | --- |
| Experience | markedly better; natural overlap and interruption |
| Latency | sub-second |
| Complexity | **high** — persistent session, audio streaming, state reconciliation |
| Provider | a realtime provider holding an open session |
| Privacy | **continuous audio crosses the boundary**, including speech never addressed to AVA |
| Cost | per-minute of open session, including silence |
| Observability | **poor by comparison** — a session is not a turn, so per-answer cost and latency are hard to attribute |
| Fallback | complex; a dropped session mid-utterance has no clean recovery |

### Recommendation for Live v0.1: **Option A**

Three reasons, in order of weight.

**1. The privacy difference is categorical, not incremental.** ADR-22 requires
that only the context necessary for a task crosses the boundary, after
classification and minimisation. Option A sends one utterance the user
deliberately spoke to AVA. Option B holds an open microphone: it would transmit
speech never addressed to AVA, in a room AVA cannot classify, and there is no
minimisation step that can be applied to audio that has not yet been understood.
That is not a stricter reading of ADR-22; it is the thing ADR-22 exists to
prevent.

**2. Observability is a validation requirement, not a nicety.** ADR-21 Gate B
needs cost and latency per call and per archetype. Option A produces one
ModelRun per turn with attributable cost. Option B produces a session, and
`cost/useful_intervention` — a locked threshold, D-14 — would become an
allocation exercise.

**3. The latency difference is smaller than it looks here.** AVA's cognition is
deliberate: retrieval, health assessment, policy evaluation and grounding
validation. A sub-second transport wrapped around a two-second pipeline is a
two-second experience. Option B's advantage is real for chat-like assistants and
largely spent on a system that thinks before answering.

**Revisit condition:** if turn-based Live proves usable but conversationally
stiff after real use, Option B becomes a candidate — with its own ADR, because
the privacy posture changes materially.

### Provider status

**No provider is selected here.** Selecting one requires current policy
verification — data retention, training use, regional processing — which is
exactly the check ADR-22's provider selection gate exists for and which cannot
be done from documentation.

> **`ADR / PROVIDER BOUNDARY UPDATE REQUIRED BEFORE IMPLEMENTATION`**
>
> **ADR-24 — Audio boundary and speech provider selection.**
>
> ADR-22 governs *evidence* crossing the boundary: retrieved, classified,
> minimised, redacted, with `evidence_ids` recorded. **Audio is pre-evidence.**
> A spoken utterance has not been classified, cannot be minimised before it is
> understood, and may contain third-party speech the user did not intend to
> transmit — which is CLASS 3 material under the existing rules, arriving
> through a channel those rules do not currently describe.
>
> This is a genuine gap in the frozen boundary, not an implementation detail.
> It must be resolved before any audio leaves the machine. Local on-device STT
> is a live option specifically because it avoids the gap entirely.

---

## 10. Voice does not own cognition

An invariant, stated so it cannot be eroded by convenience.

> **Voice is transport. It does not decide what AVA believes.**

```text
audio → transcription → request → AVA cognition → authorized Context Packet
      → grounded response → validation → speech
```

The voice layer may **never** independently:

- create Evidence;
- create or modify memory;
- create Declared Cognition;
- promote or confirm a Behavioral Hypothesis;
- perform an action.

Every one of those goes through the existing domain paths, with the same
validation, the same DecisionRecord and the same provenance. A capture spoken
aloud produces an identical ledger row to one typed into a form — same
`content_origin`, same `observed_at` discipline, same append-only guarantees.

The reason is concrete. Speech is easy to produce and easy to mis-transcribe.
If the voice layer could write to memory directly, the cheapest input path would
also be the least validated one, and the corpus would degrade fastest exactly
where it is most convenient to use.

---

## 11. Conversational capture

AVA must distinguish what a spoken sentence is *doing*.

| Kind | Example | Path |
| --- | --- | --- |
| **question** | "What changed this week?" | read; no write |
| **proposed capture** | "We moved the launch to Friday." | capture, confirmed |
| **explicit declaration** | "For architecture decisions I prefer detailed reasoning." | Declared Cognition, confirmed |
| **correction** | "No — it was Thursday." | correction chain, confirmed |
| **decision** | "Record that I decided to go with option B." | decision state object, confirmed |
| **commitment** | "I need to present this on Tuesday." | commitment with `dueAt`, confirmed |

### Rules

**Ambiguity is resolved by asking, never by guessing.** If AVA cannot tell a
question from a capture, she asks. A wrongly inferred capture writes a false
row into an append-only ledger — recoverable only by a correction that is itself
now part of the record.

**Material state changes are confirmed before writing.** The existing autonomy
rules apply unchanged: a declared `must_confirm_action` still requires
confirmation, and an `autonomy_limit` still binds.

**Provenance is never bypassed.** Conversational convenience does not shorten
the path. A spoken capture still passes the quarantine pipeline, still records
`observed_at`, and still distinguishes *happened now* from *happened earlier and
I'm telling you now* — which is the F-15 discipline the whole prospective
timeline depends on. In voice this is a natural question: **"when did that
happen?"**, asked whenever the utterance implies the past.

**Confirmation is verbal and specific.** Not *"got it"* but *"recording a
decision: option B, today"* — so a mis-transcription is caught before it is
written, not after.

---

## 12. Global Today

Six blocks, composed across workstreams.

**Needs your attention** · **What changed** · **Open loops** ·
**Upcoming commitments** · **AVA noticed** · **Prepared for you**

### Rules

- **Every item names its workstream.** A stripped item is a decontextualised
  claim, and the origin is often the most important thing about it.
- **No global score.** Ordering is the existing deterministic comparator applied
  to the merged set. Personalised ranking waits for validation to justify it.
- **Existing caps hold** — 3 per block, 10 per briefing, across the union.
- **Per-item health.** Each item carries the Context Health of its own
  workstream. There is no global health, per specification §3.15.
- **Empty is a real answer.** *"Nothing needs your attention right now"*
  survives the redesign verbatim.
- **Feedback stays where it is.** The two independent questions, both optional,
  both defaulting to blank.

**Relationship to workstream Today.** The workstream surface remains and remains
useful for focus. Global Today is a composition over it, not a replacement, and
they read from the same engine — the Slice 5 rule that there is exactly one
opportunity engine holds.

---

## 13. Workstream experience

```text
Global AVA    →  the broad cognitive landscape
Workstream    →  one project, in depth
```

**Scope defaults, stated explicitly because ambiguity here is a correctness
problem:**

- a question asked **inside a workstream** is scoped to that workstream —
  today's behaviour, unchanged;
- a question asked **globally** is answered from personal cognition (already
  global) and from **aggregated** per-workstream results;
- a global question requiring **cross-workstream evidence retrieval** is refused
  until ADR-23 exists. AVA says what she cannot do rather than silently
  answering from one workstream and appearing to have answered globally.

**Movement between them.** From a global item, its workstream is one step away.
From inside a workstream, global scope is one step out. The current scope is
always visible — the user must never be unsure which context an answer came
from, because the same question has different correct answers in each.

---

## 14. Memory experience

`What AVA knows` is already global and already correct. It is restyled, not
redesigned.

**The five sections stay visually distinct:**

**Declared by you** · **Evidence-backed knowledge** · **Behavioral hypotheses** ·
**Uncertain** · **Superseded**

**They are never collapsed into a profile.** A single merged "what AVA knows
about you" view is precisely the psychological-profile object the architecture
forbids, and merging them in the UI would produce it visually even though the
schema kept them apart.

Carried forward without weakening: a hypothesis is labelled *a guess — you never
told me this* · it shows the alternatives that were available · it is marked
*shadow mode — governs nothing* · a superseded declaration stays readable · the
declared/inferred distinction is at least as visually strong as the current
dashed border.

---

## 15. Why experience

Why remains first-class and reachable from every assertion.

**In the written interface.** Progressive disclosure: an inline strength
indicator on every claim, evidence references one step away, the full chain —
Change → Impact → Opportunity → Value Vector → gates → policies → generation
snapshot — on the dedicated surface.

**In Live Mode.** A subtle grounding indicator on AVA Core during the answer,
carrying source count and strength. *"Show me the evidence"* opens Why visually
without ending the session, and the transcript keeps references so an answer can
be inspected later.

**No chain-of-thought, in either mode.** A model's private reasoning is a
narrative about an answer, not a justification for it. Evidence, provenance and
the DecisionRecord are what AVA shows — and on the proactive path there is no
model reasoning to show, because none is used.

---

## 16. Architecture impact

| Capability | Classification |
| --- | --- |
| Global shell and navigation | UI only |
| AVA Core and visual states | UI only |
| Global Today, global change list, global open loops | **read-model work** — aggregation of existing per-workstream calls |
| Global personal-cognition questions | **already supported** — `workstream_id IS NULL` |
| Conversational capture | **new product behaviour** over existing domain paths |
| Live Mode, turn-based | **new product behaviour** + provider boundary |
| Global checkpoints | **new product behaviour** — see below |
| Cross-workstream retrieval / conflict detection | **`ADR REQUIRED`** |
| Audio crossing the provider boundary | **`ADR REQUIRED`** |

### ADRs required

**ADR-23 — Cross-workstream retrieval and global Context Packet.**
`buildContextPacket` is single-workstream by construction and every retrieval
query is scoped at the SQL level. Reasoning across projects breaks an isolation
property that is currently structural, and makes per-task Context Health
ambiguous. Required before conflict detection or any global evidence retrieval.
**Not required** for aggregation, which is what Interaction Layer v0.1 proposes.

**ADR-24 — Audio boundary and speech provider selection.**
ADR-22 governs classified, minimised evidence. Audio is pre-evidence and may
carry third-party speech. Required before any audio leaves the machine.

### Global checkpoints — a product decision, not an ADR

`checkpoint.workstream_id` is `NOT NULL`, so checkpoints are per-workstream
today. A global Today needs a defined meaning for *"since the last
checkpoint"* across projects. The specification defines the checkpoint as manual
and explicit but **does not fix its scope**, so this is an implementation and
product decision rather than a baseline change.

Two options, unresolved here: a global checkpoint that closes all workstreams at
once, or a global view composed over independent per-workstream checkpoints. The
choice changes the PM-03 denominator and is therefore a **validation decision**
as much as a product one — see §17.

---

## 17. Validation impact assessment

Prospective Validation has **not started**. This assessment exists so the
interaction layer can be frozen *before* Warm-up Day 1, rather than changing the
instrument mid-study.

| # | Change | Classification |
| --- | --- | --- |
| 1 | Global shell, AVA Core, visual language | **NO IMPACT** |
| 2 | Memory and Why restyled, semantics preserved | **NO IMPACT** |
| 3 | Global Today composition | **PROTOCOL CLARIFICATION REQUIRED** |
| 4 | Checkpoint scope | **INSTRUMENTATION CHANGE REQUIRED** |
| 5 | `shown_at` under global Today | **PROTOCOL CLARIFICATION REQUIRED** |
| 6 | Live Mode and `user_seen_at` | **INSTRUMENTATION CHANGE REQUIRED — OPPORTUNITY** |
| 7 | Conversational capture and D-16 burden | **PROTOCOL CLARIFICATION REQUIRED** |
| 8 | Feedback by voice | **PROTOCOL CLARIFICATION REQUIRED** |
| 9 | Withdrawal weeks and global Ask AVA | **METHODOLOGICAL CHANGE REQUIRED** |
| 10 | D-21 under a global product | **CLARIFICATION ONLY** — see §18 |

### The three that matter

**#9 — withdrawal weeks are undermined by global conversation.** *(Most
serious.)* D-19 withholds the briefing in weeks 3 and 6 while Capture and Chat
continue, so that the study can ask whether proactivity itself adds value. With
a global *"AVA, what needs my attention today?"*, the user can reconstruct the
briefing on demand in one sentence. The withdrawal would then measure *push
versus pull*, not *proactivity versus none* — which is a legitimate question and
**not the one D-19 was locked to answer**.

Options, all requiring an owner decision before warm-up: restrict global
attention queries during withdrawal weeks (preserves the original comparison,
degrades the product for two weeks) · redefine D-19 as push-versus-pull (honest,
and a different hypothesis) · drop withdrawal (loses the only evidence
distinguishing "AVA is useful" from "structured notes are useful").

This is a **methodological change** because it alters what the comparison
measures. It must be resolved before the study starts, and it cannot be resolved
by the interaction design.

**#6 — Live Mode makes `user_seen_at` partially observable, for the first
time.** Slice 7 locked it as `UNOBSERVABLE IN CURRENT V0` and recommended
Option A (timing from `shown_at`) because delivery is not reading. A spoken
answer that the user responds to is genuinely stronger evidence — not that they
*saw* it, but that they *received* it.

The honest framing: this would be `user_heard_at`, and only for items actually
spoken in a Live session. It is not `user_seen_at` for the written surface and
must not be recorded as such. Whether to instrument it is an owner decision;
doing so would let a *subset* of interventions carry a real exposure timestamp,
with the rest still absent — which is a stratified timeline, and analysable, but
only if labelled honestly.

**#7 — conversational capture changes the thing D-16 measures.** The 60
minutes/week ceiling was locked against form-based capture. Speaking a decision
is faster than filling a form, so the same ceiling against the new interface is a
looser test of H-03. This does not invalidate D-16, but the protocol must record
which capture modality the measurement was taken against — otherwise a burden
improvement caused by the interface would read as evidence that manual capture is
sustainable.

### The rest, briefly

**#3 and #5.** PM-03 (attention waste) is *per briefing*. If a briefing becomes
global, the unit changes. Requirement: every intervention keeps its originating
workstream, so D-21's primary-workstream denominators remain computable, and the
protocol states whether PM-03 is measured per global briefing, per workstream, or
both. `shown_at` semantics are unchanged — the server marked it delivered — but
"delivered into which briefing" needs recording.

**#4.** Whichever checkpoint scope is chosen defines "since the last
checkpoint" and therefore the PM-03 denominator and the D-08 anticipation
interval. It is instrumentation because the `checkpoint` table would change.

**#8.** Feedback given by voice is the same feedback through the same path. The
protocol should note the modality, since D-06's coverage floor may behave
differently when answering is a spoken sentence rather than two dropdowns.

**No locked threshold is altered by this document.**

---

## 18. D-21 clarification

> **The Primary Validation Workstream is an evaluation cohort, not a product
> scope restriction.**

AVA remains multi-workstream throughout validation. Other workstreams may exist
and be used normally, and global surfaces operate across all of them.

D-21 identifies the workstream whose interventions form the **locked
longitudinal denominators** for the primary metrics. Interventions from other
workstreams are recorded normally, exported normally, and reported as a separate
stratum — they simply do not enter the primary-metric denominators, because
those were locked against a single cohort.

This requires that every intervention record its originating workstream, which
it already does.

**D-21 is not locked here, and no project is selected.**

---

## 19. Status at completion of this package

```text
AVA COGNITIVE V0 — FUNCTIONALLY COMPLETE
AVA INTERACTION LAYER — READY FOR IMPLEMENTATION
PROSPECTIVE VALIDATION — NOT STARTED
D-21 — PENDING
ADRs required before parts of implementation — ADR-23, ADR-24
```

---

## 20. Next gate

`Implement AVA Interaction Layer v0.1`
