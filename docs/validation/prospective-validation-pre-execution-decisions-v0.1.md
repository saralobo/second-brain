# Prospective Validation Pre-Execution Decisions v0.1

```text
Status: LOCKED EXCEPT D-21
Protocol: prospective-validation-protocol-v0.1.md
Architecture baseline: Architecture Package v0.2 Final
AVA V0 status: FUNCTIONALLY COMPLETE
Validation status: NOT STARTED
Decisions locked: 23 of 24
Blocking decisions outstanding: 1 — D-21 Primary Workstream
Locked at: 2026-08-31
```

> Every decision below was fixed **before** the first day of validation and
> before any observation. A threshold chosen after seeing results is not a
> threshold; it is a description of the result.

**Nothing here is a result.** No data has been analysed, no hypothesis tested,
no GO / PIVOT / STOP declared. H-01 … H-06 remain `NOT TESTED`.

---

## Lock semantics

Every locked decision records a final value, its rationale, `locked_at`, its
lock status and its source.

| Source | Meaning |
| --- | --- |
| `METHODOLOGICAL DEFAULT` | proposed by the protocol and accepted |
| `OWNER DECISION` | chosen by the project owner |

**After validation begins, no locked decision may be changed silently.** A
change requires a recorded protocol deviation with justification, a new
protocol version where the change is material, and the original analysis
reported alongside the revised one (protocol §39).

---

## Counts

| Type | Total | Locked | Pending |
| --- | --- | --- | --- |
| A — Methodological default | 9 | 9 | 0 |
| B — Owner product/economic | 10 | 10 | 0 |
| C — Scope selection | 3 | 2 | **1 — D-21** |
| D — Provider gate | 2 | 2 | 0 |
| **Total** | **24** | **23** | **1** |

**Blocking and outstanding: 1.** Validation cannot start until D-21 is locked.

---

# Type A — Methodological defaults

### D-01 · Validation period length
**Final value:** `1 week warm-up + 7 weeks measured` (Option 2)
**Rationale:** the binding constraint is event density, not calendar time.
Seven measured weeks is the shortest window that plausibly contains the §6
volume conditions while keeping capture burden survivable, and it spans more
than one work phase so the opportunity classes vary. The window is extended if
the volume conditions are unmet; it is not shortened because results look good.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-02 · Warm-up
**Final value:** `7 days, WARM-UP / DATA COLLECTION ONLY`
**Rationale:** the corpus starts empty, Declared Cognition is being
initialised, relations have not been declared, and the interface is being
learned. Early rates are artefacts of setup, not of the engine. Warm-up data is
**never deleted**: it is stored and exported identically, excluded from primary
metrics, and included in the burden trend (the early cost of adoption is a real
finding), in bug discovery and in the memory audit baseline. The boundary is a
timestamp recorded before the period begins.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-03 · False-negative audit sampling
**Final value:** `every 5th closed checkpoint, plus every checkpoint where AVA showed nothing`
**Rationale:** sampling by position, never by outcome — auditing only periods
that felt disappointing would measure disappointment. The second clause is the
load-bearing one: a silent checkpoint is where a miss is most likely and least
visible. The schedule is fixed before day one and not adjusted mid-study.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-04 · Memory audit sampling
**Final value:** `every 2nd week, 5 objects, stratified across the five memory kinds`
**Rationale:** dense enough that PM-06 is more than anecdote, sparse enough that
the audit does not become a burden the study is trying to measure. Over seven
measured weeks this yields roughly 15–20 audited objects.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-05 · Context Health sampling
**Final value:** `5 decisions per health state per month, or all where fewer occurred`
**Rationale:** enough to distinguish a pattern from an incident. The fallback
clause matters: `INSUFFICIENT` may be rare, and reporting "all 2 that occurred"
is honest where inventing a quota is not.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-06 · Feedback coverage floor
**Final value:** `≥50% of shown interventions carry at least one feedback dimension`
**Rationale:** below this, correctness and value rest on a self-selected
minority — probably the memorable ones. Above roughly 70% the study starts
pressuring the user to answer, which changes the behaviour being measured.
Below the floor, PM-01 and PM-02 are reported as `INSUFFICIENT COVERAGE` with
`n` stated, not as failures.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-07 · Aggregation rule across opportunity types
**Final value:** `aggregate only when no single class exceeds 60% of shown interventions`
**Rationale:** `closing_risk` fires on a recorded date and is nearly always
"correct", while `unpropagated_decision` requires real inference. An aggregate
dominated by date arithmetic would look strong while saying nothing about the
capability the product claims. Above the threshold, results are reported per
class.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-08 · Anticipation usefulness rule
**Final value:** `delivery_latency ≥ 1 checkpoint interval`
**Rationale:** inherited from retrospective A-02. **Semantic equivalence:** the
retrospective value was reconstructed and this one is measured, but the rule is
derived from cadence rather than being an absolute number, so it stays correct
under any cadence. The rule transfers; no number is imported. A window is only
useful if a checkpoint fits inside it.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-09 · Statistical treatment
**Final value:** `DESCRIPTIVE LONGITUDINAL VALIDATION — no p-values, no confidence intervals, no significance claims, no population generalisation`
**Rationale:** at N=1, with the builder as subject and evaluator, the dominant
source of error is not sampling. A p-value would describe sampling noise in a
design whose principal threats are self-evaluation and a single context, and
would lend borrowed authority to a study that cannot support it. Rates are
reported as `numerator / denominator (unanswered: n)`, never as bare
percentages.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

---

# Type B — Owner thresholds

### D-10 · Epistemic correctness (PM-01, PK-1)
**Final value:**
```text
(correct + partially_correct) / verifiable interventions ≥ 85%
guardrail: incorrect ≤ 10%
not_verifiable is EXCLUDED from the denominator and reported separately
```
**Rationale:** correctness is the load-bearing dimension — every other finding
rests on output that can be trusted. Excluding `not_verifiable` from the
denominator prevents the most self-serving error available here: an
unverifiable claim inflating either the success or the failure bucket.

**Interpretation note.** Since `correct + partially_correct + incorrect = 100%`
of verifiable interventions, the 85% bar alone implies `incorrect ≤ 15%`. The
guardrail at 10% is therefore the **binding constraint**, and a result can
satisfy the headline threshold while failing the guardrail. Both are evaluated;
the guardrail is not decorative.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-11 · Serious false negatives (PM-05, PK-3)
**Final value:**
```text
maximum 1 serious false negative during the measured period
AND the same material failure pattern must not occur twice
```
Either — 2 or more serious false negatives, or a repetition of the same
material pattern — **blocks GO**. `PIVOT`, `STOP` or `INCONCLUSIVE` remain
available depending on the rest of the evidence.

**Rationale:** a single miss in seven weeks is a system with limits; a repeated
pattern is a system with a blind spot, and a blind spot is a design fact rather
than an accident. Uses the four-condition definition in protocol §15 —
evidence sufficiency, materiality, V0 scope, consequence. Misses failing any
condition are **trivial false negatives**, recorded and counted separately.

**Semantic equivalence to retrospective K-10 — NOT INHERITED.** K-10 triggered
on *≥1 in more than one briefing*, against a human reviewer with wide access
and no scope limit. The §15 definition adds a scope condition precisely so that
V0's architectural limits are not counted as product failures. This value is an
owner decision made against the new definition, not a migration of the old one.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-12 · Attention waste (PM-03, PK-2)
**Final value:** `(already_known + irrelevant) / items shown ≤ 33%, per briefing`
**Rationale:** uses the protocol §13 definition exactly; categories are not
redefined. The constituent dimensions continue to be reported separately —
`already_known` is a novelty failure and `irrelevant` is an attention failure,
and they have different remedies. Above this, the checkpoint becomes an inbox,
which is the *proactivity noise* failure mode of baseline §33.

**Semantic equivalence to retrospective B-05 / K-6 — PARTIAL, ACCEPTED.** The
unit matches (items promoted per briefing) and the failure mode is identical.
What differs is the producer: a human with wide access chose those items,
whereas AVA chooses under real Context Health and a top-k cap. The owner
accepted the inheritance on the grounds that the tolerance expresses how much
noise *she* will accept, which does not depend on who produced it.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-13 · Valuable intervention rate (PM-02, PK-4)
**Final value:** `delivery = valuable ≥ 50% of interventions carrying a delivery verdict`
**Rationale:** the product's claim is that proactive interventions are worth the
interruption. Half of judged interventions earning `valuable` is a demanding
but reachable bar for a first version.

**Denominator resolution — recorded rather than assumed.** The instruction read
"≥50% of shown interventions receive delivery feedback = valuable" while also
stating that missing feedback is not negative. Those two clauses are
incompatible: with *shown* as the denominator, every unanswered intervention
counts against the rate, which is exactly treating missing feedback as
negative. The only reading satisfying both is **interventions carrying a
delivery verdict**, which is also the PM-02 definition already in the protocol.
That reading is locked. Coverage remains governed by D-06, and the briefing-level
figure (share of briefings with ≥1 valuable item) continues to be reported
alongside it per protocol §17.

**Semantic equivalence to retrospective B-04 / K-1 — NOT INHERITED.** The 75%
bar was set against a manually produced ideal briefing — the ceiling of
achievable value. AVA is the floor.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-14 · Cost per useful intervention (PM-08, PK-7)
**Final value:** `≤ USD 1.00 per useful intervention`
**Scope:** applies **only** to the provider-dependent stratum with real
observed cost. Deterministic interventions cost zero and are excluded from this
denominator entirely.
**Rationale:** pooling free deterministic interventions with paid ones would
understate the real cost of the paid path by an arbitrary factor, and the
factor grows as the deterministic engine improves — the metric would look
better precisely as the paid path got relatively worse.

**Semantic equivalence to retrospective D-01 / K-4 — NOT INHERITED.** The
US$ 3 anchor was set for a study with connectors, three source classes and
human-produced briefings.
**Measurability:** `NOT MEASURABLE` under Regime A. Reported as such, never as
zero or as a pass.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-15 · Monthly economic ceiling (PK-7)
**Final value:** `≤ USD 20.00 per month`
**Rationale:** a validation threshold expressing what the owner will pay for
AVA at V0 scope.

**Semantic separation from ADR-21 Gate A — mandatory, and non-obvious because
the numbers coincide.** The Gate A monthly Operational Safety Cap is also
US$ 20.00. They are different objects:

| | Gate A monthly cap | D-15 |
| --- | --- | --- |
| Purpose | prevent unbounded spend while building | judge economic viability |
| Enforced by | Budget Controller, at runtime | analysis, after the fact |
| Meaning if reached | the guardrail worked | the ceiling was tested |

**Interpretation rule, locked.** Because the operational cap and the validation
ceiling are numerically identical, **observed monthly spend can never exceed
D-15** — the Budget Controller halts spending first. D-15 therefore cannot fail
by observation, only by the cap binding. Accordingly:

- if the monthly safety cap is **reached or approached**, D-15 is recorded as
  `AT CEILING — DEMAND EXCEEDED SUPPLY`, and the *unmet* demand (denied calls,
  abstentions caused by budget) is reported as the finding;
- a month that stays below the cap is recorded as `WITHIN CEILING`, and this is
  **not** evidence that the ceiling is comfortable — only that it was not
  reached at V0 volume with one user;
- a cap being reached is **never** reported as economic validation. ADR-21 §Gate A
  already states that a cap being hit says nothing about whether the cost is
  acceptable.

**Semantic equivalence to retrospective D-02 / K-4 — NOT INHERITED.**
**Measurability:** `NOT MEASURABLE` under Regime A.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-16 · Manual capture burden (PK-8)
**Final value:** `≤ 60 minutes per week, after warm-up`
**Also reported, mandatory:** the week-by-week trend · number of captures ·
relations declared · corrections made · feedback burden.

**Rationale and trend rule.** The mean alone can hide continuous growth: 20, 40
and 60 minutes averages 40 and passes, while describing a system becoming
unsustainable. The trend is therefore evaluated as a first-class criterion, not
a footnote — a rising burden inside the ceiling is reported as a **failure
signal** for H-03 even when the average passes.

**Semantic equivalence to retrospective B-06 / K-5 — PARTIAL AND INVERTED.**
Retrospectively those minutes were normalization overhead, a cost to be
minimised. In V0, capture is a deliberate feature that guarantees a correct
`observed_at`. The number does not transfer — the ceiling here is double the
old one, per checkpoint versus per week — but the **trend requirement does**,
and it is the stronger half of the original criterion.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-17 · Memory accuracy (PM-06, PK-5)
**Final value:**
```text
≥ 95% of audited memory objects correct on content, scope, authority and provenance
AND zero critical authority errors
```

**Critical authority error** — at minimum:

1. AVA stating that the user declared something she never declared;
2. a behavioural hypothesis presented as a declaration;
3. a superseded declaration used as current when it should not be;
4. personal scope applied materially outside its context.

**Any critical authority error blocks GO until analysed.** These are not
degrees of inaccuracy: each is AVA misrepresenting the user to herself, which
is the failure most corrosive to trust and the one Slice 4 exists to prevent.

**Interpretation note on granularity.** With D-04 yielding roughly 15–20
audited objects, the 95% bar is stricter than it appears: at n=17, 16/17 is
94.1% and fails, so the threshold is effectively **zero content errors** at the
expected sample size. This is recorded now rather than discovered later, so the
result is not reinterpreted after the fact. If the audited sample ends below 10
objects, PM-06 is reported as findings individually per protocol §29 and no
rate is claimed.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-18 · Context Health appropriateness (PM-07, PK-6)
**Final value:**
```text
≥ 90% appropriate behaviour among audited cases
guardrail: zero unjustified assertions under INSUFFICIENT
guardrail: zero preparation under INSUFFICIENT
```
**Guardrails are not averaged away.** A single unjustified assertion under
INSUFFICIENT fails D-18 regardless of the headline rate. The four failure
classes in protocol §20 are counted separately and never netted off: an
unjustified assertion damages trust in everything AVA says, while a false
abstention costs one intervention.

**Interpretation note.** The second guardrail is currently **enforced
structurally**: `evaluatePrepare` returns `BLOCKED_BY_HEALTH` whenever context
is not `HEALTHY`, so preparation under INSUFFICIENT is impossible by
construction rather than by policy compliance. Its value in this study is
therefore **regression detection**, not discovery — it confirms the constraint
held, and would catch a future change that removed it. Recorded so a `zero`
result is not mistaken for evidence of good judgement.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

### D-19 · Withdrawal design (Baseline A)
**Final value:** `YES — withdrawal weeks are Week 3 and Week 6 of the 7 measured weeks`

Non-consecutive, assigned in advance, recorded as dates before the study
begins.

**During a withdrawal week:**

| Continues | Stops |
| --- | --- |
| Capture · Evidence · Change detection · Impact | proactive delivery / briefing |
| Memory · Declared Cognition · Chat | — |
| Opportunity **generation and recording** | Opportunity **showing** |
| feedback and outcome recording | — |

**Preservation rule, locked.** Candidates generated during a withdrawal week
are retained internally with full generation snapshots. They are **never shown
retroactively as though they had been delivered during that week**:
`shown_at` stays null for the withdrawal period, and any later delivery carries
its own real timestamp. The withheld set is what makes the comparison possible
— it allows asking what the user missed, or discovered unaided, while
proactivity was off.

**Override:** if withholding would cause real harm on a given day, the user
overrides and records a protocol deviation with its reason. Real work outranks
the study.

**Interpretation limit, locked.** N=1, unblinded, and the user knows which weeks
are which. The comparison is **descriptive**. No strong causal inference is
drawn, and no counterfactual claim about what AVA prevented is made.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

---

# Type C — Scope selections

### D-20 · Number of workstreams
**Final value:** `one primary workstream`
**Rationale:** locked per the recommendation already recorded in this pack.
Burden multiplies with each additional workstream, directly threatening H-03,
and the §6 volume conditions become harder to reach in each. At N=1 the study
cannot generalise regardless, so the extra cost buys little.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-21 · Which workstream
**Final value:** `OWNER INPUT REQUIRED — NOT LOCKED`

This requires the owner's knowledge of her own work and is deliberately not
filled with a placeholder. **`AVA development` is explicitly excluded as a
default** — validating a proactive work assistant on the project that built it
would measure the tool against its own construction, where every change is
already known to the user and the dependencies live in her head rather than in
the ledger.

**Selection criteria — LOCKED.** Fixed now, so the choice cannot later be made
to flatter the result. The selected workstream must be:

1. **real** — actual work with actual consequences;
2. **active** throughout most of the validation window;
3. **external to the AVA project itself**;
4. **expected to last** for the majority of the measured period;
5. **dynamic enough** to contain decisions, changes, artifacts and commitments;
6. **legitimate to capture** within the privacy constraints of ADR-22;
7. **not chosen because it is expected to make AVA look good.**

**Consequence of a poor choice:** a quiet workstream produces too few changes,
and the study ends `INCONCLUSIVE` for lack of events rather than for lack of
value — which costs eight weeks and answers nothing.
**Status:** `PENDING` · **Blocking:** **YES**

### D-22 · Checkpoint cadence
**Final value:** `daily on working days, at a consistent time`
**Rationale:** locked per the recommendation already recorded in this pack.
Cadence defines the D-08 anticipation rule and the PM-03 denominator, so it
cannot change mid-study without a protocol deviation. Baseline §34 nº 8 lists
ideal cadence as an open question; this study fixes one cadence in order to
measure anything, and finding the ideal remains later work.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

---

# Type D — Provider gate

### D-23 · Provider regime
**Final value:** `start under Regime A; move to Regime B mid-study if provider:smoke = PASS`

**Regime A — may start without a real provider call.** Validates: Evidence ·
Change · Impact · Opportunity · attention and top-k · deterministic briefing ·
memory · cognition · feedback · outcomes · burden · Context Health behaviour.

**Regime B — may start only after `provider:smoke = PASS` on CLASS 0 synthetic
data.** Adds: grounded answer quality · preparation quality · real cost · real
latency.

**Rationale:** the deterministic loop is where the architecture's distinctive
claim lives — change → impact → opportunity is the thesis and needs no model.
Delaying the study for a component that is not the thesis would cost weeks for
nothing. Switching mid-study is safe here **only because `execution_mode` is
recorded per decision**, so the two periods can be separated in analysis
instead of silently pooled.

**Locked conditions:**

- the regime boundary is recorded as a **version boundary** with a timestamp
  (protocol §32);
- every metric crossing the boundary is reported **per regime** as well as
  pooled;
- deterministic and provider-dependent cost and latency are **never mixed**;
- the provider quality substudy (protocol §23) stays **separate** from the
  longitudinal product-value study.

**Under Regime A:** H-05 stays `NOT TESTED`, ADR-21 Gate B stays `OPEN`, and
D-14 and D-15 are reported `NOT MEASURABLE`.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `METHODOLOGICAL DEFAULT`

### D-24 · Attempt the Anthropic smoke during v0.1
**Final value:** `YES`
**Rationale:** it is the only route to H-05 and to closing ADR-21 Gate B. It is
cheap, bounded by the Gate A caps, and uses CLASS 0 synthetic data only, so it
risks nothing real. Not attempting it would leave Gate B open indefinitely and
authorise no scope expansion whatever the study shows.
**Condition:** requires `ANTHROPIC_API_KEY`. If unavailable, the study proceeds
under Regime A and this is recorded as an unmet condition, not as a failure.
**locked_at:** 2026-08-31 · **Status:** `LOCKED` · **Source:** `OWNER DECISION`

---

## GO / PIVOT / STOP combination rule — LOCKED

There is **no AVA Score**. No single primary metric grants GO.

### GO requires, at minimum

All of the following PASS:

`D-10` correctness · `D-11` serious false-negative guardrail ·
`D-12` attention waste · `D-13` valuable intervention rate ·
`D-16` capture burden · `D-17` memory accuracy and authority safety ·
`D-18` Context Health appropriateness

**and** no methodological integrity failure that invalidates the results.

When Regime B is in scope, `D-14` and `D-15` must additionally be interpreted
for the **provider-dependent stratum**.

**A metric that is `NOT MEASURABLE` or `INSUFFICIENT COVERAGE` cannot PASS.** It
is reported as open, and the corresponding hypothesis stays `NOT TESTED`. A GO
reached under Regime A is a GO **for the deterministic thesis only**: it does
not close ADR-21 Gate B, does not authorise scope expansion, and does not test
H-05.

### PIVOT

Value exists, but a specific mechanism fails. Representative shapes:

- high correctness with high `already_known` → the timing or the novelty
  estimate is wrong, not the reasoning;
- useful interventions with excessive manual burden → the value is real and the
  input cost is not sustainable;
- good opportunities with poor timing → cadence or delivery latency;
- memory useful while the opportunity policy is noisy → the attention layer,
  not the knowledge layer.

### STOP

Only when the central thesis of incremental value has been **sufficiently
tested** and fails materially, or when trust, safety or burden make the
direction unjustifiable regardless of measured value.

### INCONCLUSIVE

Insufficient sample · insufficient feedback coverage · insufficient events ·
a measurement bug · inadequate context · a materially compromised protocol.

**INCONCLUSIVE is never converted into GO or PIVOT by narrative preference.** It
is a legitimate outcome and is reported as itself.

---

## Sample interpretation — LOCKED

The minimum sample requirements in protocol §29 are preserved unchanged. The
study is `DESCRIPTIVE LONGITUDINAL VALIDATION` at N=1. No p-values, no
confidence intervals, no claim of population generalisation.

---

## Protocol correction made during this lock

**PM-04 minimum sample condition was unsatisfiable by construction.** It read
*"≥10 changes with a `system_clock` detectable time"*. In V0,
`change_detectable_at` is always written with `time_basis = reported`, because
`REPORTED_TIME_EVENTS` includes it unconditionally and no caller overrides it —
every detectable time is a user assertion, since capture is manual. The
condition could therefore never be met, and PM-04 would have been permanently
unreportable.

Corrected before locking to *"≥10 changes with a recorded detectable time,
reported by `time_basis` stratum"*. The segmentation mechanism stays in place
for when connectors arrive and produce genuine `system_clock` detectable times.

This is a **pre-execution correction**, not a protocol deviation: it was made
before the study started and before any observation.

---

## Next gate

`Select and lock Primary Validation Workstream`
