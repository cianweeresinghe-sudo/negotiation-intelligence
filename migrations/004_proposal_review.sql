ALTER TABLE events DROP CONSTRAINT events_reason_check;
ALTER TABLE events ADD CHECK(reason IN ('manual_entry','user_correction','user_resolution','case_created','case_updated','proposal_accepted','proposal_edited','proposal_confirmed'));
-- Re-review snapshots and candidate originals remain immutable. Decisions
-- contain the explicit user acknowledgement and edits, not overwritten hints.

ALTER TABLE events ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object');
