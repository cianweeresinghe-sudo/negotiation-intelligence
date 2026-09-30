# Contract boundaries

Proposed JSON Schema 2020-12 model-output contracts validate shape, not truth or authorization. Model evidence is source_id plus quote only. App finds a unique exact match and derives start-inclusive/end-exclusive Unicode code-point offsets; reject missing/ambiguous matches. No model offset repair. Persist original page mapping for PDF.

Additional validators enforce ownership, same-case references, revision/material-version pinning, sensitivity inheritance, supported field/value types and per-claim factual coverage. Advice top-level evidence/assertion unions are derived from claims by the app. Every factual statement must link through claims[].output_path; empty references are only allowed for explicitly labelled hypotheses or questions, never sourced factual conclusions. Draft privacy needs complete-workflow evaluation.

CASES.json uses structured unordered expected_candidates and should_be_unknown; see the fixture execution contract in M0_SPECIFICATION.md. Fixtures are oracles, not model executions. Domain tables are specifications, not migrations.
