# AVA Prospective Validation Protocol v0.1

```text
Status: DRAFT — PRE-EXECUTION DECISIONS REQUIRED
Architecture baseline: Architecture Package v0.2 Final
AVA V0 status: FUNCTIONALLY COMPLETE
Validation strategy: PROSPECTIVE INSTRUMENTED VALIDATION
Validation schema: v0.1
```

> Define the pre-registered prospective evaluation of AVA using longitudinal
> real-world use, before interpreting any experimental results.

**Nothing in this document is a result.** No data has been analysed, no
hypothesis has been tested, and no GO / PIVOT / STOP has been declared.
H-01 … H-06 remain `NOT TESTED`. ADR-21 Gate B remains `OPEN`.

---

## 1. Central question

> Does AVA create enough correct, novel, timely and actionable cognitive value
> to justify continued development and progressive expansion of scope?

This question is **not** answered by one number. There is no AVA Score, no
weighted composite and no ranking. The question decomposes into twelve
dimensions (§5) which are reported separately and combined only by the explicit
rules in §31.

The reason is not fastidiousness. A system can be right and useless
(`correct + already_known`), wrong and welcome (`incorrect + valuable`), or
valuable and unaffordable. Averaging those produces a number that moves for
reasons nobody can name, and every one of the failure modes the baseline §33
lists would be invisible inside it.

---

## 2. What this protocol governs

| In scope | Out of scope |
| --- | --- |
| how AVA is evaluated prospectively | whether AVA is good — that is the study's output |
| which observations are admissible | changing AVA's policies to improve them |
| thresholds locked before the first day | thresholds adjusted after seeing results |
| how the verdict is composed | declaring the verdict |

### Threshold inheritance rule

Per the [Prospective Validation Strategy](prospective-validation-strategy-v0.1.md),
a threshold locked for the retrospective study does **not** migrate
automatically. Every reused number below carries an explicit semantic
equivalence argument, and every number that is *not* reused says why.

Three structural differences make blind inheritance invalid:

1. the retrospective "briefing" was produced by a human with wide access and
   unlimited time — the **ceiling** of value. AVA's briefing is produced by a
   system under real Context Health and a real budget. The same bar measures
   different things;
2. retrospective normalization effort measured whether sources could be
   maintained; prospective manual capture is a deliberate feature, so the same
   minutes mean something different;
3. the anticipation window was **reconstructed** retrospectively. Here it is
   **measured**, which makes it both more trustworthy and differently
   distributed.

---

## 3. Hypotheses

Original wording preserved verbatim from baseline §3. Where the prospective
instrument can only test part of a hypothesis, that is stated rather than
worked around.

### H-01 — a manually produced ideal briefing, with wide access, is valuable often enough

| | |
| --- | --- |
| **Prospective restatement** | AVA's briefing — not a human ceiling — is valuable often enough |
| **Supports** | a high share of checkpoints containing ≥1 intervention marked `valuable` |
| **Weakens** | most checkpoints producing nothing, or nothing that earns `valuable` |
| **Falsifies** | sustained delivery of items the user consistently marks `already_known` or `irrelevant` while nothing is marked `valuable` |
| **Observations** | briefing count, shown interventions, `delivery` verdicts, feedback coverage |
| **Minimum sample** | see PM-02, §30 |
| **Confounders** | small corpus early on; the user's own capture determines what can be found; N=1; the evaluator is the user |
| **V0 can test** | **PARTIALLY.** H-01 as originally written concerns the *ceiling* — what a human with wide access could produce. AVA is a floor, not a ceiling. A negative result therefore does not falsify the original H-01; it falsifies "AVA reaches enough of that ceiling". Testing the ceiling itself needs the manual ideal-briefing study the retrospective sprint could not run |

### H-02 — relevant signals become available before the user notices them

| | |
| --- | --- |
| **Supports** | `opportunity_shown_at` preceding the user's own recorded discovery, with a window wide enough to act in |
| **Weakens** | AVA consistently surfacing what the user had already handled |
| **Falsifies** | `already_known` dominating, and `delivery_latency` exceeding the checkpoint interval |
| **Observations** | `change_detectable_at`, `change_detected_at`, `opportunity_shown_at`, `delivery` verdicts |
| **Minimum sample** | see PM-04, §30 |
| **Confounders** | **the user is also the data source.** Anything AVA knows, the user typed. `observedAt` discipline (§10) is what keeps this from being circular |
| **V0 can test** | **PARTIALLY.** `user_seen_at` does not exist (§17), so "before the user notices" is measurable only as "before the user reported knowing", via `already_known`. Timing is measured to delivery, never to noticing |

### H-03 — limited sources reconstruct state and delta without excessive manual maintenance

| | |
| --- | --- |
| **Supports** | capture and correction burden low and falling, while opportunities keep being generated |
| **Weakens** | flat or rising burden |
| **Falsifies** | maintenance time exceeding the time AVA plausibly saves |
| **Observations** | capture counts and durations, corrections, relations declared, memory maintenance, feedback burden (§37) |
| **Minimum sample** | burden must be observed over ≥3 weeks for a trend to mean anything |
| **Confounders** | learning effects; a warm-up period will overstate burden |
| **V0 can test** | **PARTIALLY, and the meaning shifts.** V0 is manual-first, so "limited sources" is "one source: the user". This tests whether manual capture is sustainable — a stricter and more honest test than the original, which assumed connectors. Connector-based maintenance remains untested |

### H-04 — personalization improves the result above a neutral baseline

| | |
| --- | --- |
| **Supports** | interventions where a declaration applied being judged more useful than comparable ones where none did |
| **Weakens** | no discernible difference |
| **Falsifies** | declarations making outcomes worse, or scope mismatches producing wrong behaviour |
| **Observations** | `declaredCognitionIds` on each intervention, `delivery` and `epistemic` verdicts, scope match |
| **Minimum sample** | not reachable in v0.1 — see below |
| **Confounders** | declarations are not randomly assigned; the user writes them and evaluates the result |
| **V0 can test** | **NOT YET.** There is no statistical personalization, no blind comparison and no assignment mechanism. v0.1 asks only whether *signal* exists for a later study (§25). Reporting a personalization lift from v0.1 data would be manufacturing a finding |

### H-05 — the cost per useful intervention is acceptable

| | |
| --- | --- |
| **Supports** | measured `cost/useful_intervention` inside a threshold the owner locked in advance |
| **Weakens** | cost near the limit with a small useful denominator |
| **Falsifies** | cost exceeding the limit across all operating modes |
| **Observations** | `model_run` tokens, latency, cost, `price_table_version`; `delivery = valuable` count |
| **Minimum sample** | ≥1 real provider call — currently **zero** |
| **Confounders** | the deterministic loop costs nothing, so an aggregate cost/intervention would be misleadingly low |
| **V0 can test** | **NOT YET under Regime A; PARTIALLY under Regime B (§23).** No real call has ever been made. This is the ADR-21 Gate B input and cannot be produced by the deterministic path |

### H-06 — proactivity does not produce more noise, perceived surveillance or correction than value

| | |
| --- | --- |
| **Supports** | attention waste low, corrections rare, no reported discomfort |
| **Weakens** | rising `irrelevant` / `already_known`, or frequent correction |
| **Falsifies** | the user avoiding or muting the briefing, or reporting surveillance discomfort |
| **Observations** | `delivery` distribution per briefing, correction counts, hypothesis rejections, qualitative surveillance notes |
| **Minimum sample** | see PM-03, §30 |
| **Confounders** | the user chose to build this; self-report on discomfort is generous to one's own project |
| **V0 can test** | **YES for noise and correction. PARTIALLY for surveillance**, which stays qualitative — the historical protocol reached the same conclusion for K-9, and a number here would be false precision |

**Summary:** H-06 fully testable · H-01, H-02, H-03 partially · H-04 and H-05
not yet (H-05 only under Regime B).

---

## 4. Units of analysis

Denominators are never mixed across units. Most misleading validation numbers
come from dividing by the wrong population.

| Unit | Definition | Population |
| --- | --- | --- |
| **Intervention** | an Opportunity with `shown_at` set — delivered into a rendered checkpoint | denominator for correctness, value, timing |
| **Opportunity candidate** | any generated opportunity, including `suppressed` and top-k excluded | denominator for suppression and gate behaviour |
| **Change** | a detected ChangeRecord | denominator for detection latency and unraised changes |
| **Briefing / checkpoint** | one delivery of a set of opportunities | denominator for attention saturation |
| **Memory / cognition event** | a declaration, correction, promotion, hypothesis or rejection | denominator for memory accuracy |
| **ModelRun** | one external provider call | denominator for cost and latency |

An intervention that was never shown is not a failed intervention. It is a
candidate, and it belongs to a different population.

---

## 5. Primary validation dimensions

Twelve dimensions, reported separately.

**Correctness** — `epistemic` ∈ {correct, partially_correct, incorrect,
not_verifiable}. Denominator: interventions carrying a verdict.

**Incremental value** — `delivery` ∈ {valuable, already_known, irrelevant,
too_early, too_late}. Independent of correctness.

**Novelty** — two distinct quantities, never merged:
`novelty_at_generation` (AVA's own estimate, recorded before exposure) and
`already_known` (the user's later report). Absence of feedback is **not**
novelty.

**Timing** — from `change_detectable_at`, `change_detected_at`,
`opportunity_generated_at`, `opportunity_shown_at`. `user_seen_at` does not
exist, so the phrase *time until the user noticed* is prohibited. The permitted
phrase is *time until AVA delivered*.

**Actionability** — whether a concrete next step existed, from
`valueVector.actionability` and `minimalAction`. Distinct from whether the user
acted.

**User action** — recorded `user_action` rows only. A positive verdict is never
read as an action; believing something was valuable and doing something about
it are different observations.

**Outcome** — {resolved, unresolved, expired, ambiguous}. Causality is **not**
attributed to AVA. A recorded action after a shown opportunity is a sequence.

**Attention cost** — how much noise was produced per unit of value, per
briefing.

**Memory correctness** — whether declarations, corrections, scope and history
were preserved, audited per §19.

**Context Health behaviour** — whether assertiveness matched what AVA could
actually see, audited per §21.

**Cost** — per call, per intervention, per useful intervention, per period.
Only where a real ModelRun exists.

**Latency** — deterministic and provider-dependent flows reported separately.
Mixing them would let the free path hide the expensive one.

---

## 6. Validation period design

Three defensible options. **`OWNER DECISION REQUIRED`** — no calendar is
started here.

### Option 1 — Four weeks, single workstream (minimum defensible)

Warm-up 1 week + 3 weeks measured. Roughly 15–20 checkpoints at daily cadence.
**For:** shortest path to signal; bounded commitment. **Against:** likely
insufficient `n` for anything but description; one context, so no variation.

### Option 2 — Eight weeks, single workstream *(recommended)*

Warm-up 1 week + 7 weeks measured. Roughly 35–50 checkpoints. **For:** covers
more than one work phase, so opportunity types vary; enough series length for a
burden trend (H-03) to mean something; long enough for corrections to appear.
**Against:** two months before any verdict.

### Option 3 — Twelve weeks, one primary plus one secondary workstream

Warm-up 2 weeks + 10 weeks. **For:** allows H-04 signal and some
generalisation. **Against:** doubles capture burden, which itself threatens
H-03; more confounders; likely to be abandoned partway, which is worse than a
smaller finished study.

**Methodological recommendation: Option 2.** The binding constraint is not
calendar time but *event density* — a workstream in a quiet phase produces few
changes regardless of duration. Option 2 is the shortest window that plausibly
contains the volume conditions in §30 while keeping burden survivable.

**Minimum volume conditions** (any option is extended until these are met, or
the study is reported as descriptive):

- ≥20 closed checkpoints;
- ≥30 shown interventions;
- ≥3 of the 5 opportunity types represented;
- ≥15 interventions carrying at least one feedback dimension.

---

## 7. Warm-up

**Recommended: yes — the first 7 days are `WARM-UP / DATA COLLECTION ONLY`.**

Reasons, all structural rather than cosmetic:

- the corpus starts empty, so early opportunity rates are artefacts of an empty
  ledger, not of the engine;
- Declared Cognition is being initialised, so early interventions run with no
  personal cognition at all — which is a different system;
- relations have not been declared yet, and the engine follows only declared
  relations, so early recall is bounded by setup;
- the user is learning the interface, so early capture burden overstates H-03.

**Data handling:** warm-up data is **never deleted**. It is stored identically,
exported identically, and reported separately as its own stratum. It is
excluded from primary metrics and **included** in:

- burden trend (H-03) — the early cost of adoption is a real finding;
- bug discovery and protocol deviation records;
- the memory audit baseline.

The warm-up boundary is recorded as a timestamp before it begins, not chosen
afterwards by looking at where the numbers improve.

---

## 8. Real-use protocol

The study is worthless if AVA is fed to produce opportunities. The following
are conditions of validity, not etiquette.

**Do:**

- use AVA on real work, in the workstream chosen in advance;
- capture decisions, commitments, questions and risks when they actually
  happen;
- declare a dependency when one genuinely exists;
- answer feedback when you have a view — including inconvenient views;
- record outcomes when you know them;
- correct AVA when she is wrong;
- ask AVA questions you would have asked anyway.

**Do not:**

- create fictional changes, decisions or corrections;
- capture things solely because it would generate an opportunity;
- withhold a question because the answer might look bad;
- avoid marking something `irrelevant` to protect a metric;
- retro-fit an outcome to make a loop look closed.

> AVA is being used as a product, not sitting an exam. An intervention marked
> `incorrect` is a successful measurement.

**Conflict of interest, declared:** the user is the builder, the sole subject
and the evaluator. This cannot be removed at N=1. It is mitigated by
pre-registration, by feedback that cannot be revised without leaving a trace,
and by the sampling rules in §15 and §19 being fixed in advance. It is not
eliminated, and every result carries this caveat.

---

## 9. Data entry discipline

The temporal record is only interpretable if capture distinguishes two things:

| Situation | Action |
| --- | --- |
| it is happening now | capture normally; `observedAt` defaults to now |
| it happened earlier, I am recording it now | set `observedAt` to when it happened |

This is the single most important discipline in the study. `change_detectable_at`
is the denominator of anticipation, and dating everything "now" produces a
zero-latency record that looks excellent and means nothing — the exact defect
found and fixed as F-15 in Slice 7.

**Precision required: the day, not the minute.** "Tuesday afternoon" is enough;
inventing a time to the minute would be false precision, and the analysis
segments by `time_basis` anyway.

Reported timestamps are stored with `time_basis = reported` and are never mixed
with `system_clock` values in a single statistic without segmentation (§17).

---

## 10. Workstream scope

### Option A — one primary workstream *(recommended for v0.1)*

**For:** density — a single context produces enough changes for the engine to
have something to work with; burden stays survivable; confounders are fewer.
**Against:** no generalisation; a finding may be a property of that project.

### Option B — multiple workstreams

**For:** generalisation; allows contrast. **Against:** capture burden
multiplies, which directly threatens H-03; attention splits across briefings;
the volume conditions in §6 become harder to reach in each.

**Recommendation: Option A.** With N=1 the study cannot generalise regardless,
so paying the burden cost of Option B buys little. The specific workstream is
**`OWNER DECISION REQUIRED`**, chosen and recorded before the first day.

Selection criteria, locked before choosing: active for the whole window ·
produces real decisions and artifacts · has at least one dependency the user
can declare honestly · not so sensitive that capture would be self-censored.

---

## 11. Opportunity types

The five classes are reported **separately** and aggregated only when the
aggregate is legitimate.

`unpropagated_decision` · `upcoming_commitment` · `invalidated_work` ·
`unresolved_question` · `closing_risk`

An aggregate is legitimate only when no single class exceeds **60%** of shown
interventions. Above that, the aggregate describes that class and is reported
per class instead.

The reason is concrete: `closing_risk` fires on a recorded date and is nearly
always "correct", while `unpropagated_decision` requires real inference. An
aggregate correctness figure dominated by date arithmetic would look strong
while saying nothing about the capability the product is actually claiming.

---

## 12. Feedback completeness

Feedback will not reach 100%, and requiring it would change the behaviour being
measured.

- **Minimum coverage for primary analysis: ≥50% of shown interventions carry at
  least one dimension.** Below that, correctness and value are reported as
  descriptive only, with `n` stated, and PM-01/PM-02 are marked
  `INSUFFICIENT COVERAGE`.
- **Missing feedback is `NOT PROVIDED`.** It is never imputed, never counted as
  negative, and never dropped silently — the denominator always states how many
  were unanswered.
- **Per-dimension coverage is tracked separately.** A user who answers "was it
  useful?" and skips "was it correct?" produces two different coverages.

Reported for every metric: `numerator / denominator (unanswered: n)`.

---

## 13. False positive framework

"False positive" is three different failures. They are not merged.

### Epistemic false positive
`epistemic ∈ {incorrect, partially_correct}` — AVA said something untrue.
**The most serious**: it corrupts trust in everything else.

### Attention false positive
`delivery = irrelevant`, or `too_early` / `too_late` — AVA was right and should
not have interrupted, or interrupted at the wrong moment. Feeds H-06.

### Novelty failure
`delivery = already_known` with `epistemic = correct` — AVA was right, on
something worth knowing, that the user already knew. **Not an error**; a
failure to add value. Feeds H-01 and H-02.

`not_verifiable` is a **fourth, separate** category: the user could not check.
It is neither a false positive nor a success, and inflating either bucket with
it would be dishonest in a self-serving direction.

---

## 14. False negative framework

The readiness audit records a structural limit: **a dependency the user never
declared is invisible to AVA and equally invisible to the audit.** No query can
find these; only human review can.

### Sampling, fixed in advance

- **Rule:** every **fifth** closed checkpoint is audited, plus every checkpoint
  in which AVA showed **nothing**.
- The second clause exists because a silent checkpoint is where a miss is most
  likely and least visible.
- Sampling is by position in the sequence, never by outcome. Auditing only
  periods that felt disappointing would measure disappointment.
- The schedule is fixed before the first day and is not adjusted mid-study.

### Procedure

1. take the checkpoint window;
2. review the real work of that period independently of AVA;
3. list anything that met the §16 bar and was not shown;
4. record it in the audit log with the date of the audit;
5. classify: not detected · detected but suppressed · detected but ranked out ·
   outside V0 scope · undeclared relation.

Findings are recorded **forward**. Nothing about the original generation is
edited — that is AR-01 and it is enforced by an append-only table, not by
discipline.

---

## 15. Serious false negative — operational definition

Deliberately stronger than "AVA could have said something". **All four**
conditions must hold:

1. **Evidence sufficiency** — the information was in AVA's ledger before the
   checkpoint, or should have been under the capture discipline in §9;
2. **Materiality** — surfacing it would have changed a decision, prevented
   rework, or avoided a missed commitment;
3. **Scope** — it falls inside one of the five V0 opportunity classes, and the
   relation needed was declared or should have been under §8;
4. **Consequence** — the absence had, or plausibly could have had, a real cost.

A miss failing any condition is a **trivial false negative**: recorded
separately, counted separately, never aggregated into the serious count.

**Semantic equivalence to the retrospective K-10.** The historical definition
required the item to exist in sources, deserve promotion, and have had real
consequence. Conditions 1, 2 and 4 are the same test. Condition 3 is **new**,
and is needed because the retrospective study had a human reviewer with wide
access and no scope limit, whereas AVA has five classes and only declared
relations. Without condition 3, every architectural limitation of V0 would be
counted as a product failure.

The historical trigger — *≥1 serious false negative in more than one briefing*
— is **not inherited automatically.** `OWNER DECISION REQUIRED` (see D-11).

---

## 16. Anticipation

Only observable timestamps. Both measures are segmented by `time_basis` and
never pooled across it.

```text
detection_latency = change_detected_at − change_detectable_at
delivery_latency  = opportunity_shown_at − change_detectable_at
```

Reporting rules:

- report median and range, never a mean over a small `n`;
- report `time_basis = reported` and `system_clock` **separately**. A reported
  detectable time is the user's assertion; a system one is an observation, and
  averaging them produces a number with no referent;
- when `change_detectable_at` is `reported`, the latency inherits that
  status and is labelled `reported-basis` wherever it appears.

**Prohibited language:** `time saved`, `time until the user noticed`, `AVA
caught it first`. None is supported by the available observations.

**Permitted:** `time until AVA delivered`, `detection latency`,
`delivery latency`.

**Usefulness threshold.** A window is only useful if a checkpoint fits inside
it — an anticipation of two hours is worthless at a daily cadence. Inherited
from the retrospective A-02 as `delivery_latency ≥ 1 checkpoint interval`.
**Semantic equivalence:** the retrospective value was reconstructed, this one is
measured, but the *rule* is derived from cadence rather than being an absolute
number, so it stays correct under any cadence. Inheritance accepted.

---

## 17. Briefing quality

Unit: **the briefing**, not the item. The denominator matters enormously here.

Per briefing: items shown · `valuable` · `already_known` · `irrelevant` ·
`too_early`/`too_late` · `incorrect` · items held back by top-k · unanswered.

**A briefing is not "useful" because it contained one useful item.** Reported
together, always:

- share of briefings with ≥1 `valuable` item — *hit rate*;
- share of shown items that were `already_known + irrelevant` — *waste rate*.

One briefing with one good item and nine bad ones is a failure of the
attention budget, and reporting only the hit rate would hide that. This pairing
is what makes PM-02 and PM-03 non-negotiable as a pair.

**Attention saturation** is tracked as items shown per briefing against the
cap of 10, so a rising waste rate can be distinguished from a rising volume.

---

## 18. Memory validation

A recurring audit, sampled by a rule fixed in advance: **every second week**,
sample **5** memory objects — stratified across active Declared Cognition,
superseded cognition, contextual preference, stabilized knowledge, and
Behavioral Hypothesis, one each where available.

For each, answer:

- is the content correct?
- is the **scope** correct — does it apply where AVA applied it?
- is the **authority** correct — declared, confirmed, hypothesis, observation?
- is the provenance correct, and is the evidence still reachable?
- **should it be superseded**, and is it not?
- is AVA asserting more than she knows about the user?

**A review is not a declaration.** Finding a declaration outdated during an
audit does not create a correction; it creates an audit finding. If the user
wants to correct it, she does so explicitly and separately, and the audit
records both facts. Otherwise the audit would silently become an input to
memory, and the instrument would be modifying what it measures.

---

## 19. Behavioral hypotheses

Evaluated separately, and **never** by count. A system that generates many
hypotheses is not better than one that generates few.

Per hypothesis: grounded in ≥2 independent observations? · genuinely
contextual, not a trait claim? · falsifiable as written? · contradicted by
later evidence? · confirmed by the user? · rejected, and why?

A confirmed hypothesis produces a **declaration**, and the two remain
distinguishable forever: the declaration carries `origin = confirmed` and the
hypothesis keeps its own record. Reporting "AVA learned a preference" for what
is a user declaration produced by confirmation would be the exact conflation
Slice 4 exists to prevent.

**Metric:** rejection rate is reported and is **not** treated as failure. A
hypothesis the user rejects is the system working.

---

## 20. Context Health validation

Sample decisions across all three states — **5 per state per month**, or all of
them where fewer occurred.

> Did AVA behave with appropriate assertiveness given the context actually
> available?

Four specific failures are counted, because each has a different cost:

| Failure | Meaning |
| --- | --- |
| **false abstention** | context was adequate; AVA abstained anyway |
| **unjustified assertion** | context was thin; AVA asserted regardless |
| **preparation under degraded context** | prepared work built on what AVA could not see |
| **unnecessary suppression** | a gate blocked something that should have been shown |

`false abstention` and `unjustified assertion` are **not** symmetric.
Unjustified assertion damages trust in everything AVA says; false abstention
costs one intervention. They are reported separately and never netted off.

---

## 21. Cost and latency

Feeds ADR-21 **Gate B**. This protocol supplies the measurement design; it does
**not** close the gate and does not set the economic thresholds.

### Measured
calls · calls per archetype · input tokens · output tokens · unknown token
counts (kept distinct from zero) · latency per call · retries · estimated cost ·
actual cost · `price_table_version` · failed calls · denied calls.

### Derived
`cost/day` · `cost/month` · `cost/useful_intervention` ·
`wasted preparation cost` · `latency P50` · `latency P95` ·
distribution of calls per archetype.

These are exactly the seven quantities ADR-21 Gate B requires, plus the inputs
needed to compute them.

### Reporting rules
- deterministic interventions cost **zero** and are reported as a separate
  stratum. An aggregate cost/intervention pooling them would understate the
  real cost of the paid path by an arbitrary factor;
- `cost/useful_intervention` uses `delivery = valuable` as its denominator, and
  states that denominator's `n` and coverage every time;
- null token counts stay null.

### Economic thresholds
**`OWNER DECISION REQUIRED BEFORE VALIDATION START`.** The historical values
(US$ 3 per useful intervention, US$ 60/month) are **not inherited**: they were
set for a study with connectors, three source classes and a human-produced
briefing. The operating conditions differ materially, so reusing them would be
a criterion change disguised as continuity. They are offered as reference
anchors in the decision pack, not as defaults.

---

## 22. Provider regime

No real provider call has ever been made.

### Regime A — deterministic-first validation

Start without a real provider. Mock stays active; the deterministic path is
unaffected because it never calls one.

**Can validate:** change detection · impact · all five opportunity classes ·
Value Vector and policies · briefing and attention · memory and cognition ·
feedback · outcomes · burden · Context Health behaviour.
**Cannot validate:** grounded answer quality · preparation quality · real cost ·
real latency. H-05 stays `NOT TESTED`; Gate B stays `OPEN`.

### Regime B — full V0 validation

Begins only after the controlled smoke and a minimum eval (§23).
**Can validate:** everything in A, plus answer quality, cost and latency.
**Cost:** a start delay, plus real spend under the Gate A caps.

### Recommendation

**Start under Regime A, and move to Regime B mid-study if the smoke passes.**

Three reasons. The deterministic loop is where the architecture's distinctive
claims live — change → impact → opportunity is the thesis, and it needs no
model. Waiting for a provider would delay the study for a component that is not
the thesis. And a regime change mid-study is safe here precisely because
`execution_mode` is recorded per decision, so the two periods can be separated
in analysis rather than silently pooled.

**Condition:** the regime boundary is recorded as a timestamp and every metric
crossing it is reported per regime as well as pooled. `OWNER DECISION REQUIRED`
on whether to attempt the smoke at all during v0.1.

---

## 23. Provider quality substudy

When a real provider is enabled, a **separate, small, controlled** eval — not
mixed with longitudinal product value.

Fixed synthetic CLASS 0 corpus, run once per prompt version, measuring: schema
validity · grounded correctness · unsupported assertions · evidence fidelity ·
appropriate abstention · latency · cost.

Kept separate on purpose. A model that produces well-formed grounded answers is
a technical fact; whether AVA is worth using is a product question. Merging them
would let good schema compliance stand in for value.

---

## 24. Personalization signal

There is no ML, no learned ranking and no feature vector, and none is built
during this study.

v0.1 asks only whether **signal exists** for a later study:

- does feedback repeat by context, or is it noise?
- is Declared Cognition stable, or rewritten constantly?
- is AVA self-consistent on similar situations?
- is there any visible difference between interventions where a declaration
  applied and comparable ones where none did?

**Explicitly not claimed:** the last bullet is not a lift measurement. There is
no random assignment, the user writes the declarations and judges the results,
and `n` will be small. It is reported as *signal present / absent / unclear*,
and H-04 stays `NOT TESTED` regardless of what it shows.

---

## 25. Baselines

### Baseline A — AVA without proactive briefing *(essential)*
Capture and Chat remain; the briefing is off. Isolates whether proactivity adds
anything beyond a queryable memory. **This is the baseline that matters**: the
product's claim is proactivity, and without this comparison a positive result
cannot distinguish "AVA is useful" from "having notes is useful".

### Baseline B — simple change log without ranking *(deferred)*
Show every change, unranked, no policies. Isolates the value of the Value
Vector and Show Policy. Operationally awkward: it needs a second surface built
solely for the study.

### Baseline C — opportunity rules without personal cognition *(deferred)*
The engine with declarations disabled. Isolates personalization — but it is a
weaker version of what §24 already examines, and disabling declarations
mid-study would degrade real work.

**For v0.1: Baseline A only.** B and C are recorded as future work. Building
two extra surfaces for a study this size would cost more than the finding is
worth.

---

## 26. Withdrawal design

Baseline A is implemented as **withdrawal**, not as a parallel arm.

**Design:** in the measured period, the briefing is withheld on a pre-assigned
schedule — recommended **one week in four**, chosen before the study starts and
recorded as dates.

**Rules:**
- withdrawal weeks are assigned in advance, never chosen because a week looks
  quiet or busy;
- Capture, Chat, Memory and feedback keep working — only proactive delivery
  stops;
- opportunities are still **generated and recorded**, simply not shown. This is
  the key property: the withheld set is preserved, so the analysis can ask what
  the user missed, or discovered unaided, during a withdrawal week;
- if withholding would cause real harm on a given day, the user overrides and
  the override is recorded as a protocol deviation with its reason. Real work
  outranks the study.

**Limitation, stated:** N=1, unblinded, and the user knows which weeks are
which. This is suggestive evidence about whether proactivity is missed, not a
controlled comparison, and will be reported as such.

**`OWNER DECISION REQUIRED`** on whether to include withdrawal at all.

---

## 27. Primary metrics

Eight. Each carries its own denominator, its own coverage and its own `n`.
There is no composite.

| ID | Metric | Definition | Unit |
| --- | --- | --- | --- |
| **PM-01** | Epistemic correctness | distribution of `epistemic` | interventions with an epistemic verdict |
| **PM-02** | Valuable intervention rate | `delivery = valuable` ÷ interventions with a delivery verdict; **and** share of briefings with ≥1 valuable item | intervention; briefing |
| **PM-03** | Attention waste | `already_known + irrelevant` ÷ items shown, per briefing | briefing |
| **PM-04** | Delivery latency | median `opportunity_shown_at − change_detectable_at`, segmented by `time_basis` | change |
| **PM-05** | Serious false negatives | count from audited samples, per §15 | audited checkpoint |
| **PM-06** | Memory accuracy | audited objects correct on content, scope, authority and provenance | audited memory object |
| **PM-07** | Context Health appropriateness | counts of the four failures in §20 | audited decision |
| **PM-08** | Cost per useful intervention | actual cost ÷ `delivery = valuable`, **paid path only** | ModelRun / intervention |

PM-02 and PM-03 are **always reported together**. Either alone is misleading:
the first hides waste, the second hides value.

PM-08 is `NOT MEASURABLE` under Regime A and is reported as such rather than
as zero.

---

## 28. Secondary metrics

`already_known` rate · `too_early` rate · `too_late` rate · prepared artifact
use (`used_as_is` / `used_after_edit` / `not_used`) · unresolved outcome rate ·
`ambiguous` outcome rate · abstention rate by Context Health · corrections per
week · hypothesis confirmation and rejection rates · top-k exclusion volume ·
capture burden per week · unraised change count.

**A secondary metric is never promoted to primary after results are observed.**
Promotion requires a new protocol version, and the original analysis is
reported alongside it.

---

## 29. Minimum sample and interpretation

**This study is descriptive.** At N=1, with the builder as subject and
evaluator, no inferential statistics are appropriate. No p-values, no
confidence intervals, no significance claims. Reporting them would lend
borrowed authority to a design that cannot support it.

| Metric | Minimum for interpretation | Below it |
| --- | --- | --- |
| PM-01 | ≥15 interventions with an epistemic verdict | report counts only, no rate |
| PM-02 | ≥15 with a delivery verdict **and** ≥20 briefings | counts only |
| PM-03 | ≥20 briefings | counts only |
| PM-04 | ≥10 changes with a `system_clock` detectable time | report the distribution, no median |
| PM-05 | ≥4 audited checkpoints | report findings individually |
| PM-06 | ≥10 audited memory objects | report findings individually |
| PM-07 | ≥5 decisions per health state | report findings individually |
| PM-08 | ≥10 real ModelRuns **and** ≥5 valuable interventions on the paid path | `NOT MEASURABLE` |

Rates are reported as `numerator / denominator`, never as a bare percentage.
A percentage over twelve observations reads as a finding; two integers read as
what they are.

---

## 30. GO / PIVOT / STOP

### Semantics

**GO** — enough evidence that the central thesis merits continuation and
controlled scope expansion.

**PIVOT** — value exists, but the current mechanism, cadence or scope is wrong.

**STOP** — with V0 working and context sufficient, there is not enough
incremental value to justify continuing the central thesis.

**INCONCLUSIVE** — insufficient data or inadequate methodological quality. A
legitimate and likely outcome, and **not** a soft STOP.

### Composition rules

No weighted score. The verdict follows explicit precedence.

1. **Any kill criterion (§31) triggered → STOP or PIVOT**, never GO. Which of
   the two depends on whether the failure is in the thesis or in the mechanism.
2. **Minimum samples in §29 unmet for PM-01, PM-02 or PM-03 → INCONCLUSIVE**,
   regardless of how good the numbers look. This rule exists to stop a small,
   flattering sample from being read as success.
3. **PM-01 and PM-02 both acceptable, PM-03 acceptable, no kill criterion →
   GO is available.**
4. **PM-02 acceptable but PM-03 unacceptable → PIVOT**: value exists, the
   attention mechanism is wrong.
5. **PM-01 acceptable but PM-02 unacceptable → PIVOT toward on-demand**: AVA is
   right and proactivity is not earning its place.
6. **PM-01 unacceptable → STOP or PIVOT toward a narrower, more verifiable
   scope.** A system that is confidently wrong is worse than no system.
7. Dimensions that are `NOT MEASURABLE` (PM-08 under Regime A) **cannot
   contribute to GO**. They are reported as open, and the corresponding
   hypothesis stays `NOT TESTED`.

**A GO under Regime A is a GO for the deterministic thesis only.** It does not
close ADR-21 Gate B, does not authorise scope expansion, and does not test
H-05.

### Acceptability thresholds

**`OWNER DECISION REQUIRED`** for every "acceptable" above. This document
defines the *structure* of the verdict; the tolerances belong to the person who
will live with the result. They are enumerated in the decision pack.

---

## 31. Kill criteria

Structure locked here; thresholds are owner decisions. **None inherits a
retrospective number automatically.**

| ID | Criterion | Trigger | Threshold |
| --- | --- | --- | --- |
| **PK-1** | Factual error rate | `incorrect` share of verdicts exceeds tolerance | `OWNER` |
| **PK-2** | Persistent attention waste | PM-03 above tolerance in the majority of briefings | `OWNER` |
| **PK-3** | Serious false negatives | serious misses recurring across audits | `OWNER` |
| **PK-4** | Proactivity without incremental value | withdrawal weeks indistinguishable from active weeks, or `already_known` dominating | `OWNER` |
| **PK-5** | Memory corruption | memory audit finds wrong scope, wrong authority or unreachable evidence beyond tolerance | `OWNER` |
| **PK-6** | Context Health too permissive | unjustified assertions recurring under DEGRADED or INSUFFICIENT | `OWNER` |
| **PK-7** | Unviable cost | cost/useful_intervention or monthly cost above tolerance, in all modes | `OWNER` |
| **PK-8** | Unviable capture burden | maintenance time exceeding plausible time saved, with no downward trend | `OWNER` |
| **PK-9** | Perceived surveillance | qualitative — no numeric threshold | qualitative |

PK-9 stays qualitative, matching the historical K-9 decision. A number here
would be false precision about a feeling, and the failure mode it guards
against — the user quietly stopping — shows up in usage, not in a rate.

**Reference anchors** from the retrospective study are listed in the decision
pack for orientation only. Any that is adopted must carry a written semantic
equivalence argument, per §2.

---

## 32. Software version identification

Every intervention must be attributable to a specific system. Recorded and
already present in the data:

`application commit` · `policy version` (on `opportunity_generation`) ·
`rule id` and `rule version` · `prompt version` (on `model_run` and
`decision_record`) · `provider` and `model` · `price_table_version` ·
`validation_schema_version`.

**Gap:** the application commit is not currently written into any row. It is
recoverable from the export's generation date plus git history, which is
adequate for v0.1 but imprecise across same-day changes. Recorded as
`IMPORTANT BUT NON-BLOCKING` (D-16).

Comparing behaviour across a version boundary without segmenting by it is a
protocol deviation.

---

## 33. Bugs during validation

| Class | Policy |
| --- | --- |
| **Critical measurement bug** | pause the affected metric immediately; data from the affected window is quarantined, not deleted; the metric resumes only after a version boundary is recorded |
| **Product bug** | fixing is allowed and expected — AVA is being used for real work. Record a version boundary and segment analysis across it |
| **Cosmetic bug** | fix normally; no boundary needed |

**No bug fix may rewrite earlier data.** Append-only tables make this
structural rather than procedural. If a fix requires reprocessing, the
reprocessing is recorded with its code version and its impact on every affected
metric, and the original figures are reported alongside.

---

## 34. Session log

Generated from telemetry, not written by hand. The daily log is produced by
`npm run validation:export` and contains only what the system observed.

The user adds, and only when it exists, what the system **cannot** observe:

- an outcome that became known outside AVA;
- a serious false negative noticed in passing;
- an unusual condition — illness, travel, an atypical week;
- a protocol deviation and its reason.

**Free text is optional and short.** Requiring a daily essay would add burden to
a study whose central question includes burden, and would corrupt H-03 by
construction.

---

## 35. User burden

A first-class measurement, not a footnote.

Tracked: minutes spent capturing per week · number of captures · corrections
made · relations declared · memory maintenance actions · feedback answered ·
subjective friction, noted only when notable.

> A system that saves ten minutes while demanding twenty-five is a hobby, not
> an assistant.

**Reported against value, always.** Burden is compared with the count of
`valuable` interventions in the same period. Neither figure is meaningful
alone, and burden falling over time matters more than its absolute level —
which is why the trend, not the mean, feeds PK-8.

---

## 36. Manual ingestion limitation

Every failure is classified before it is counted:

| Class | Meaning | Counts against |
| --- | --- | --- |
| **product intelligence failure** | the information was in the ledger and AVA did not use it correctly | the product |
| **source availability failure** | the information never entered AVA | **not** the product — recorded as burden |
| **capture discipline failure** | it entered late, or with the wrong `observedAt` | measurement quality |

Blaming the Opportunity Engine for information it never received would produce
a false negative finding about the engine. But the burden is a genuine product
finding and feeds H-03 and PK-8 — "the user did not type it in" is a real
limitation of a manual-first product, just not a reasoning failure.

---

## 37. Privacy during validation

The export carries ids, categories, timestamps, versions and missingness. It
carries **no** evidence text, declaration wording or feedback notes — verified
by test.

No parallel dataset containing content is created for analysis. Everything stays
local; nothing is uploaded. Where analysis needs content, it is read from the
ledger directly, in place.

---

## 38. Data freeze

At the end of the window:

1. record the freeze timestamp before looking at any aggregate;
2. run `npm run validation:export`, recording `validation_schema_version`;
3. run `npm run db:backup` and verify with `db:restore --verify`;
4. commit the export and metadata; the raw database stays local;
5. record the application commit and every version boundary in the window.

**Historical results are never silently reprocessed with later code.** If a
defect requires it, the reprocessing is versioned, its impact is stated, and
both figures are published.

---

## 39. No hindsight threshold changes

> Once validation begins, locked thresholds and primary metrics cannot be
> modified to improve the observed verdict.

Any change after the start is:

- recorded as a **protocol deviation**, with its date and reason;
- published as a **new protocol version**;
- accompanied by the **original analysis**, still reported.

This applies to thresholds, primary metric definitions, denominators, sampling
rules and the GO/PIVOT/STOP composition rules. It is the single provision that
makes everything above worth writing down.

---

## 40. Results document

To be created at the end, **not now**:

`docs/validation/results/prospective-validation-results-v0.1.md`

Structure: scope · versions and boundaries · sample and `n` · missingness ·
primary metrics · secondary metrics · false-negative audit · memory audit ·
Context Health audit · cost and latency · user burden · protocol deviations ·
GO / PIVOT / STOP with reasoning.

---

## 41. Pre-execution decisions

All decisions required before the first day are enumerated in
[Prospective Validation Pre-Execution Decisions v0.1](prospective-validation-pre-execution-decisions-v0.1.md).

Status: `PENDING`. Validation does not start until every blocking decision is
`LOCKED`.

---

## 42. Next gate

`Lock Prospective Validation pre-execution decisions`
