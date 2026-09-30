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

The conservative coverage check requires exact claims for declarative sentences in displayed prose. Questions and explicitly labelled assumptions are not considered sourced statements by this scaffold check. This is a regression guard, not semantic factuality, privacy or complete claim-coverage assurance. `fixtures/ADVICE_COVERAGE.json` and tests include an unsupported factual sentence and a supported counterpart. Broader intelligence evaluation remains necessary.

No accounts, database, private storage, uploads, review controls, persistence, automated sending, live provider or deployment are implemented in this issue. Those remain separately scoped M1/M2 tasks. Only synthetic data is suitable for this scaffold. Do not paste real offers or credentials into it.

## Specifications

- [Original plan](docs/MVP_BUILD_PLAN_ORIGINAL.md)
- [Accepted M0 revision](docs/M0_SPECIFICATION.md) — owner accepted commit `683d71b`
- [M1 provider comparison](docs/M1_COST_REGION_RETENTION.md)
- [Extraction fixtures](fixtures/CASES.json) — the full fixture runner is a separate quality task
- [Update loop](fixtures/UPDATE_LOOP.json)
