CREATE TABLE owners (id uuid PRIMARY KEY);
CREATE TABLE cases (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id), title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')), revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
 material_version integer NOT NULL DEFAULT 0 CHECK(material_version >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id, owner_id)
);
CREATE TABLE sources (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, owner_id uuid NOT NULL, kind text NOT NULL CHECK(kind='manual'),
 original_text text NOT NULL CHECK(char_length(original_text) <= 10000), checksum text NOT NULL,
 sensitivity text NOT NULL CHECK(sensitivity IN ('private','shareable')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id, case_id), FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE evidence (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, owner_id uuid NOT NULL, source_id uuid NOT NULL,
 quote text NOT NULL, start_offset integer NOT NULL CHECK(start_offset >= 0), end_offset integer NOT NULL CHECK(end_offset > start_offset),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,case_id), UNIQUE(id,source_id,case_id),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,case_id) REFERENCES sources(id,case_id) ON DELETE CASCADE
);
CREATE TABLE events (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, owner_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES owners(id),
 revision integer NOT NULL, operation text NOT NULL, reason text NOT NULL CHECK(reason IN ('manual_entry','user_correction','user_resolution','case_created','case_updated')),
 before_ids uuid[] NOT NULL DEFAULT '{}', after_ids uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,case_id), FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE conflicts (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, owner_id uuid NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 resolution_event_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,case_id),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(resolution_event_id,case_id) REFERENCES events(id,case_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE assertions (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, owner_id uuid NOT NULL, field text NOT NULL, value jsonb NOT NULL,
 currency text CHECK(currency ~ '^[A-Z]{3}$'), period text CHECK(period IN ('annual','monthly','one_time')),
 epistemic_type text NOT NULL CHECK(epistemic_type IN ('documented_observation','counterparty_claim','user_assumption','user_constraint','ai_inference')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','retracted')), verification_status text NOT NULL DEFAULT 'user_entered',
 sensitivity text NOT NULL CHECK(sensitivity IN ('private','shareable')), outbound_quote_allowed boolean NOT NULL DEFAULT false,
 source_id uuid NOT NULL, evidence_id uuid NOT NULL, supersedes_id uuid, conflict_group_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,case_id),
 CHECK(NOT outbound_quote_allowed OR sensitivity='shareable'),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,case_id) REFERENCES sources(id,case_id), FOREIGN KEY(evidence_id,source_id,case_id) REFERENCES evidence(id,source_id,case_id),
 FOREIGN KEY(supersedes_id,case_id) REFERENCES assertions(id,case_id), FOREIGN KEY(conflict_group_id,case_id) REFERENCES conflicts(id,case_id)
);
CREATE UNIQUE INDEX one_uncontested_active_field ON assertions(case_id,field) WHERE status='active' AND conflict_group_id IS NULL;
-- Any UPDATE is forbidden. A parent case cascade is the only permitted DELETE.
CREATE FUNCTION protect_event_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM cases WHERE id=OLD.case_id AND owner_id=OLD.owner_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'event history is append-only';
END $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE FUNCTION protect_source_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'original source is immutable'; END $$;
CREATE TRIGGER immutable_sources BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION protect_source_original();
CREATE TABLE conflict_members (
 conflict_id uuid NOT NULL, assertion_id uuid NOT NULL, case_id uuid NOT NULL, owner_id uuid NOT NULL,
 PRIMARY KEY(conflict_id,assertion_id),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(conflict_id,case_id) REFERENCES conflicts(id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(assertion_id,case_id) REFERENCES assertions(id,case_id) ON DELETE CASCADE
);
ALTER TABLE events ADD CHECK(actor_id=owner_id);
CREATE TABLE event_assertion_refs (
 event_id uuid NOT NULL, assertion_id uuid NOT NULL, case_id uuid NOT NULL, owner_id uuid NOT NULL, direction text NOT NULL CHECK(direction IN ('before','after')),
 PRIMARY KEY(event_id,assertion_id,direction), FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(event_id,case_id) REFERENCES events(id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(assertion_id,case_id) REFERENCES assertions(id,case_id) ON DELETE CASCADE
);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='workbook_app') THEN CREATE ROLE workbook_app NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO workbook_app;
GRANT SELECT,INSERT ON owners,sources,evidence,events,conflict_members,event_assertion_refs TO workbook_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON cases TO workbook_app;
GRANT SELECT,INSERT,UPDATE ON assertions,conflicts TO workbook_app;
