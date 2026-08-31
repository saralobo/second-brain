-- 0007_opportunity_and_checkpoint — Slice 5
--
-- The Implementation Plan numbers this migration `0006` under S5-T01. That
-- number was taken by the Slice 4 cognition tables (itself deviation D-11), so
-- this is `0007`; the content is unchanged. Recorded as deviation D-17.

-- The checkpoint gives "since the last checkpoint" an exact operational
-- meaning (spec §2.1). V0 closes checkpoints manually and on purpose: the
-- right cadence is an open question the prospective data must answer, and
-- guessing it here would bake an unvalidated assumption into the product.
CREATE TABLE checkpoint (
  id             text PRIMARY KEY,
  workstream_id  text NOT NULL REFERENCES workstream(id),
  opened_at      timestamptz NOT NULL,
  closed_at      timestamptz,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE INDEX checkpoint_ws_idx ON checkpoint (workstream_id, opened_at DESC);

-- Opportunity (spec §3.8). A PROPOSAL of attention backed by evidence — never
-- a fact. Only the five V0 classes exist, and the enum is what keeps a sixth
-- from being added as an implementation detail.
CREATE TYPE opportunity_class AS ENUM (
  'unpropagated_decision', 'upcoming_commitment', 'invalidated_work',
  'unresolved_question', 'closing_risk'
);

CREATE TABLE opportunity (
  id                text PRIMARY KEY,

  -- Identity is the underlying CONDITION, not the run that noticed it. The
  -- same unresolved condition seen at two checkpoints is one opportunity.
  identity_key      text NOT NULL,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes_id     text REFERENCES opportunity(id),

  opportunity_class opportunity_class NOT NULL,
  workstream_id     text NOT NULL REFERENCES workstream(id),

  status            text NOT NULL DEFAULT 'candidate'
                    CHECK (status IN ('candidate','eligible','shown','prepared',
                                      'suppressed','superseded','expired')),

  headline          text NOT NULL,
  detail            text NOT NULL,
  minimal_action    text,

  strength          evidence_strength NOT NULL,
  context_health    text NOT NULL CHECK (context_health IN ('HEALTHY','DEGRADED','INSUFFICIENT')),

  -- An opportunity is AVA's own output. It can never corroborate the evidence
  -- it came from, and this constraint is what stops that loop from opening.
  content_origin    content_origin NOT NULL DEFAULT 'system'
                    CHECK (content_origin = 'system'),

  suppressed_reason text,
  expires_at        timestamptz,
  shown_at          timestamptz,
  prepared_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (identity_key, version)
);
CREATE INDEX opportunity_ws_idx       ON opportunity (workstream_id, status);
CREATE INDEX opportunity_identity_idx ON opportunity (identity_key, version DESC);

-- Everything AVA could see AT GENERATION TIME, written once and never
-- rewritten. This table is the anti-retroactivity invariant (spec §21): an
-- inspection months from now shows the context that actually produced the
-- opportunity, not today's better-informed reconstruction of it.
--
-- Note the absence of any aggregate column. There is no `score`, no
-- `confidence`, no `priority` number: the Value Vector is stored whole, and a
-- policy reads factors, never a total.
CREATE TABLE opportunity_generation (
  id                      text PRIMARY KEY,
  opportunity_id          text NOT NULL UNIQUE REFERENCES opportunity(id),
  checkpoint_id           text REFERENCES checkpoint(id),
  generated_at            timestamptz NOT NULL,

  rule_id                 text NOT NULL,
  rule_version            text NOT NULL,
  policy_version          text NOT NULL,

  trigger_change_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Grounding is not optional. An opportunity with no evidence behind it is a
  -- guess dressed as an observation.
  origin_evidence_ids     jsonb NOT NULL DEFAULT '[]'::jsonb
                          CHECK (jsonb_array_length(origin_evidence_ids) > 0),

  affected_objects        jsonb NOT NULL DEFAULT '[]'::jsonb,
  value_vector            jsonb NOT NULL,
  gates                   jsonb NOT NULL,
  investigate             jsonb NOT NULL,
  show                    jsonb NOT NULL,
  prepare                 jsonb NOT NULL,

  known_evidence_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  known_state_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  latest_evidence_observed_at timestamptz,

  /* Hypotheses relevant to the context, kept for display only. No policy
     reads this column. */
  shadow_hypothesis_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_record_ids     jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE RULE opportunity_generation_no_update AS ON UPDATE TO opportunity_generation DO INSTEAD NOTHING;
CREATE RULE opportunity_generation_no_delete AS ON DELETE TO opportunity_generation DO INSTEAD NOTHING;

-- Something AVA prepared before being asked. Internal to AVA: preparation
-- never sends a message, edits a document or touches an external service.
CREATE TABLE prepared_artifact (
  id                text PRIMARY KEY,
  opportunity_id    text NOT NULL REFERENCES opportunity(id),
  kind              text NOT NULL,
  title             text NOT NULL,
  body              text NOT NULL,

  -- Prepared work is system-origin, so it cannot become evidence for the very
  -- opportunity that produced it.
  content_origin    content_origin NOT NULL DEFAULT 'system'
                    CHECK (content_origin = 'system'),

  execution_mode    text NOT NULL CHECK (execution_mode IN ('mock','external','local_only')),
  model_run_id      text REFERENCES model_run(id),
  estimated_cost_usd numeric(12,6),
  actual_cost_usd    numeric(12,6),
  status            text NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','discarded','expired')),
  prepared_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prepared_artifact_opp_idx ON prepared_artifact (opportunity_id);
