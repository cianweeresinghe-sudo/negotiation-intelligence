# Negotiation Intelligence

Local synthetic Next.js/TypeScript scaffold with a deterministic mock adapter. It processes only a built-in offer and never calls a model provider. The page shows original source, pending proposal and an empty accepted workbook. It is not a complete M1 workbook or Monday’s complete update-loop demo yet.

## Run locally

Use Node 22 LTS and npm (see `.nvmrc`). No environment variables or model credentials are required.

```sh
npm ci
npm run check
npm run worker:demo
npm run dev
```

Open http://127.0.0.1:3000. For the built application, run `npm run build` then `npm start`. Both servers bind to loopback. The worker command executes the same mock flow once and reports only status, not source/private content. It is an execution harness, not a durable queue.

`npm run check` runs TypeScript checks, the entire package test suite and production build. CI uses the same command with Node 22. Ajv compiles the extraction and advice Draft 2020-12 schemas as part of the tests. Dependencies are recorded in `package-lock.json`; CI uses `npm ci`.

## Boundaries

`src/intelligence/contracts.ts` defines the adapter interface and runtime validators. The mock supports a single built-in synthetic input; it is not a general extractor or fixture-oracle replay. `boundary.ts` keeps source sensitivity private, injects app-owned revision metadata, checks claim paths/references and derives aggregate citation IDs. It creates proposals without accepted-state writes. Model sensitivity hints can only tighten.

The conservative coverage check requires exact claims for every sentence in displayed prose, except questions in the dedicated `decision_changing_question` field. A question mark in rationale, draft or other fields grants no exemption. Explicitly labelled assumptions remain separate. The dedicated question field still requires semantic evaluation to detect factual presuppositions. This is a regression guard, not semantic factuality, privacy or complete claim-coverage assurance. `fixtures/ADVICE_COVERAGE.json` and tests include an unsupported factual sentence and a supported counterpart. Broader intelligence evaluation remains necessary.

No accounts, database, private storage, uploads, review controls, persistence, automated sending, live provider or deployment are implemented in this issue. Those remain separately scoped M1/M2 tasks. Only synthetic data is suitable for this scaffold. Do not paste real offers or credentials into it.

## Specifications

- [Original plan](docs/MVP_BUILD_PLAN_ORIGINAL.md)
- [Accepted M0 revision](docs/M0_SPECIFICATION.md) — owner accepted commit `683d71b`
- [M1 provider comparison](docs/M1_COST_REGION_RETENTION.md)
- [Extraction fixtures](fixtures/CASES.json) — the full fixture runner is a separate quality task
- [Update loop](fixtures/UPDATE_LOOP.json)

## M1 manual workbook (synthetic development)

The `/workbook` route now provides persisted manual cases, entries, corrections and explicit disagreement resolution. All entries default private; AI inferences cannot be saved through the manual-entry endpoint. Accounts and managed authentication are still a live-release gate. The trusted identity seam requires `ALLOW_SYNTHETIC_IDENTITY=1`, a development/test NODE_ENV, and server-configured `DEMO_USER=alice` or `bob`; all other environments are denied. Request headers/body cannot select an owner. The original static mock page is unchanged apart from a workbook link.

Start a local PostgreSQL 17 server/database `workbook_dev`. If Docker is available, this example creates only a named synthetic database and binds to loopback:

```sh
docker run --name negotiation-synthetic-pg -e POSTGRES_PASSWORD=synthetic-local-only -e POSTGRES_DB=workbook_dev -p 127.0.0.1:5432:5432 -d postgres:17
cp .env.example .env.local
npm ci
npm run dev
```

Open http://127.0.0.1:3000/workbook. Create a synthetic case, enter base `50000` with GBP/annual/counterparty claim, then correct to `52000`. Reload or restart the dev server: both values and original evidence remain. To test another owner, stop the server, change DEMO_USER to bob and restart against the same database; Alice's cases are absent. Minimum base requires private/user constraint. Money is stored as decimal text, not float. Text/title/body and total-entry limits are enforced. All SQL input values are parameterized. Run from the repository root so the trusted migration file is available. The Docker command was not executed in this environment (Docker/Postgres binaries absent).

`npm start` is for the static mock scaffold; workbook APIs deliberately refuse the production synthetic identity. Do not bypass that guard to host this build. The local DB URL must point to loopback; live credentials/remote databases are unsupported in this issue.

Migrations are forward-only/checksummed, applied atomically and checked on startup. `workbook_app` is a NOLOGIN role selected inside every app transaction; it has no event UPDATE/DELETE grant. Append-only history and immutable originals have triggers. Case deletion may cascade history after the parent is gone, implementing the future privacy-delete exception rather than an unlimited immutable-history claim. This is not a complete backup/provider deletion policy. RLS is deferred; the query layer enforces owner filters and composite FKs enforce same-case links. Do not treat synthetic identity or shared migration credentials as production auth. Assertion/conflict UPDATE grants allow only lifecycle columns; values, owner and evidence links cannot be rewritten by the app role. Assertions.conflict_group_id is authoritative current membership; resolved members retain the pointer and unchosen claims are superseded rather than retracted. Resolution event references preserve which members were considered. There is no parallel membership table or duplicated event-reference array. Repeatable-read snapshots avoid write locks during reads. Failed initialization closes its pool and clears the cache for retry; unexpected errors log only operation/error class/SQLSTATE.

Tests default to dev-only PGlite (embedded PostgreSQL) because this workspace has no local server. CI uses Node 22 and a PostgreSQL **17** service with the same SQL. Match that major to Supabase when a hosted project is selected. Local SQL checks cover migrations, owner-filtered service operations, constraints, rollback, corrections, conflicts and cascades. Exactly-one-winner concurrency and app-role permission gates run **only on server Postgres**; local skipped tests are not passes. The owner-isolation gate is met only after real server CI succeeds. CI also runs `npm run workbook:smoke`: HTTP create/correct, dev-server restart persistence, forged-owner handling and Bob's 404s. Use TEST_DATABASE_URL only for the dedicated local `workbook_test` database; the test runner never resets or drops an existing schema.

PGlite is injected only by tests and is not in the application runtime. No uploads, extraction proposals, external advice/model processing, durable jobs, export or hosted deployment are added here.

### Forward migrations

The runner discovers numeric `migrations/<version>_<name>.sql` files in version order, checks every applied checksum, and applies pending migrations transactionally under the migration lock. Applied files must remain present and unchanged. Add a higher version; never insert a migration before an applied version. Duplicate versions or malformed filenames fail closed. Runtime-first-request migration remains a local demo shortcut; hosted migrations must run out of band.

### Text-first demo sequence

The remaining M1 file storage and real-model budget controls are deferred for the Monday synthetic demo, following CTO plan review. Next slices are pasted-text sources/persisted jobs, evidence-validated proposals, then atomic review/UI. PDFs/uploads remain unsupported until their parsing/storage acceptance gates ship. This does not complete the original live-alpha M1 scope.

### M2a pasted-text jobs

`POST /api/cases/<id>/imports` accepts `{ "text": "synthetic offer text" }` only; `GET` returns owner-scoped persisted job status. Uploaded files/PDF are unsupported. Originals default private and deduplicate by exact UTF-8 SHA-256 within a case. A job key also includes extractor version. Imports do not change accepted state or revision.

Run `npm run worker:ingestion` with the same local DB and synthetic identity environment as the app. Each invocation claims one persisted job; call again to drain pending jobs. This foundation worker only marks text ready, with no extraction, proposals or model invocation. Complete is a text-foundation status, not extracted/reviewed state. M2b will add validated proposals inside the fenced completion transaction.

Optional environment caps: `INGESTION_TEXT_LIMIT` (default 100000 Unicode code points, maximum 100000), `INGESTION_MAX_ATTEMPTS` (3, maximum 10), `INGESTION_LEASE_MS` (60000, maximum 300000), `INGESTION_TIMEOUT_MS` (30000, maximum 120000). Set the lease above the processing timeout. Invalid settings fail closed. Sources and jobs survive worker failures; failed/expired work retries up to the attempt cap. Late attempts and jobs belonging to deleted cases cannot complete. CI kills a claimed worker, expires its lease in the synthetic test DB, restarts processing and verifies one source/job and no accepted-state changes. This checks crash recovery without a minute-long lease wait.

`INGESTION_CASE_ID` optionally scopes a worker invocation to a case while retaining the trusted owner filter. Timeout must be strictly below lease; the worker validates this before claiming. Whitespace-only input is rejected without trimming stored originals.

Pasted sources are capped per case at 20 and 2 MiB total UTF-8 bytes (`INGESTION_SOURCE_LIMIT`, `INGESTION_BYTE_LIMIT`); job versions are capped at 60 per case. Duplicate access remains available at the cap. NUL is rejected with 422. The import JSON transport cap is 1.3 MB to admit 100000 astral characters even as escaped surrogate pairs. Per-owner aggregate storage and active-worker caps remain live-alpha gates.

### M2b validated pending proposals

`GET /api/cases/<id>/proposals` returns owner-scoped pending candidates and their literal evidence. No accept/reject or review UI is implemented in this slice. Import with `INGESTION_EXTRACTOR_VERSION=proposals-mock-v1`, then run `npm run worker:proposals` with the same synthetic owner/local DB. The deterministic mock recognises the documented GBP annual amount format only; it is not a real model. Existing text-foundation jobs remain distinct by version.

`validateCandidates(raw, source)` is a direct fixture-runner seam in `src/proposals/validate.ts`. `ExtractionAdapter` takes a readonly source payload and abort signal only, with no accepted/other-case context or tool capability. The response cap is 128 KiB, at most 30 candidates, at most five quotes per candidate (2000 characters each), bounded plain advisory strings and strict unknown-key/control-character rejection. Source/contract failures fail the batch; candidate quote/field/value failures drop individually and persist safe counts. No raw model output is stored.

Evidence offsets are Unicode code points. Financial candidates require matching amount, explicit currency and period in a supporting quote; unsupported deadline normalisation is dropped. Source privacy cannot be loosened by output. Imported private minimums require explicit user entry/review authority and are dropped as `constraint_requires_user` in this slice, never inferred into constraints. Current allowlisted fields remain base/minimum_base/deadline/objective/alternative/note; broader CASES.json expectations are unsupported pending the separately reviewed field-registry slice. Do not claim all 22 fixtures pass.

Fenced completion locks the owned case and job, inserts evidence/pending proposals, increments material_version once and completes the job atomically. Accepted revision/assertions/history remain unchanged. Per-case caps are 200 proposals and 1000 evidence rows; caps include all historical rows. Job/candidate index uniqueness and proposal-only review-column grants prevent duplicate/repointed candidates. Target-field active IDs are stored for later review staleness; global base_revision is provenance only.

M2c will reuse paste evidence, require explicit classification edits, compare target IDs under the case lock, check client expectedRevision and provide review UI. Sequential acceptance/review/replay gates have not run here. Real adapters, PDFs and live-data controls remain gated.

Validator follow-up: monetary period must follow its own amount in the same clause (within 40 characters, before another amount), text values must appear literally in a quote, and deadline values must be a date-shaped literal or supported ISO normalisation. Identical candidates deduplicate with a safe count. These are conservative lexical checks, not semantic truth/hedge assurance. Multi-amount and uncertainty interpretation still require labelled human evaluation. Newlines/CR/tabs are permitted in model text for real email quotes; NUL and other controls remain forbidden. Terminal validation/limit failures are not auto-retried. Final review decisions cannot transition again under the database trigger. An equal-value active assertion is currently an add proposal with its existing target IDs; M2c must label/handle it as confirmation or duplicate instead of inserting another uncontested field.

### Synthetic import and review (M2c)

Open `/workbook`, create a case, and paste `£52,000 annually`. **Import and extract** runs the deterministic source-only mock and shows a pending proposal with its exact quote. Review its classification and accept, edit or reject. No real model is called. The mock recognises literal GBP amounts followed by `annually`, `annual` or `per year`; it does not yet extract all six domain fields.

When a field already exists, choose correction or disagreement explicitly. Equal values default to **Dismiss duplicate**; replacing their source is a separate explicit choice that shows classification changes. Acceptance preserves private sensitivity, revalidates edited values against the quote, links the original paste evidence, and records edits without rewriting the candidate. Stale requests retain the form values; review changed targets before retrying.

Decided proposals no longer consume the pending-proposal allocation. Historical originals and evidence remain preserved. Source and job limits still apply (20 pasted sources, 60 jobs per case); a case eventually needs a new case when its job allocation is exhausted. This remains a local synthetic demo, with the live-release gates unchanged.

The advisory escaping check uses server-rendered component markup, not a browser. Full visual acceptance must be reported separately. Server-Postgres CI includes the same-proposal writer race and real HTTP checks for import, edit, accept, reject, replay and foreign-owner mutations.

An accepted assertion links the proposal's first evidence row; additional quotes remain reachable through the retained proposal and its accepted-assertion link. The import handler executes the mock synchronously for this demo. A real adapter must execute in a background worker with the provider, consent, budget and abort gates satisfied.

CI now runs a headless Chromium walkthrough against the real Postgres-backed dev server and uploads `m2c-browser-walkthrough` screenshots. It creates a synthetic case, imports text, checks the pending quote and stored advisory text, accepts, and checks the accepted view. This is a functional browser check; screenshot appearance should be inspected before claiming visual acceptance.

### Fixture runner

`npm run fixtures:run` replays `fixtures/CASES.json` through the extraction validator and the deterministic mock extractor and prints a per-case table with drop reason codes. Statuses are `pass`, `fail` and `unsupported_field`. "Validator replay" feeds each expected candidate back as model output, so it shows the fixture is acceptable to the validator, not that an extractor would find it. The mock column is the only extraction-accuracy signal, and the mock is a regex parser, not a model. Unknowns, conflict fields, forbidden draft values and state effects are not scored yet. `tests/fixtures.test.ts` pins the current per-case baseline, so any change in it is deliberate.

The synthetic offer parser declines paragraphs containing listed first-person or private-position markers and requires a counterparty cue. Blank lines separate paragraphs; a label and amount on adjacent lines stay together. It deliberately declines legitimate phrases such as “Offer for my role” or “Minimum guaranteed base”; use manual entry if no terms are found. A separate offer paragraph without these markers can still be extracted. This demo safeguard cannot establish whose amount a passage represents and makes no claim about real-model behaviour.

Working synthetic paste sample: `Offer: GBP 52,000 annually`. The paste-box placeholder and walkthroughs use this supported format. Known gap: `Offer letter attached.\nTarget: GBP 48,000 annually (don't mention).` still yields base 48000 because the privacy wording is not one of the markers. Keep synthetic demo wording plain and review each quote; do not treat this parser as an authority detector.

The mock also declines range/hedge paragraphs rather than selecting a bound. It cannot tell whose number is whose: check the quote before accepting and use plain wording. General validator handling of ranged/hedged amounts remains a real-adapter gate.

The mock declines paragraphs longer than 4,000 characters before amount matching. ISO and named calendar dates are masked for range/hedge detection, so a supported offer can include a dated deadline. It still extracts only base in the synthetic format; enter other fields manually.
