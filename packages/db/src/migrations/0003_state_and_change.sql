-- 0003_state_and_change — Slice 2
-- Versioned state objects, simple relations, change records, entities.

CREATE TABLE state_object (
  id            text PRIMARY KEY,
  type          text NOT NULL
                CHECK (type IN ('decision','commitment','question','risk','artifact','goal')),
  workstream_id text NOT NULL REFERENCES workstream(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX state_object_workstream_idx ON state_object (workstream_id, type);

-- One immutable version per row. A change writes a new version and points the
-- previous one at it. Nothing is ever edited in place.
CREATE TABLE state_object_version (
  id                    text PRIMARY KEY,
  object_id             text NOT NULL REFERENCES state_object(id),
  type                  text NOT NULL,
  workstream_id         text NOT NULL REFERENCES workstream(id),
  version               integer NOT NULL CHECK (version >= 1),
  status                text NOT NULL,
  title                 text NOT NULL,
  fields                jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  strength              evidence_strength NOT NULL,
  sensitivity           sensitivity NOT NULL DEFAULT 'normal',
  observed_at           timestamptz NOT NULL,
  effective_at          timestamptz,
  effective_at_inferred boolean NOT NULL DEFAULT false,
  superseded_by         text REFERENCES state_object_version(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, version)
);
CREATE INDEX sov_object_idx      ON state_object_version (object_id, version);
CREATE INDEX sov_workstream_idx  ON state_object_version (workstream_id, type, status);
CREATE INDEX sov_observed_idx    ON state_object_version (observed_at);

-- Simple deterministic relations. Rows in a table — NOT a Work Graph, and no
-- graph technology (baseline §13: the graph is conditional on EXP-04).
CREATE TABLE relationship (
  id           text PRIMARY KEY,
  from_id      text NOT NULL,
  from_type    text NOT NULL,
  to_id        text NOT NULL,
  to_type      text NOT NULL,
  kind         text NOT NULL CHECK (kind IN (
                 'depends_on','part_of','decided_in','produces','updates',
                 'responsible_for','affects','supersedes','contradiction_candidate')),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX relationship_from_idx ON relationship (from_id);
CREATE INDEX relationship_to_idx   ON relationship (to_id);
CREATE INDEX relationship_kind_idx ON relationship (kind);

CREATE TABLE change_record (
  id                    text PRIMARY KEY,
  object_id             text NOT NULL REFERENCES state_object(id),
  object_type           text NOT NULL,
  workstream_id         text NOT NULL REFERENCES workstream(id),
  change_type           text NOT NULL CHECK (change_type IN (
                          'created','modified','removed','status_changed','superseded',
                          'invalidated','dependency_impacted','not_propagated','unknown_change')),
  -- References to versions, never copies of content.
  before_version_ref    text REFERENCES state_object_version(id),
  after_version_ref     text REFERENCES state_object_version(id),
  changed_fields        jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at           timestamptz NOT NULL,
  effective_at          timestamptz,
  effective_at_inferred boolean NOT NULL DEFAULT false,
  evidence_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  strength              evidence_strength NOT NULL,
  candidate_dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradiction_flag    boolean NOT NULL DEFAULT false,
  context_health_at_detection text,
  detector              text NOT NULL,
  detector_version      text NOT NULL,
  status                text NOT NULL CHECK (status IN ('candidate','accepted','rejected')),
  detected_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_record_object_idx     ON change_record (object_id);
CREATE INDEX change_record_workstream_idx ON change_record (workstream_id, observed_at DESC);
CREATE INDEX change_record_type_idx       ON change_record (change_type);

-- Minimal entity table. Entity resolution beyond explicit ids belongs to a
-- later slice; `unresolved` is a legitimate, preferred state.
CREATE TABLE entity (
  id                 text PRIMARY KEY,
  type               text NOT NULL,
  canonical_name     text NOT NULL,
  source_identifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  aliases            jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_status  text NOT NULL DEFAULT 'unresolved'
                     CHECK (resolution_status IN ('resolved','unresolved','ambiguous')),
  merged_into        text REFERENCES entity(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entity_status_idx ON entity (resolution_status);
