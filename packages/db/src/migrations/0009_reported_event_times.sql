-- 0009_reported_event_times — Slice 7
--
-- Finding F-16, from the prospective validation audit.
--
-- `validation_event` carried one anti-retroactivity rule for every event:
-- `occurred_at >= created_at - 60 seconds`. That rule is right for events the
-- machine observes about itself, and wrong for events the USER reports about
-- the world.
--
-- The table's own comment says occurred_at is "the real instant of the event,
-- never the write time". A person capturing yesterday's decision is stating a
-- real instant from yesterday. The 60-second rule refused it, which left only
-- two options: lose the event, or record it at the write time. The second is
-- what actually happened, and it made `change_detectable_at` equal to the
-- moment of typing — so detection latency was identically zero and
-- anticipation was unmeasurable by construction.
--
-- The fix is not to loosen the rule. It is to record WHOSE CLOCK produced the
-- timestamp, and keep the strict rule where it belongs.
--
--   system_clock — AVA observed this herself. It cannot be backdated: doing so
--                  would fabricate the machine's own history.
--   reported     — a person stated when this happened. It may precede the
--                  write, and it is marked as an assertion rather than an
--                  observation, so no analysis can mistake one for the other.
--
-- Neither kind may be dated in the future, and the table stays append-only.

CREATE TYPE event_time_basis AS ENUM ('system_clock', 'reported');

ALTER TABLE validation_event
  ADD COLUMN time_basis event_time_basis NOT NULL DEFAULT 'system_clock';

ALTER TABLE validation_event DROP CONSTRAINT validation_event_not_retroactive;

-- A machine-observed event still cannot be backdated.
ALTER TABLE validation_event
  ADD CONSTRAINT validation_event_system_clock_not_retroactive
  CHECK (time_basis <> 'system_clock' OR occurred_at >= created_at - interval '60 seconds');

-- A reported event may precede its write, and must say so. What it may never
-- do is claim a future instant — that constraint already exists and is kept
-- for both kinds.
