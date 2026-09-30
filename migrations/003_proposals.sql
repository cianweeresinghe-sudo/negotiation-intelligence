ALTER TABLE ingestion_jobs DROP CONSTRAINT ingestion_jobs_error_code_check;
ALTER TABLE ingestion_jobs ADD CHECK(error_code IN ('processing_failed','timeout','attempts_exhausted','invalid_response','wrong_source'));
ALTER TABLE ingestion_jobs ADD COLUMN proposal_count integer NOT NULL DEFAULT 0 CHECK(proposal_count BETWEEN 0 AND 30);
ALTER TABLE ingestion_jobs ADD COLUMN drop_counts jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ingestion_jobs ADD COLUMN advisory_unknowns jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ingestion_jobs ADD COLUMN advisory_conflicts jsonb NOT NULL DEFAULT '[]';
GRANT UPDATE(proposal_count,drop_counts,advisory_unknowns,advisory_conflicts) ON ingestion_jobs TO workbook_app;
ALTER TABLE ingestion_jobs ADD UNIQUE(id,source_id,case_id);
CREATE TABLE proposals (
 id uuid PRIMARY KEY,case_id uuid NOT NULL,owner_id uuid NOT NULL,job_id uuid NOT NULL,source_id uuid NOT NULL,
 candidate_index integer NOT NULL CHECK(candidate_index BETWEEN 0 AND 29),candidate jsonb NOT NULL,
 operation text NOT NULL DEFAULT 'add' CHECK(operation IN ('add','correct','conflict')),
 base_revision integer NOT NULL CHECK(base_revision>=0),target_assertion_ids jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 decision jsonb,accepted_assertion_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,case_id),UNIQUE(id,source_id,case_id),UNIQUE(job_id,candidate_index),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(job_id,source_id,case_id) REFERENCES ingestion_jobs(id,source_id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,case_id) REFERENCES sources(id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(accepted_assertion_id,case_id) REFERENCES assertions(id,case_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE proposal_evidence (
 proposal_id uuid NOT NULL,evidence_id uuid NOT NULL,source_id uuid NOT NULL,case_id uuid NOT NULL,owner_id uuid NOT NULL,
 PRIMARY KEY(proposal_id,evidence_id),
 FOREIGN KEY(case_id,owner_id) REFERENCES cases(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(proposal_id,source_id,case_id) REFERENCES proposals(id,source_id,case_id) ON DELETE CASCADE,
 FOREIGN KEY(evidence_id,source_id,case_id) REFERENCES evidence(id,source_id,case_id) ON DELETE CASCADE
);
GRANT SELECT,INSERT ON proposals,proposal_evidence TO workbook_app;
GRANT UPDATE(status,decision,accepted_assertion_id) ON proposals TO workbook_app;
