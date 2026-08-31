# Slice 2 — Current State → Change

```text
Status: COMPLETE
Tasks: S2-T01 … S2-T12 (12/12)
Date: 2026-08-30
Milestone: 1 — Capture and Change Loop, REACHED
External model calls: NONE
```

## Tasks completed

| ID | Task |
| --- | --- |
| S2-T01 | migration `0003_state_and_change` |
| S2-T02 | state objects and lifecycles for six types |
| S2-T03 | versioning and supersession |
| S2-T04 | Current State projector + reconstruction |
| S2-T05 | Change Engine stages 1–2 |
| S2-T06 | stage 3 — object-specific rules |
| S2-T07 | stage 4 — lexical diff |
| S2-T08 | stage 6 — abstention on high impact with weak evidence |
| S2-T09 | relationships + impact, depth 1–2 |
| S2-T10 | `change_detectable_at` and `change_detected` telemetry |
| S2-T11 | workstream UI: state, changes, timeline |
| S2-T12 | GS-01 as a golden test |

## Does it run?

Yes. The full Milestone 1 loop is visible in the browser.

## What can the user do now?

Capture a decision, capture information that supersedes it, and see AVA report what
changed — the change type, which detector settled it, the before and after version
references, the evidence behind it, and the earlier version still readable in place.
A dependent item is flagged as potentially impacted.

## Architecture invariants implemented

- **Current State is a projection, not a second truth** — rebuilt from the ledger on
  every read; a canonical serialisation test proves two rebuilds are identical.
- **Supersession is historical** — the earlier version keeps its wording, its evidence
  and its timestamps; re-superseding an already superseded version is refused.
- **Change is deterministic-first** — stages 1 to 4 settle everything in this batch.
  `stage5_semantic` exists in the type and is never reached; there is no code path to it.
- **ChangeRecord holds references, not copies** — a test serialises a record and asserts
  the previous content does not appear in it.
- **Change is not Impact** — impact is recorded as its own `dependency_impacted` change
  on the affected object.
- **No Work Graph** — relations are rows in a flat table, traversed to an explicit depth.
  A test asserts no vector or graph extension is installed.
- **Reasoning never uses `created_at`** — a test writes evidence out of order and proves
  ordering follows `observed_at`.

## Telemetry available

Added `change_detectable_at`, `change_detection_triggered`, `change_detected`,
`state_projection_triggered`. Eight of the nine timeline events that Batch 1 can
honestly produce are now emitted; the remaining five belong to Slices 5 and 6 and the
telemetry writer **refuses to emit them**, so no fabricated timeline can appear.

## What remains mocked

All model behaviour. Chat, retrieval, memory, opportunities and feedback do not exist.
Entity resolution is present as a table with `unresolved` as its default; no resolution
cascade beyond explicit ids is implemented.

## Tests

21 domain tests for state, supersession, projection, the nine change types and impact;
6 integration tests for reconstruction and temporal correctness; GS-01, GS-06, GS-07;
4 end-to-end tests against the built server.

## Known limitations

- Impact propagates only along declared relations; nothing infers a relation.
- The abstention path (stage 6) is exercised by unit tests but has no UI review queue.
- GS-02 is implemented for its impact half only; the Opportunity half is Slice 5.

## Blockers for next slice

Slice 3 needs the ADR-22 provider gate closed before any real model call. It does not
block starting Slice 3: retrieval, Context Packet and Context Health are deterministic
and can be built against the mock provider.
