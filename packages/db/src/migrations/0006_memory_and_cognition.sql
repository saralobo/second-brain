-- 0006_memory_and_cognition — Slice 4
--
-- The Implementation Plan numbers this migration `0005` under S4-T01. That
-- number was taken by the Slice 3 chat tables, so this is `0006`; the content
-- is unchanged. Recorded as deviation D-11.

CREATE TYPE cognition_type AS ENUM (
  'principle', 'quality_criterion', 'contextual_preference', 'autonomy_limit',
  'must_confirm_action', 'never_infer_subject', 'positive_example',
  'negative_example', 'exception'
);

-- Only three routes in. Observation is deliberately absent from this enum:
-- a pattern AVA noticed can never become something the user declared.
CREATE TYPE cognition_origin AS ENUM ('declared', 'confirmed', 'corrected');

-- Declared Cognition (baseline §19). Versioned, never edited in place: a
-- correction writes a new version and points the old one at it.
CREATE TABLE declared_cognition (
  id                    text PRIMARY KEY,
  root_id               text NOT NULL,          -- the version chain
  version               integer NOT NULL CHECK (version >= 1),
  content               text NOT NULL CHECK (length(trim(content)) > 0),
  cognition_type        cognition_type NOT NULL,
  scope                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience              text,
  declared_at           timestamptz NOT NULL,
  effective_at          timestamptz,
  superseded_by         text REFERENCES declared_cognition(id),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'superseded', 'revoked')),
  origin                cognition_origin NOT NULL,

  -- Provenance is mandatory. A declaration with no evidence behind it is a
  -- claim AVA made about the user, which is the thing this table forbids.
  evidence_ids          jsonb NOT NULL DEFAULT '[]'::jsonb
                        CHECK (jsonb_array_length(evidence_ids) > 0),

  confirms_hypothesis_id text,
  workstream_id         text REFERENCES workstream(id),
  sensitivity           sensitivity NOT NULL DEFAULT 'normal',
  strength              evidence_strength NOT NULL DEFAULT 'ESTABLISHED',
  created_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (root_id, version)
);
CREATE INDEX declared_cognition_status_idx ON declared_cognition (status, cognition_type);
CREATE INDEX declared_cognition_root_idx   ON declared_cognition (root_id, version);
CREATE INDEX declared_cognition_ws_idx     ON declared_cognition (workstream_id);

-- Raw behavioural observations: the lowest rung of the authority ladder and
-- the only admissible input to a hypothesis.
CREATE TABLE behavioral_observation (
  id                    text PRIMARY KEY,
  description           text NOT NULL,
  context               text NOT NULL,
  evidence_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternatives_available jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_origin        content_origin NOT NULL,
  observed_at           timestamptz NOT NULL,
  workstream_id         text REFERENCES workstream(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX behavioral_observation_ws_idx ON behavioral_observation (workstream_id, observed_at DESC);

-- Behavioral Hypotheses (baseline §20). Shadow mode is a column constraint,
-- not a convention: there is no row that governs anything.
CREATE TABLE behavioral_hypothesis (
  id                     text PRIMARY KEY,
  falsifiable_description text NOT NULL,
  knowledge_origin       text NOT NULL DEFAULT 'observed'
                         CHECK (knowledge_origin = 'observed'),
  context                text NOT NULL,
  scope                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  counter_evidence_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmation_opportunities_observed integer NOT NULL DEFAULT 0,

  -- Mandatory and non-empty (baseline §23): picking the least bad available
  -- option is not a positive preference, and a hypothesis that cannot say
  -- what else was on offer has not observed a choice at all.
  alternatives_available jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_array_length(alternatives_available) > 0),

  possible_confounder    text,
  status                 text NOT NULL DEFAULT 'candidate'
                         CHECK (status IN ('candidate','supported','contradicted','expired','confirmed')),

  -- An unconfirmed hypothesis may never be stronger than SPECULATIVE.
  strength               evidence_strength NOT NULL DEFAULT 'SPECULATIVE'
                         CHECK (strength = 'SPECULATIVE' OR status = 'confirmed'),

  cost_of_misapplication text NOT NULL DEFAULT 'low'
                         CHECK (cost_of_misapplication IN ('low','medium','high')),
  shadow_mode            boolean NOT NULL DEFAULT true CHECK (shadow_mode = true),
  workstream_id          text REFERENCES workstream(id),
  sensitivity            sensitivity NOT NULL DEFAULT 'sensitive',
  confirmed_by_cognition_id text REFERENCES declared_cognition(id),
  rejected_reason        text,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX behavioral_hypothesis_status_idx ON behavioral_hypothesis (status);
CREATE INDEX behavioral_hypothesis_ws_idx     ON behavioral_hypothesis (workstream_id);

-- MemoryRecord (spec §3.11): the query surface over the three classes.
CREATE TABLE memory_record (
  id                     text PRIMARY KEY,
  memory_class           text NOT NULL
                         CHECK (memory_class IN ('episodic','semantic_stabilized','declared_cognition')),
  ref_id                 text NOT NULL,
  ref_type               text NOT NULL
                         CHECK (ref_type IN ('declared_cognition','state_object_version','behavioral_hypothesis','evidence')),
  title                  text NOT NULL,

  -- Level-zero evidence, always non-empty, and the invariant that it resolves.
  derived_from_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_array_length(derived_from_evidence_ids) > 0),
  evidence_reachable     boolean NOT NULL DEFAULT true
                         CHECK (evidence_reachable = true),

  strength               evidence_strength NOT NULL,
  promoted_at            timestamptz,
  promotion_decision_record_id text REFERENCES decision_record(id),
  workstream_id          text REFERENCES workstream(id),
  created_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (memory_class, ref_id)
);
CREATE INDEX memory_record_class_idx ON memory_record (memory_class);
CREATE INDEX memory_record_ws_idx    ON memory_record (workstream_id);

-- Derived views: caches, never sources. `stale` drives rebuild on correction.
CREATE TABLE memory_view (
  id                        text PRIMARY KEY,
  title                     text NOT NULL,
  summary                   text NOT NULL,
  -- Level-zero evidence only. A view of a view flattens to these ids, which
  -- is what stops a summary of a summary from counting as new evidence.
  derived_from_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_origin            content_origin NOT NULL DEFAULT 'system'
                            CHECK (content_origin = 'system'),
  strength                  evidence_strength NOT NULL,
  workstream_id             text REFERENCES workstream(id),
  stale                     boolean NOT NULL DEFAULT false,
  built_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_view_ws_idx ON memory_view (workstream_id, built_at DESC);

-- Conflicts between an observed pattern and an explicit declaration. Recorded
-- rather than resolved: only the user can change a declaration.
CREATE TABLE cognition_conflict (
  id             text PRIMARY KEY,
  hypothesis_id  text NOT NULL REFERENCES behavioral_hypothesis(id),
  cognition_id   text NOT NULL REFERENCES declared_cognition(id),
  detail         text NOT NULL,
  resolved       boolean NOT NULL DEFAULT false,
  detected_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cognition_conflict_open_idx ON cognition_conflict (resolved, detected_at DESC);

-- DecisionRecord gains the cognition it applied, so "why did AVA apply this
-- preference here?" is answerable months later. Additive: existing rows keep
-- their meaning, and an empty array honestly means "no cognition was used".
ALTER TABLE decision_record
  ADD COLUMN declared_cognition_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN hypothesis_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN knowledge_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN cognitive_authority    text,
  ADD COLUMN scope_match            jsonb NOT NULL DEFAULT '{}'::jsonb;
