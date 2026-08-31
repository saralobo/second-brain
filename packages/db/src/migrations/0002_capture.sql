-- 0002_capture — Slice 1
-- Workstream, sources and the append-only Evidence Ledger.

CREATE TABLE workstream (
  id         text PRIMARY KEY,
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  goal       text,
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_record (
  id                 text PRIMARY KEY,
  kind               text NOT NULL
                     CHECK (kind IN ('manual_capture', 'chat', 'file_upload')),
  authority          text NOT NULL DEFAULT 'user_direct',
  availability_state text NOT NULL DEFAULT 'available'
                     CHECK (availability_state IN ('available', 'partial', 'unavailable')),
  last_ingested_at   timestamptz,
  acl                text NOT NULL DEFAULT 'owner',
  purpose            text NOT NULL DEFAULT 'personal_work_context',
  retention          text NOT NULL DEFAULT 'until_deleted',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Evidence: level zero. content, observed_at and hash are immutable.
CREATE TABLE evidence (
  id                    text PRIMARY KEY,
  content               text NOT NULL,
  content_type          text NOT NULL DEFAULT 'text/plain',
  content_origin        content_origin NOT NULL,
  source_record_id      text NOT NULL REFERENCES source_record(id),
  workstream_id         text REFERENCES workstream(id),
  capture_type          text NOT NULL,
  title                 text,
  observed_at           timestamptz NOT NULL,
  effective_at          timestamptz,
  effective_at_inferred boolean NOT NULL DEFAULT false,
  strength              evidence_strength NOT NULL,
  sensitivity           sensitivity NOT NULL DEFAULT 'normal',
  hash                  text NOT NULL,
  lineage               jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  fts                   tsvector GENERATED ALWAYS AS (
                          to_tsvector('simple', coalesce(title, '') || ' ' || content)
                        ) STORED
);

CREATE INDEX evidence_workstream_idx ON evidence (workstream_id);
CREATE INDEX evidence_observed_idx   ON evidence (observed_at);
CREATE INDEX evidence_origin_idx     ON evidence (content_origin);
CREATE INDEX evidence_fts_idx        ON evidence USING GIN (fts);

-- Append-only enforcement at the database, not by convention (spec §6).
-- Deliberately NOT deduplicated on hash: the same content observed twice is
-- two observations, and that is data.
CREATE RULE evidence_no_update AS ON UPDATE TO evidence DO INSTEAD NOTHING;
CREATE RULE evidence_no_delete AS ON DELETE TO evidence DO INSTEAD NOTHING;

-- Fields that legitimately evolve live in a satellite table, also append-only.
-- Reading takes the most recent annotation. This keeps evidence itself
-- literally immutable instead of "immutable by convention".
CREATE TABLE evidence_annotation (
  id            text PRIMARY KEY,
  evidence_id   text NOT NULL REFERENCES evidence(id),
  workstream_id text REFERENCES workstream(id),
  sensitivity   sensitivity,
  entity_refs   jsonb NOT NULL DEFAULT '[]'::jsonb,
  annotated_at  timestamptz NOT NULL DEFAULT now(),
  reason        text
);
CREATE INDEX evidence_annotation_evidence_idx ON evidence_annotation (evidence_id, annotated_at DESC);
CREATE RULE evidence_annotation_no_update AS ON UPDATE TO evidence_annotation DO INSTEAD NOTHING;

-- Quarantine record: what arrived, whether it was accepted, and why not.
-- Rejected input is kept, not discarded (spec §6).
CREATE TABLE raw_input (
  id            text PRIMARY KEY,
  raw_content   text NOT NULL,
  declared_type text,
  workstream_id text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  stage         text NOT NULL CHECK (stage IN ('raw', 'parsed', 'accepted', 'rejected')),
  issues        jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_id   text REFERENCES evidence(id)
);
CREATE INDEX raw_input_stage_idx ON raw_input (stage);
