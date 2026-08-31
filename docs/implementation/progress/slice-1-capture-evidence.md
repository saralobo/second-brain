# Slice 1 — Capture → Evidence

```text
Status: COMPLETE
Tasks: S1-T01 … S1-T13 (13/13)
Date: 2026-08-30
External model calls: NONE
```

## Tasks completed

| ID | Task |
| --- | --- |
| S1-T01 | migration `0002_capture` — workstream, source, evidence, annotations, raw input |
| S1-T02 | append-only enforcement + adversarial test |
| S1-T03 | ten capture types with per-type validation |
| S1-T04 | three-plane quarantine pipeline |
| S1-T05 | `EvidenceRepository` with no update or delete |
| S1-T06 | `WorkstreamRepository` + server actions |
| S1-T07 | capture server action wiring |
| S1-T08 | Capture UI with loading, empty, success and validation states |
| S1-T09 | Workstream list and detail |
| S1-T10 | `evidence_arrived` telemetry |
| S1-T11 | prompt-injection containment test |
| S1-T12 | synthetic seed + explicit local reset |
| S1-T13 | end-to-end capture flow |

## Does it run?

Yes. `npm run db:seed && npm run build:web && npm start` serves the app on port 3210.

## What can the user do now?

Create a workstream, capture all ten types into it, and see the resulting evidence
with its provenance: origin, source, observation time, ordinal strength and content hash.

## Architecture invariants implemented

- **Evidence is append-only** — three layers: database rewrite rules, a repository with
  no mutating methods, and a test that attempts a raw `UPDATE` and `DELETE`.
- **Provenance preserved** — `content_origin`, lineage, source record and sha256 on every row.
- **Quarantine enforced** — raw text has no capabilities; `packages/ingestion` cannot
  import the database or a model provider, and the boundary lint proves it.
- **Rejected input is kept**, not discarded, in `raw_input`.
- **`observed_at` is correct at the source** — the property the deferred retrospective
  study could not obtain.

## Telemetry available

`capture_initiated`, `evidence_arrived`, `evidence_accepted`, `evidence_rejected`.

## What remains mocked

All model behaviour. No connector exists; manual capture is the only source.

## Tests

6 integration tests for the pipeline and injection containment, 10 for the ledger
and telemetry constraints, plus the capture path inside the golden scenarios.

Hostile payloads tested: instruction override, fake system prompt, injected markup,
SQL injection. All stored as data; none altered state or schema.

## Known limitations

- Capture is one form; there is no bulk or file import.
- `preference` and `principle` are stored as evidence but carry no declared authority
  yet — that is Slice 4.

## Blockers for next slice

None.
