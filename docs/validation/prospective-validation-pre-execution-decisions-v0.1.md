# Prospective Validation Pre-Execution Decisions v0.1

```text
Status: PENDING
Protocol: prospective-validation-protocol-v0.1.md
Architecture baseline: Architecture Package v0.2 Final
AVA V0 status: FUNCTIONALLY COMPLETE
Validation status: NOT STARTED
Decisions locked: 0 of 24
Blocking decisions outstanding: 18
```

> Every decision here is made **before** the first day of validation. A
> threshold chosen after seeing results is not a threshold; it is a
> description of the result.

---

## How to read this

| Type | Meaning | Who decides |
| --- | --- | --- |
| **A — Methodological default** | a defensible value this protocol proposes | accept or override |
| **B — Owner product/economic** | depends on what the owner will tolerate | **owner only** |
| **C — Scope selection** | chosen before day one | owner, informed |
| **D — Provider gate** | depends on the Anthropic smoke | owner + technical |

**Blocking** means validation cannot start until it is `LOCKED`.
**Non-blocking** can be decided during the warm-up.

| | Count |
| --- | --- |
| Type A — methodological default proposed | 9 |
| Type B — owner decision required | 10 |
| Type C — scope selection | 3 |
| Type D — provider gate | 2 |
| **Total** | **24** |
| Blocking | 18 |
| Non-blocking | 6 |

No decision in this document is locked. Nothing may be inherited from the
retrospective [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md)
without a written semantic equivalence argument.

---

## Type A — Methodological defaults

### D-01 · Validation period length
**Question:** how long is the measured window?
**Recommended:** Option 2 — 1 week warm-up + 7 weeks measured.
**Alternatives:** Option 1 (1 + 3 weeks) · Option 3 (2 + 10 weeks, two workstreams).
**Consequence — shorter:** the volume conditions are unlikely to be met, so the
most probable verdict is `INCONCLUSIVE`. **Longer:** more burden, higher risk
of abandonment partway, which is worse than a smaller finished study.
**Note:** the real constraint is event density, not calendar time. Option 2 is
extended if §6 volume conditions are unmet.
**Final value:** `PENDING` · **Blocking:** YES

### D-02 · Warm-up
**Question:** are the first days warm-up only?
**Recommended:** yes — 7 days, excluded from primary metrics, retained in full,
included in the burden trend.
**Alternatives:** no warm-up · 14 days.
**Consequence — none:** primary metrics absorb an empty-corpus artefact and an
interface being learned, both of which flatter or damage the result for reasons
unrelated to the product. **Longer:** less measured data from an already small
study.
**Final value:** `PENDING` · **Blocking:** YES

### D-03 · False-negative audit sampling
**Question:** which checkpoints are audited for misses?
**Recommended:** every fifth closed checkpoint, plus every checkpoint where AVA
showed nothing.
**Alternatives:** every third (more coverage, more effort) · weekly by date.
**Consequence — sparser:** PM-05 loses interpretability. **Denser:** audit
burden competes with the real work being measured.
**Note:** the second clause is the important one. A silent checkpoint is where
a miss is most likely and least visible.
**Final value:** `PENDING` · **Blocking:** YES

### D-04 · Memory audit sampling
**Question:** how often, and how many objects?
**Recommended:** every second week, 5 objects, stratified across the five
memory kinds.
**Alternatives:** monthly, 10 objects · weekly, 3 objects.
**Consequence — sparser:** PM-06 becomes anecdote. **Denser:** the audit itself
becomes a burden the study is trying to measure.
**Final value:** `PENDING` · **Blocking:** NO — can be set during warm-up

### D-05 · Context Health sampling
**Question:** how many decisions per health state?
**Recommended:** 5 per state per month, or all where fewer occurred.
**Alternatives:** 10 per state per month · all decisions under INSUFFICIENT.
**Consequence — sparser:** PM-07 cannot distinguish a pattern from an incident.
**Final value:** `PENDING` · **Blocking:** NO

### D-06 · Feedback coverage floor
**Question:** minimum coverage for primary analysis?
**Recommended:** ≥50% of shown interventions carry at least one dimension.
**Alternatives:** ≥33% (more permissive) · ≥70% (stricter, risks turning
feedback into an obligation that changes behaviour).
**Consequence — lower:** correctness and value rest on a self-selected minority,
probably the memorable ones. **Higher:** the study pressures the user to answer,
which changes what is being measured.
**Final value:** `PENDING` · **Blocking:** YES

### D-07 · Aggregation rule across opportunity types
**Question:** when may the five classes be aggregated?
**Recommended:** only when no class exceeds 60% of shown interventions.
**Alternatives:** never aggregate · aggregate freely with per-class breakdown.
**Consequence — freer:** an easy class such as `closing_risk`, which fires on a
recorded date, silently carries the correctness figure for classes that require
real inference.
**Final value:** `PENDING` · **Blocking:** NO

### D-08 · Anticipation usefulness rule
**Question:** what window counts as useful anticipation?
**Recommended:** `delivery_latency ≥ 1 checkpoint interval` — **inherited**
from retrospective A-02.
**Semantic equivalence:** the retrospective value was reconstructed and this one
is measured, but the rule is derived from cadence rather than being an absolute
number, so it remains correct under any cadence. The rule transfers; no number
is being imported.
**Alternatives:** a fixed absolute (≥24h) · ≥2 intervals (requires slack for
preparation, not just display).
**Consequence — looser:** windows the product could never exploit count as
anticipation, producing a false positive on H-02.
**Final value:** `PENDING` · **Blocking:** YES

### D-09 · Statistical treatment
**Question:** descriptive or inferential?
**Recommended:** **descriptive only.** Counts and ratios, no p-values, no
confidence intervals, no significance claims.
**Alternatives:** inferential where `n` allows.
**Consequence — inferential:** borrowed authority. At N=1, with the builder as
subject and evaluator, a p-value would describe sampling noise in a design whose
dominant error is not sampling.
**Final value:** `PENDING` · **Blocking:** YES

---

## Type B — Owner decisions

> This document does **not** propose values for these. They depend on what the
> owner is willing to live with, and choosing them here would be a designer
> deciding the product's tolerances on her behalf.
>
> Retrospective anchors are shown for orientation only. Adopting one requires a
> written semantic equivalence argument.

### D-10 · Acceptable epistemic correctness (PM-01)
**Question:** what share of `incorrect` verdicts is tolerable before AVA is not
worth trusting?
**Retrospective anchor:** none — the retrospective study had no epistemic
dimension in this form.
**Consequence — strict:** a promising system is killed by a handful of errors
in a small sample. **Loose:** a confidently wrong assistant passes, and every
other finding rests on output that cannot be trusted.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-11 · Serious false negative tolerance (PM-05, PK-3)
**Question:** how many serious misses, over how many audits, before failure?
**Retrospective anchor:** K-10 — *≥1 in more than one briefing*.
**Semantic equivalence — NOT established.** The retrospective reviewer had wide
access and no scope limit; AVA has five classes and only declared relations.
The §15 definition adds a scope condition precisely so V0's architectural limits
are not counted as product failures. The old trigger applied to the new
definition would be stricter than it was originally.
**Consequence — strict:** the study fails on misses the V0 was never scoped to
catch. **Loose:** a system that reliably overlooks material work passes.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-12 · Attention waste tolerance (PM-03, PK-2)
**Question:** what share of shown items may be `already_known + irrelevant`?
**Retrospective anchor:** B-05 / K-6 — *≤33% of promoted items*.
**Semantic equivalence — PARTIAL.** The unit matches (items promoted per
briefing) and the failure mode is identical — the checkpoint becoming an inbox.
What differs is the producer: a human with wide access chose those items, AVA
chooses under Context Health and a top-k cap. Defensible to inherit, but it is
the owner's call.
**Consequence — strict:** forces abstention and short briefings; may reject a
system that would be useful with a smaller top-k. **Loose:** the checkpoint
becomes an inbox and passes the test while failing in use.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-13 · Valuable intervention rate (PM-02)
**Question:** what share of briefings must contain ≥1 `valuable` item, and what
share of interventions must be `valuable`?
**Retrospective anchor:** B-04 / K-1 — *≥1 useful item in ≥75% of briefings*.
**Semantic equivalence — NOT established.** That threshold was set against a
manually produced ideal briefing — the ceiling of achievable value. AVA is the
floor. Applying a ceiling's bar to a floor would reject the product for not
being a human with unlimited time, which is not what H-01 asks.
**Consequence — strict:** STOP on a system that adds real if intermittent
value. **Loose:** GO on something barely better than reading one's own notes.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-14 · Cost per useful intervention (PM-08, PK-7)
**Question:** maximum acceptable cost per useful intervention?
**Retrospective anchor:** D-01 / K-4 — *US$ 3 per useful intervention*.
**Semantic equivalence — NOT established.** Set for a study with connectors,
three source classes and human-produced briefings. Operating conditions differ
materially.
**Consequence — strict:** forces micro-batch and narrow scope from the start.
**Loose:** the cost gate stops being a gate, and baseline §33's *cost explosion*
passes through.
**Note:** feeds ADR-21 Gate B. Not measurable under Regime A.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** only under Regime B

### D-15 · Monthly cost ceiling (PK-7)
**Question:** maximum monthly spend for AVA at V0 scope?
**Retrospective anchor:** D-02 / K-4 — *US$ 60/month*.
**Semantic equivalence — NOT established**, same reasoning as D-14.
**Consequence:** a scope decision taken by budget, which is legitimate when
explicit and corrosive when implicit.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** only under Regime B

### D-16 · Capture burden ceiling (PK-8)
**Question:** how much capture and maintenance time per week is acceptable?
**Retrospective anchor:** B-06 / K-5 — *≤30 min per checkpoint, with a
downward trend required*.
**Semantic equivalence — PARTIAL and inverted.** Retrospectively those minutes
were *normalization overhead*, a cost to be minimised. In V0, capture is a
deliberate feature that guarantees a correct `observed_at`. The same minutes
mean something different, so the number does not transfer — but the **trend
requirement does**, and is the stronger half of the criterion.
**Consequence — strict:** H-03 fails early, avoiding a product whose real
output is data entry. **Loose:** the study approves a system whose maintenance
is the actual work.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-17 · Memory accuracy tolerance (PM-06, PK-5)
**Question:** how many audited memory objects may be wrong on content, scope,
authority or provenance?
**Retrospective anchor:** none.
**Consequence — loose:** AVA misremembers what the user declared about herself
and still passes, which is the failure most corrosive to trust.
**Note:** consider a stricter bar for **authority** errors than for content —
mislabelling a hypothesis as a declaration is a different kind of wrong from
holding a stale preference.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-18 · Context Health appropriateness (PM-07, PK-6)
**Question:** how many unjustified assertions, and how many false abstentions,
are tolerable?
**Retrospective anchor:** none.
**Consequence:** the two are **not** symmetric. An unjustified assertion under
INSUFFICIENT damages trust in everything AVA says; a false abstention costs one
intervention. Two separate tolerances are recommended.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-19 · Withdrawal design
**Question:** include withdrawal weeks (Baseline A)?
**Recommended by the protocol:** yes — one week in four, assigned in advance.
**Alternatives:** no withdrawal (simpler; loses the only evidence about whether
proactivity itself adds value) · one week in three.
**Consequence — without it:** a positive result cannot distinguish "AVA is
useful" from "having structured notes is useful", which is the product's
central claim. **With it:** four to eight weeks of real work without proactive
support.
**Note:** this is an owner decision because it costs real working weeks, not
because the methodology is unclear.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

---

## Type C — Scope selections

### D-20 · Number of workstreams
**Question:** one workstream or several?
**Recommended:** one primary workstream.
**Consequence — several:** burden multiplies, directly threatening H-03, and
the volume conditions become harder to reach in each. At N=1 the study cannot
generalise anyway, so the extra cost buys little.
**Final value:** `PENDING` · **Blocking:** YES

### D-21 · Which workstream
**Question:** which specific workstream?
**Recommended:** none — this requires the owner's knowledge of her own work.
**Locked selection criteria** (fixed before choosing, so the choice cannot be
made to flatter the result): active for the whole window · produces real
decisions and artifacts · has at least one dependency that can be declared
honestly · not so sensitive that capture would be self-censored.
**Consequence:** a quiet workstream yields too few changes and the study ends
`INCONCLUSIVE` for lack of events rather than lack of value.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** YES

### D-22 · Checkpoint cadence
**Question:** how often is a checkpoint closed?
**Recommended:** daily on working days, at a consistent time.
**Alternatives:** twice daily · per meeting · on resumption.
**Consequence:** cadence defines the D-08 anticipation rule and the PM-03
denominator, so it cannot be changed mid-study without a protocol deviation.
**Note:** baseline §34 nº 8 lists ideal cadence as an open question. This study
fixes one cadence in order to measure anything; finding the ideal is later work.
**Final value:** `PENDING` · **Blocking:** YES

---

## Type D — Provider gate

### D-23 · Provider regime
**Question:** start under Regime A (deterministic) or wait for Regime B?
**Recommended:** start under Regime A; move to Regime B mid-study if the smoke
passes, recording the boundary.
**Consequence — waiting for B:** the study is delayed for a component that is
not the architecture's distinctive claim; change → impact → opportunity needs
no model. **Starting with A:** H-05 stays `NOT TESTED` and Gate B stays `OPEN`
unless the regime changes.
**Note:** safe to switch mid-study only because `execution_mode` is recorded per
decision, so the periods can be separated rather than pooled.
**Final value:** `PENDING` · **Blocking:** YES

### D-24 · Anthropic smoke during v0.1
**Question:** attempt the controlled CLASS 0 smoke during this study?
**Recommended:** yes if a key is available; it is cheap, bounded by the Gate A
caps, and it is the only route to H-05.
**Consequence — not attempting:** ADR-21 Gate B stays `OPEN` indefinitely, and
no scope expansion is authorised regardless of how the study turns out.
**Final value:** `OWNER DECISION REQUIRED` · **Blocking:** NO for Regime A ·
YES for Regime B

---

## Blocking summary

| Blocking and outstanding | 18 |
| --- | --- |
| Non-blocking | 6 (D-04, D-05, D-07, D-14, D-15, D-24 — the last three conditional on regime) |

**Validation cannot start while any blocking decision is `PENDING`.**

Once locked, changing any of them is a protocol deviation under §39 of the
protocol: it requires a new protocol version, and the original analysis is
still reported.

---

## Next gate

`Lock Prospective Validation pre-execution decisions`
