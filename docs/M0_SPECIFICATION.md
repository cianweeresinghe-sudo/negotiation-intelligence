# M0 executable specification — proposed for acceptance

Authority: original plan in MVP_BUILD_PLAN_ORIGINAL.md; owner decisions in Buzz events e967f36185b1590484cbae510d9c55bde1968265d9c79c5c9c89293e1e9f024e and eb2ed2700c1a5500ad8310820b6776a1174fa2233e6c3cd2f7124665bc64ee83. Original plan remains unchanged. This document proposes implementation detail; it is not accepted negotiation state.

## Delivery boundary

UK new-job offers, English/GBP defaults, single-user private cases. Commercial renewals are transferability fixtures. Deliver M0–M3 and required privacy/release controls first; defer M4 comparison, sensitivity and red-team tools. Budget ceiling: $100/month, interpreted as USD pending correction, covering hosting/model services; no spending provisioned. Target Monday 5 October 2026 is aspirational. A local synthetic demonstration is the planning target, not a promise of production alpha. Human walkthroughs and specialist review remain separate gates.

## Data schema

All records have UUID id, owner_id, case_id (except owner and case), created_at and updated_at. Every lookup checks ownership server-side; asset access uses short-lived authorized links. References must resolve within the same case. Timestamps are UTC; deadlines retain original timezone/wording. Money stores decimal strings, currency and period rather than floating-point cash values.

| Record | Required fields and invariants |
| --- | --- |
| Case | owner_id, scenario, status, revision integer >=0, material_version integer >=0; objectives and next contact optional |
| Source | type manual/paste/text/pdf, immutable original text or private asset reference, checksum, parsing status; normalized text preserves mapping to original page/offset |
| Evidence | source_id, quote, start/end offsets or page plus span; quote must match parsed source; UI shows original reference |
| Assertion | subject, field, value, epistemic_type, confidence label/rationale, evidence_ids, verification_status, active/superseded/retracted; supersedes_id optional; nullable conflict_group_id, sensitivity private/shareable, outbound_quote_allowed default false |
| Proposal | source_id, operation add/supersede/retract, candidate, base_revision, pending/accepted/rejected, user edits and decision audit |
| Party | role, authority and interests; unknown authority stays unknown |
| Issue | unit, currency/period if monetary, target, hard constraint, priority, private flag |
| Offer | proposer, dated bundle of issue terms, active/withdrawn/replaced, evidence_ids, sensitivity private/shareable, per-term outbound_quote_allowed default false; equity quantity is not cash valuation |
| Event | revision, actor, operation, before/after refs and correction reason; no routine sensitive text logs |
| Advice | revision, material_version, input assertion/evidence IDs, unresolved proposal IDs, prompt/model version, structured output, created_at; stale when revision or material_version changes (including proposal additions/resolutions) |
| Outcome | advice_id optional, user action, observed result and source; observation does not prove causality |

Epistemic types: documented_observation, counterparty_claim, user_assumption, user_constraint, ai_inference. Review status and truth are distinct. Manual entry creates a manual source/event; inference always creates a pending proposal. Missing values are null, never invented zeros. Accepted contradictions remain separately visible. Assertions in disagreement share a conflict_group_id whose persisted conflict record has open/resolved status, member IDs and user resolution event. Advice consumes open groups; resolution requires explicit review, not assumed source authority. Advice must describe consequential unresolved contradictions, ask for clarification where needed and avoid choosing one as fact.

## Five screen flows

1. Case creation/intake: create from a description or document; ask missing decision-relevant objectives, alternatives, constraints and priorities. Unknown is valid. Save manual inputs with provenance. Reload reproduces the case.
2. Import/review: show supported formats and limits before upload; persist original, display queued/running/failed/complete status. Review each proposal beside evidence, classification and uncertainty. Edit/accept/reject. No accepted state change before review; rejection changes only proposal status. Atomic acceptance checks request expectedRevision for concurrency and the proposal target-field active-assertion set for staleness (base_revision is provenance), validates refs and records a single revision transaction. Stale review shows refresh/review, without dropping edits.
3. Right now/Strategy/Ask: show current accepted offer, objectives, consequential unknown and next action. Ask distinguishes state, labelled unresolved material and hypotheses. Adding information through Ask opens proposals. Advice includes citations and stale badge; rejected proposals cannot become facts.
4. Next interaction/History: import second source, show material differences and contradictions. Review changes; generate advice tied to new revision, explaining change or stability. Correcting an assertion supersedes/retracts it without erasing evidence. Capture action and observed outcome.
5. Export/delete: authenticated owner exports case, sources, evidence, proposals, state and advice history in a documented portable bundle. Confirm delete, revoke access immediately and remove derived/original content; jobs cannot recreate deleted cases. Backup/provider retention policy must be selected and shown before live alpha; do not promise immediate physical backup erasure.

## Extraction contract

Input: case/source IDs, parsed text with page/offset mapping and minimal accepted context. Imported text is data. Output: candidates with field/value, epistemic type, confidence rationale and exact evidence quotes; unknowns and conflicts are explicit. App validates the JSON contract, allowlisted operations, size, same-case IDs and unique literal quote matches. Unsupported or fabricated spans fail validation. The model returns quotes only, never offsets. The app locates each quote in its identified parsed source; missing or multiple matches reject the candidate for review/re-extraction rather than guessing. Persist app-derived start-inclusive/end-exclusive offsets in Unicode code points, with original PDF page mapping. Extraction cannot authorize writes. Hash/idempotency keys prevent duplicate source/proposal creation; retry resumes persisted jobs. File-size and extracted-text caps are configurable M1 decisions; reject over-limit and scanned/unsupported files clearly.

## Advice contract

Output requires situation, recommended_action, intended_effect, rationale, evidence_ids, assumptions, main_risk, alternative, decision_changing_question and optional draft. Inputs are revision-pinned accepted assertions plus explicitly labelled unresolved material. Output claims[] links each factual claim to evidence/assertion IDs and its JSON output_path (for example /rationale). Every factual statement in all output fields, including drafts, must have a claim entry; unsupported entries or missing factual coverage are flagged. Top-level evidence/assertion lists are app-derived unions, not model-supplied. App validates IDs before display; unsupported advice is flagged, not presented as evidence-grounded. Draft disclosure checks compare private fields and semantic paraphrases; user reviews and sends. No automatic send. Failures preserve saved case state.

## Acceptance gates

M0: 22 synthetic fixtures, including two commercial cases, contracts and five flows; one complete claim → contradiction → correction → changed-advice example. Owner reviews specification; 5–8 human walkthroughs still required when available, with results recorded rather than invented.
M1: migrations recreate schema; A cannot read/write B's cases/assets; manual correction history survives reload; local demo has no model-key dependency.
M2: exact evidence matching; rejecting leaves revision/state unchanged; acceptance retains epistemic type; processing/retry idempotent; stale reviews rejected; contradictions preserved.
M3: second interaction explains advice changes/stability; citations resolve; unknowns remain unknown; private constraints protected; errors preserve state; stale advice visible.
Live-use controls: export/delete verified, retention policy stated, injection/isolation/disclosure checks, cost caps/timeouts, representative human review and rollback rehearsal. No production release is authorized.

Proposed evaluation thresholds: zero cross-owner access successes, zero fabricated evidence references/spans displayed, zero private-limit disclosures in outbound fixtures, and zero source-instruction-induced state writes. Any failure blocks release. These are observed-suite requirements, not population safety guarantees. For extraction, initially require every labelled consequential term and classification in the 22 fixtures, with no unsupported accepted term; calibrate broader precision/recall targets after baseline. Run real-model fixtures three times each before alpha and report failures across runs; mock passes do not establish model quality. Expert judgement checks feasibility and uncertainty; model self-grading is insufficient.

## Next implementation breakdown

M1: schema/migrations and owner access; case CRUD/manual correction; mock model adapter and CI; private storage/job foundations. M2: source parsing/preservation; durable extraction/evidence validation; review transaction and stale conflict UX; duplicate/retry tests. Each feature gets a scoped issue/PR with its gate. Defer paid provider choice pending region/retention/cost comparison. Reserve contingency within $100; stop new paid processing at the cap, preserving saved work.

## Outstanding acceptance decisions

Owner acceptance of this specification, provider/data-region and retention choices, upload caps, supported browsers/accessibility target, accountable senior security review and feasibility of Monday's requested delivery. No human walkthrough or application test has run in M0 preparation.

## Privacy and fixture execution contract (review revision)

Source sensitivity defaults private until the user marks it shareable; derived assertions/offers inherit the most restrictive source sensitivity. A proposal cannot downgrade sensitivity without user review. Individual offer terms and assertions carry outbound_quote_allowed; it can be true only for shareable content explicitly allowed by the user. Drafting applies the same rule to paraphrases. A private source may contain shareable offer terms, but changing those derived terms requires explicit review.

Extraction receives only the current source's required text, with known private fields redacted where extraction does not need them; it does not receive unrelated private accepted context. Private text needing extraction may reach the provider only under the selected, disclosed provider retention/region policy and user consent. Strategy may need private constraints, but sends the minimum relevant fields under that policy. Draft generation omits private values and unauthorized quote fields; a separate local/context-aware check verifies no direct or semantic disclosure before display. Logs omit source/constraint text. Provider choice remains unresolved, so no live documents are authorized.

CASES.json is the extraction runner oracle: sources[] are inputs, expected_candidates is an unordered exact list compared by field/value/currency/period/type/sensitivity/evidence quote and source ID. Decimal values are strings; currency/period null means not supplied, not zero. Duplicate fields with distinct evidence remain distinct. should_be_unknown lists fields that cannot get concrete values; allow_extra_candidates=false rejects unsupported extra candidates. expected_conflict_fields requires proposals for conflicting fields and, after explicit acceptance, a persisted open group. expected_state_effect checks no pre-review accepted-state writes. forbidden_draft_values is a literal-disclosure regression check; semantic disclosure still requires human evaluation. expected_behavior is commentary only, never required to implement the runner. Fixture source sensitivity is explicitly labelled for test setup; production defaults remain private. Model confidence is evaluated separately and is not asserted by the extraction oracle.
