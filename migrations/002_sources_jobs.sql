ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CHECK(kind IN ('manual','paste'));
ALTER TABLE sources DROP CONSTRAINT sources_original_text_check;
ALTER TABLE sources ADD CHECK(char_length(original_text) <= 100000);
CREATE UNIQUE INDEX unique_pasted_source ON sources(case_id,checksum) WHERE kind='paste';
CREATE TABLE ingestion_jobs (
 id uuid PRIMARY KEY,case_id uuid NOT NULL,owner_id uuid NOT NULL,source_id uuid NOT NULL,
 idempotency_key text NOT NULL,extractor_version text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','failed','complete')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),lease_expires_at timestamptz,
 error_code text CHECK(error_code IN ('processing_failed','timeout','attempts_exhausted')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,case_id),UNIQUE(case_id,idempotency_key),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,case_id) REFERENCES sources(id,case_id) ON DELETE CASCADE,
 CHECK((status='running')=(lease_expires_at IS NOT NULL))
);
GRANT SELECT,INSERT ON ingestion_jobs TO workbook_app;
GRANT UPDATE(status,attempt,lease_expires_at,error_code,updated_at) ON ingestion_jobs TO workbook_app;
