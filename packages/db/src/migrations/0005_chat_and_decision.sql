-- 0005_chat_and_decision — Slice 3
--
-- Completes S3-T01. Migration 0004 shipped `model_run` alone because it was
-- the only table the provider gate needed; `context_health` and
-- `decision_record` land here, together with the conversation tables the chat
-- surface requires.

-- A computed health assessment, kept because "why did AVA abstain?" must be
-- answerable months later, and because Slice 7 audits whether health actually
-- changed behaviour or was merely displayed.
CREATE TABLE context_health (
  id             text PRIMARY KEY,
  task           text NOT NULL,           -- the task health was computed FOR
  workstream_id  text REFERENCES workstream(id),
  state          text NOT NULL CHECK (state IN ('HEALTHY','DEGRADED','INSUFFICIENT')),
  decided_by     text,                    -- dimension that set the aggregate
  dimensions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps           jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX context_health_workstream_idx ON context_health (workstream_id, computed_at DESC);
CREATE INDEX context_health_state_idx      ON context_health (state);

-- DecisionRecord (spec §14.2). Written for decisions where evidence or model
-- selection was material — never for trivial CRUD, which would turn the
-- record into noise and destroy its audit value.
CREATE TABLE decision_record (
  id                    text PRIMARY KEY,
  kind                  text NOT NULL,
  workstream_id         text REFERENCES workstream(id),

  -- what was asked
  request               text NOT NULL,
  query_kind            text NOT NULL,

  -- what was considered
  retrieval_result_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_packet        jsonb NOT NULL DEFAULT '{}'::jsonb,
  packet_evidence_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded_evidence     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- under what conditions
  context_health_id     text REFERENCES context_health(id),
  context_health_state  text,

  -- who answered, and how
  provider              text,
  model                 text,
  prompt_id             text,
  prompt_version        text,
  model_run_id          text REFERENCES model_run(id),
  execution_mode        text NOT NULL CHECK (execution_mode IN ('mock','external','local_only')),

  -- what came back
  grounding_valid       boolean,
  grounding_failures    jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer                text,
  answer_evidence_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  uncertainties         jsonb NOT NULL DEFAULT '[]'::jsonb,
  abstained             boolean NOT NULL DEFAULT false,
  abstention_reason     text,
  fallback_used         boolean NOT NULL DEFAULT false,
  error_detail          text,

  decided_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_record_workstream_idx ON decision_record (workstream_id, decided_at DESC);
CREATE INDEX decision_record_kind_idx       ON decision_record (kind);

-- A DecisionRecord justifies a decision that was already taken. Rewriting one
-- afterwards would manufacture a rationale that never existed.
CREATE RULE decision_record_no_update AS ON UPDATE TO decision_record DO INSTEAD NOTHING;
CREATE RULE decision_record_no_delete AS ON DELETE TO decision_record DO INSTEAD NOTHING;

CREATE TABLE conversation (
  id            text PRIMARY KEY,
  workstream_id text NOT NULL REFERENCES workstream(id),
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_workstream_idx ON conversation (workstream_id, created_at DESC);

CREATE TABLE chat_message (
  id                 text PRIMARY KEY,
  conversation_id    text NOT NULL REFERENCES conversation(id),
  role               text NOT NULL CHECK (role IN ('user','ava')),
  body               text NOT NULL,
  -- AVA's turns point at the record that explains them. A turn with no
  -- decision record cannot be explained, and the UI says so rather than
  -- inventing a rationale.
  decision_record_id text REFERENCES decision_record(id),
  abstained          boolean NOT NULL DEFAULT false,
  context_health     text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_message_conversation_idx ON chat_message (conversation_id, created_at);
