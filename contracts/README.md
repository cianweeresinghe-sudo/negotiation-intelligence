# Contract boundaries

These are proposed JSON Schema 2020-12 model-output contracts. They validate shape, not truth, privacy or authorization. Production app validators must additionally enforce ownership, same-case references, exact spans (start inclusive/end exclusive), end > start, source IDs matching the job, revision pinning and supported field/value types from the domain schema. Empty evidence is permitted for an advice action that asks for missing information; it never makes an unsupported factual statement valid. Human review and disclosure evaluation remain required.

The domain table is a specification, not a finished database migration. Fixtures are labelled behavior expectations, not claimed model executions.
