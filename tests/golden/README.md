# Golden scenarios

Deterministic end-to-end scenarios used as technical tests.

**A result on a synthetic scenario is a technical test. It is never presented,
reported or counted as evidence of product validation.** A synthetic scenario
proves the code does what it was written to do; it says nothing about whether
the product thesis holds.

Scenarios implemented through Slice 3:

| ID | Scenario | Status |
| --- | --- | --- |
| GS-01 | Superseded Decision | implemented |
| GS-02 | Invalidated Artifact (impact only; the Opportunity half is Slice 5) | partial, impact half |
| GS-03 | Unresolved Question | partial — the chat half; the Opportunity half is Slice 5 |
| GS-04 | Correction of Declared Cognition | implemented |
| GS-05 | Insufficient Context → Abstention | implemented |
| GS-06 | System-origin evidence cannot self-confirm | implemented, extended to grounded answering and to memory |
| GS-07 | Entity ambiguity remains unresolved | implemented |

Not implemented here because it depends on later slices: GS-08 (Slices 5–6).

GS-06 now closes the full self-poisoning cycle: AVA states X, X is captured as
system-origin evidence, X is retrieved later, and it must not count as new
confirmation of X. Left open, that loop is how a system talks itself into
certainty with nothing behind it but repetition.

GS-05 is the one the implementation plan calls the easiest to let pass by
accident. It passes only when AVA **refuses** — an answer with a warning
attached would still be an answer, and that is the failure it exists to catch.
