CREATE TABLE advice_records (
 id uuid PRIMARY KEY,case_id uuid NOT NULL,owner_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>=0),material_version integer NOT NULL CHECK(material_version>=0),
 include_private_constraints boolean NOT NULL,
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 adapter_version text NOT NULL CHECK(adapter_version ~ '^[a-zA-Z0-9._-]{1,80}$'),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=262144),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=1048576),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,case_id,owner_id),UNIQUE(case_id,revision,material_version,adapter_version),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE advice_citations (
 id uuid PRIMARY KEY,advice_id uuid NOT NULL,case_id uuid NOT NULL,owner_id uuid NOT NULL,
 claim_index integer NOT NULL CHECK(claim_index BETWEEN 0 AND 99),assertion_id uuid,evidence_id uuid,
 CHECK((assertion_id IS NOT NULL)<>(evidence_id IS NOT NULL)),
 UNIQUE NULLS NOT DISTINCT(advice_id,claim_index,assertion_id,evidence_id),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(advice_id,case_id,owner_id) REFERENCES advice_records(id,case_id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(assertion_id,case_id) REFERENCES assertions(id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(evidence_id,case_id) REFERENCES evidence(id,case_id) ON DELETE CASCADE
);
CREATE FUNCTION protect_advice_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM cases WHERE id=OLD.case_id AND owner_id=OLD.owner_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'advice history is append-only';
END $$;
CREATE TRIGGER immutable_advice BEFORE UPDATE OR DELETE ON advice_records FOR EACH ROW EXECUTE FUNCTION protect_advice_history();
CREATE TRIGGER immutable_advice_citations BEFORE UPDATE OR DELETE ON advice_citations FOR EACH ROW EXECUTE FUNCTION protect_advice_history();
GRANT SELECT,INSERT ON advice_records,advice_citations TO workbook_app;
-- Model visibility is separate from outbound quoting sensitivity.
ALTER TABLE cases ADD COLUMN include_private_constraints boolean NOT NULL DEFAULT false;
