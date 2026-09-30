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
