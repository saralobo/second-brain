-- 0008_feedback_and_outcome — Slice 6
--
-- The Implementation Plan numbers this migration `0007` under S6-T01. That
-- number was taken by the Slice 5 opportunity tables (itself deviation D-17),
-- so this is `0008`; the content is unchanged. Recorded as deviation D-21.

-- The object an opportunity was raised ABOUT. Slice 5 carried this in memory
-- and dropped it on read, which left the intervention timeline unable to find
-- the change events belonging to that object (finding F-11).
ALTER TABLE opportunity ADD COLUMN impacted_from text;

CREATE TYPE epistemic_verdict AS ENUM (
  'correct', 'partially_correct', 'incorrect', 'not_verifiable'
);

CREATE TYPE delivery_verdict AS ENUM (
  'valuable', 'already_known', 'irrelevant', 'too_early', 'too_late'
);

CREATE TYPE artifact_verdict AS ENUM (
  'used_as_is', 'used_after_edit', 'not_used', 'not_shown', 'expired', 'replaced'
);

CREATE TYPE outcome_state AS ENUM ('resolved', 'unresolved', 'expired', 'ambiguous');

-- Feedback (spec §3.12). Three independent, independently nullable columns.
--
-- There is deliberately NO aggregate column. No score, no reward, no rating.
-- "Was AVA right?" and "did this deserve my attention?" have different answers
-- — correct and already_known is a real and common combination — and a single
-- number would erase precisely the distinction validation depends on.
--
-- A NULL means NOT PROVIDED. It is not a negative and must never be counted
-- as one.
CREATE TABLE feedback (
  id                  text PRIMARY KEY,

  -- Feedback always points at something. There is no untargeted row.
  target_type         text NOT NULL
                      CHECK (target_type IN ('opportunity','grounded_answer','prepared_artifact')),
  target_id           text NOT NULL,

  opportunity_id      text REFERENCES opportunity(id),
  -- REFERENCED, never edited. The DecisionRecord recorded what AVA knew when
  -- it decided; writing today's feedback into it would claim AVA had the
  -- user's judgement before the user gave it.
  decision_record_id  text REFERENCES decision_record(id),

  epistemic           epistemic_verdict,
  delivery            delivery_verdict,
  artifact_feedback   artifact_verdict,

  -- May contain personal notes. Stays local; nothing on this table is sent to
  -- an external provider.
  reason              text,
  sensitivity         sensitivity NOT NULL DEFAULT 'sensitive',

  given_at            timestamptz NOT NULL,
  corrects_feedback_id text REFERENCES feedback(id),
  superseded_by       text REFERENCES feedback(id),
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- A row that says nothing is not feedback.
  CHECK (epistemic IS NOT NULL OR delivery IS NOT NULL OR artifact_feedback IS NOT NULL)
);
CREATE INDEX feedback_target_idx ON feedback (target_type, target_id, given_at DESC);
CREATE INDEX feedback_opp_idx    ON feedback (opportunity_id, given_at DESC);

-- Append-only. A correction writes a new row and points at the one it
-- corrects, so "what did I think at t1?" survives changing your mind at t2.
CREATE RULE feedback_no_delete AS ON DELETE TO feedback DO INSTEAD NOTHING;

-- What the user DID. Separate from what they thought: believing an item was
-- valuable and acting on it are different observations, and neither is
-- evidence for the other.
--
-- `unknown` is a first-class kind. When an action is not observable, that is
-- what gets recorded — nothing here is inferred from absence.
CREATE TABLE user_action (
  id                  text PRIMARY KEY,
  opportunity_id      text NOT NULL REFERENCES opportunity(id),
  kind                text NOT NULL
                      CHECK (kind IN ('reviewed','updated_artifact','made_decision',
                                      'dismissed','other','unknown')),
  description         text,
  -- When it happened, as reported by the user. Never the write time.
  acted_at            timestamptz NOT NULL,
  related_object_id   text,
  related_artifact_id text REFERENCES prepared_artifact(id),
  recorded_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_action_opp_idx ON user_action (opportunity_id, acted_at);
CREATE RULE user_action_no_update AS ON UPDATE TO user_action DO INSTEAD NOTHING;
CREATE RULE user_action_no_delete AS ON DELETE TO user_action DO INSTEAD NOTHING;

-- Outcome Resolution (spec §3.13, §16.2).
--
-- `unresolved` and `ambiguous` are legitimate END STATES, not placeholders to
-- be tidied away. Silence is never resolution: a user who said nothing has not
-- told us the intervention worked, failed or was rejected.
CREATE TABLE outcome (
  id                  text PRIMARY KEY,
  opportunity_id      text REFERENCES opportunity(id),
  decision_record_id  text REFERENCES decision_record(id),

  state               outcome_state NOT NULL,
  resolved_by         text NOT NULL CHECK (resolved_by IN ('deterministic_event','explicit_review')),

  -- Only `resolved` has a resolution time. The others genuinely have none,
  -- and a timestamp on them would imply a closure that never happened.
  resolved_at         timestamptz,
  CHECK ((state = 'resolved') = (resolved_at IS NOT NULL)),

  evidence_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  note                text,
  recorded_at         timestamptz NOT NULL,

  supersedes_outcome_id text REFERENCES outcome(id),
  superseded_by         text REFERENCES outcome(id),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CHECK (opportunity_id IS NOT NULL OR decision_record_id IS NOT NULL)
);
CREATE INDEX outcome_opp_idx ON outcome (opportunity_id, recorded_at DESC);
CREATE RULE outcome_no_delete AS ON DELETE TO outcome DO INSTEAD NOTHING;
