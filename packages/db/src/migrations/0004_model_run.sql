-- 0004_model_run — Slice 3 provider gate
--
-- ModelRun exists before the provider boundary can be opened: ADR-21 Gate A
-- requires every external call to be accounted for, and a record written only
-- after success would lose exactly the failures that Gate B will need.
--
-- Scope note: the Implementation Plan bundles context_health, decision_record
-- and model_run into migration 0004 under S3-T01. Only model_run is required
-- to close the provider gate, so it ships alone here; the other two remain
-- part of S3-T01 and will land in a later migration.

CREATE TABLE model_run (
  id                     text PRIMARY KEY,

  -- who answered
  provider               text NOT NULL,
  model                  text NOT NULL,
  model_identifier       text,            -- resolved id/version reported by the provider

  -- what was asked
  archetype              text NOT NULL,
  purpose                text NOT NULL,
  prompt_id              text NOT NULL,
  prompt_version         text NOT NULL,

  -- what crossed the boundary
  evidence_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity_summary    jsonb NOT NULL DEFAULT '{}'::jsonb,
  redaction_applied      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- timing
  request_started_at     timestamptz NOT NULL,
  response_completed_at  timestamptz,
  latency_ms             integer,

  -- accounting. NULL means unknown, which is not the same as zero:
  -- a provider that reports no usage on failure must not be recorded as free.
  input_tokens           integer,
  output_tokens          integer,
  estimated_cost_usd     numeric(12, 6),
  actual_cost_usd        numeric(12, 6),
  price_table_version    text,

  -- outcome
  status                 text NOT NULL CHECK (status IN ('PENDING','COMPLETE','FAILED','DENIED','ABORTED')),
  retry_count            integer NOT NULL DEFAULT 0,
  error_kind             text,
  error_detail           text,            -- never carries payload content
  fallback_used          boolean NOT NULL DEFAULT false,
  denial_reason          text,

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX model_run_status_idx    ON model_run (status);
CREATE INDEX model_run_archetype_idx ON model_run (archetype, request_started_at DESC);
CREATE INDEX model_run_started_idx   ON model_run (request_started_at);

-- Cost aggregation for the Budget Controller reads only settled spend.
CREATE INDEX model_run_cost_idx ON model_run (request_started_at)
  WHERE status IN ('COMPLETE', 'FAILED');
