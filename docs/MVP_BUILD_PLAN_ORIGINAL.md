# Negotiation Intelligence: MVP build plan

Status: proposed plan for review; implementation has not started.
Date: 30 September 2026.
Basis: the product discussion in this chat and the reviewed Claude specifications.

## 1. Product goal and first release

Build a persistent negotiation workspace that turns evidence into a structured understanding of the situation and useful advice about the next move. The long-term product serves teams across Sales, Procurement, Legal and HR in SMBs and enterprises.

The first release is a private, single-user web alpha for written new-job offers. Keep the domain model general and test it against supplier and customer contract renewals. Commercial testing validates transferability; salary adoption alone does not establish enterprise demand.

The product test: does someone return after their next real interaction, add new information and consult the updated advice before acting?

End-to-end demonstration:
1. Create a negotiation and paste an offer email.
2. Review extracted claims, terms, deadlines and unknowns with supporting evidence.
3. Confirm objectives, alternatives, priorities and private constraints.
4. Get a next-move recommendation and suggested wording.
5. Add the next email or call note.
6. Review the changes and see why the recommendation changes or stays the same.
7. Record the action and eventual outcome, then export or delete the case.

## 2. Scope

Include accounts and multiple private cases; short adaptive intake; paste and upload; proposed-update review; editable workbook; evidence-grounded Ask; strategy and drafting; a pre-call brief; history and corrections; outcome capture; offer comparison; red-team and assumption sensitivity.

Initial upload formats: UTF-8 text and text-based PDF. Pasted email and transcript text are supported. Show a clear unsupported-format message for scanned PDFs, audio and other formats until their extraction path is implemented. Limit file size and extracted length with configurable caps established in milestone 1.

Defer Gmail/Granola OAuth, recording transcription, team sharing, automatic sending, external research, billing, cross-customer training, live coaching and complex multi-round simulations. These are follow-on milestones, not hidden requirements of alpha.

## 3. Product surfaces

- Case home: active cases, latest activity and next scheduled contact.
- Right now: current offer, objectives, position assessment, consequential unknown and next move.
- Workbook: parties, interests, alternatives, constraints, issues, offers and intelligence. Evidence is accessible from each assertion.
- Add update: paste/upload, extraction status, then review/edit/accept/reject proposals.
- Ask: grounded questions, red-team and draft review. Adding information explicitly creates proposals.
- Strategy: one recommended action with rationale, risks, assumptions and alternatives; an information-gathering action can take priority.
- History: sources, accepted changes, corrections, offers, advice versions and reported outcomes.

Users can begin with a document or a brief description. Intake then asks only missing questions that matter to the decision. Unknown is a valid answer.

## 4. Architecture

Proposed stack: TypeScript web application, Postgres, private object storage and a durable background job runner. A Next.js-based application is the default candidate, subject to a short setup check of deployment and worker compatibility. Use managed authentication. Provider, model, region and hosting choices are unresolved until milestone 1. No model or infrastructure version is pinned by this document.

Deploy a modular monolith plus its worker. Internal modules:
- Domain: structured objects, validation, corrections and state revisions.
- Ingestion: source preservation, text parsing and candidate extraction.
- Review: user decisions and atomic state updates.
- Intelligence: evidence selection, questions, recommendations and drafting.
- Analysis: package comparison, constraints and scenario sensitivity.
- Operations: jobs, usage, tracing, deletion and release controls.

Processing path: original source -> extracted candidates -> validated proposals -> user review -> accepted state revision -> advice tied to that revision.

Original sources and proposals are distinct from current accepted state. History records changes without requiring a full event-sourcing framework. Accepted assertions form the current projection; a transaction increments the case revision and records the change. Advice stores its revision and input references. Warn when an output becomes stale after new information is accepted.

Persist job status. Failed jobs can retry without duplicating sources or proposals. Use idempotency keys and content hashes for duplicate detection. Reject stale review writes with a clear refresh/review path. Keep retrieval scoped to the current case; full-text/evidence selection is enough initially, with embeddings introduced only if retrieval tests justify them.

## 5. Domain model

All case objects are scoped to an owner and negotiation. Preserve an extension path for workspace membership, without building collaboration yet.

| Object | Main responsibilities |
| --- | --- |
| Negotiation | Scenario, status, objectives, dates, owner, revision |
| Party/person | Role, decision authority, interests and relationship |
| Source | Original asset/text, metadata, checksum, parsing status |
| Assertion | Subject, field/value, epistemic type, confidence explanation, timestamps, verification and supersession |
| Evidence | Source reference, exact quoted span and text offsets or page reference |
| Proposal | Candidate assertion/change, review status and edits |
| Issue/preference | Unit, target, hard constraint, desirability and tradeability |
| Offer | Dated bundle of terms, proposer, status and evidence |
| Event | Interaction, action, correction, decision or system change |
| Advice run | State revision, evidence references, prompt/model version and structured output |
| Recommendation/outcome | Suggested action, intended effect, what user did and what followed |
| Scenario run | Assumptions, candidate strategies, analysis version and results |

Epistemic types: documented observation/fact, counterparty claim, user assumption, AI inference. Verification/review status is a separate dimension. Accepting an extracted claim does not make its content true. A documented email establishes that a claim was made, not that it is accurate.

Confidence describes uncertainty with a rationale. Start with low/medium/high, not invented numerical probabilities. Numeric ranges for uncertain values need explicit origin and justification. Offer terms have currencies, units and time basis; distinguish annual base, one-time bonus and equity terms. Unknown equity value remains unknown. Keep original and normalised wording linked.

Corrections supersede or retract assertions while retaining their provenance. Case deletion removes accessible originals and derived case content, with explicit backup-retention behaviour. Privacy deletion takes precedence over immutable history.

## 6. Intelligence contract

Extraction uses structured outputs validated against application schemas. Evidence spans must match source text. Invalid or unsupported candidates are rejected or flagged. Source text is untrusted input and cannot issue application instructions.

The application controls accepted-state writes. The model cannot silently change the workbook. User-entered facts can save directly with a manual source record and audit event; inferred changes require review.

Ask and recommendations consume accepted state plus explicitly labelled unresolved material where relevant. Answers distinguish evidence from hypotheses, cite valid case/source IDs and state missing information. Validate references before displaying them. Unsupported assertions should not masquerade as sourced conclusions.

Strategy output: situation assessment; one recommended next action; intended effect; rationale and evidence; assumptions; main risk; useful alternative; question whose answer could change the decision; optional suggested wording.

The user can flag private information such as reservation points and alternatives. Outbound drafts must pass a disclosure check against those fields. A separate check alone is not a guarantee; test the complete drafting workflow. Users review and send drafts themselves.

## 7. Negotiation theory and simulation in alpha

Build fundamentals into the workbook: interests, alternatives, reservation constraints, negotiable issues, commitments and decision authority.

Use a small curated tactics set with applicability, contraindications, intended effects and evidence. Rules enforce hard constraints and prerequisites; the model proposes and explains context-specific moves. A question, waiting, accepting or walking away can be the recommended action.

Implement deterministic package comparison using user-supplied preferences and hard constraints. Any weighted utility calculation must show its weights and simplifying assumptions. Do not compare equity as cash without explicit valuation assumptions. Treat missing inputs as missing.

Add red-team analysis and sensitivity across a few explicit plausible conditions, such as fixed versus flexible band, credible versus uncertain deadline, or strong versus weak alternative. Results explain which assumptions reverse the advice. Initial scenarios are enumerated, not assigned invented likelihoods.

Defer Nash benchmarks, Bayesian numerical updates, behavioural parameter fitting and Monte Carlo negotiation simulations until input requirements and evaluation evidence justify them. Distinguish simulation results from calibrated real-world forecasts in any later implementation.

## 8. Build milestones and acceptance gates

### M0: executable specification and test cases
Deliver the detailed schema, five key screen flows, structured extraction/advice contracts and a labelled fixture set. Manually run 5-8 varied cases where participants are available; recruitment can proceed alongside software preparation.
Gate: an offer-to-next-interaction example is fully specified, including a claim, contradiction, correction and changed advice. At least two commercial fixtures test parties, terms and authority. Human-case availability is a product-validation dependency, not a reason to invent results.

### M1: application foundation and persisted workbook
Create the application repo, authentication, database migrations, private case CRUD, domain validation, manual entries and audit events. Set environments, test runner, CI and mock model adapter. Record provider/hosting choices and estimated per-case operating costs.
Gate: user A cannot access user B's case or assets; a case survives reload; correction history works; migrations recreate the schema; demo runs locally without a model credential.

### M2: source ingestion and review
Add paste/text/PDF ingestion, original storage, worker status, candidate extraction, evidence matching and review UI. Apply accepted changes atomically. Detect conflicting assertions without overwriting earlier ones.
Gate: a fixture offer yields traceable proposals; rejecting them leaves state unchanged; acceptance preserves classification; repeated processing does not duplicate state; a failed job can retry; stale review cannot overwrite newer state.

### M3: complete advice/update loop
Build Right now, Strategy, Ask, drafting and History. Add next interaction and show material differences. Capture action/outcome feedback. Save advice inputs and versions.
Gate: the second source changes advice for supported reasons or explains why it does not; citations resolve; unknowns stay unknown; private limits are protected in the drafting fixtures; errors preserve case state; stale advice is visible.

### M4: decision tools
Implement package comparison, pre-call brief, red-team and qualitative sensitivity. Test salary packages and one commercial renewal.
Gate: deterministic comparisons match hand calculations; hard constraints dominate soft preferences; scenario assumptions remain visible; an assumption change can reverse advice; no uncalibrated success percentages appear.

### M5: private alpha and release readiness
Complete export/deletion, operational monitoring, cost limits, end-to-end flows and supported-format behaviour. Run intelligence evaluations and browser acceptance tests. Prepare a staging release and limited production access.
Gate: deletion/export behaviour is verified; tenant isolation and source-injection tests pass; all critical intelligence failures are resolved; a human reviews representative advice; rollback has been rehearsed. Production release remains a separate explicit action.

## 9. Test and evaluation plan

Start with roughly 20 labelled fixtures in M0 and expand toward 30-50 before alpha. Include fixed bands, favourable/weak positions, conflicting dates, withdrawn offers, unconfirmed alternatives, unclear authority, multiple currencies, sensitive floors, source injection and sensible accept/walk-away outcomes.

Deterministic checks: permissions; state transactions; correction and supersession; stale writes; evidence matching; duplicate jobs; currencies/units; package arithmetic; export/deletion.

Model evaluations: extraction precision and omissions; claim classification; fabricated evidence; retained uncertainty; recommendation feasibility; sensitive draft disclosure; consistency under irrelevant wording changes; responsiveness to material changes. Use hand-labelled expectations and expert judgement for advice. Track repeated runs because outputs vary. Do not use the same model's self-grade as the sole acceptance criterion.

Browser acceptance: create -> import -> review -> ask -> add second interaction -> inspect strategy/history -> report outcome -> export/delete.

## 10. Build and release workflow

For each milestone or feature: acceptance criteria -> implementation plan -> scoped change -> automated verification -> review -> staging acceptance. If a check fails, repair before advancing. Record consequential decisions and changes to scope in this plan.

Use protected main, pull requests and a distinct review pass. Bring a senior engineer into auth, state design, infrastructure and production-readiness review. The user owns product acceptance; agents support implementation and evaluation. Independent agent review can be commissioned later with explicit authorization.

Keep development and staging separate from production. Use synthetic data in development. Model traces record IDs, timing, token/cost usage and versions by default, with sensitive content excluded from routine logs. Set model budgets and request timeouts; preserve saved work after failures. Stage deployments before an explicit production release.

## 11. Validation and timing

Planning estimate: 6-8 weeks to private alpha for a small focused team, revised after M2 demonstrates actual pace. Suggested sequence: week 1 M0/M1, weeks 2-3 M2, weeks 3-4 M3, week 5 M4, weeks 6-8 M5 and live iteration. Recruitment and commercial discovery run alongside the build.

Primary metric: share of eligible cases with a second real interaction and subsequent advice consultation. Track the eligible denominator because some cases conclude or have no next interaction. Also track correction burden, time to first useful recommendation, reported action influence, user trust and observed failure types. Outcomes are observational; they do not establish causal financial improvement.

Alpha target: 10-15 users with live salary negotiations plus a few commercial design partners. Numbers are proposed research targets. Evidence of commercial repeat use is required before committing to full team workflows.

## 12. Decisions to settle before implementation

Proposed defaults: new-job offer salary flow; single-user responsive web app; text/PDF plus paste; one recommended action with alternatives; explicit review of extracted consequential changes; qualitative uncertainty; simple scenario analysis; no automatic sending.

Resolve M1 dependencies: application repository/location, hosting and data region, managed auth/database/storage provider, model account/credentials and budget, implementation/review owner availability. Use M0 to settle the minimum evidence-review interaction and the first fixture.

Next planning deliverable: detail M1 and M2 into implementable issues, with schema examples and acceptance cases. No application scaffolding or paid infrastructure is authorized by this planning document alone.
