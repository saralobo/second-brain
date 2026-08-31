-- 0001_foundation — Slice 0
-- Transversal enums and the validation telemetry spine.

CREATE TYPE content_origin AS ENUM ('user', 'third_party', 'source_system', 'system');
CREATE TYPE evidence_strength AS ENUM ('ESTABLISHED', 'SUPPORTED', 'SPECULATIVE');
CREATE TYPE sensitivity AS ENUM ('normal', 'sensitive', 'restricted');

-- Prospective validation telemetry (spec §23).
-- occurred_at is the real instant of the event, never the write time.
CREATE TABLE validation_event (
  id            text PRIMARY KEY,
  event_type    text        NOT NULL,
  occurred_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  subject_type  text        NOT NULL,
  subject_id    text        NOT NULL,
  workstream_id text,
  context_health    text,
  evidence_strength evidence_strength,
  model_run_id      text,
  decision_record_id text,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Anti-retroactivity (spec §23, rule 3). An event may not be backdated and
  -- may not be dated in the future. A lost event stays lost: that is data, not
  -- a gap to be filled in later.
  CONSTRAINT validation_event_not_retroactive
    CHECK (occurred_at >= created_at - interval '60 seconds'),
  CONSTRAINT validation_event_not_future
    CHECK (occurred_at <= created_at + interval '2 seconds')
);

CREATE INDEX validation_event_type_idx ON validation_event (event_type);
CREATE INDEX validation_event_occurred_idx ON validation_event (occurred_at);
CREATE INDEX validation_event_subject_idx ON validation_event (subject_type, subject_id);

-- Telemetry is append-only for the same reason evidence is: a rewritten
-- timeline cannot validate anything.
CREATE RULE validation_event_no_update AS ON UPDATE TO validation_event DO INSTEAD NOTHING;
CREATE RULE validation_event_no_delete AS ON DELETE TO validation_event DO INSTEAD NOTHING;
