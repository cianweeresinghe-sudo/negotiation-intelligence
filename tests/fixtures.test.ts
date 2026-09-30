import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCases,runCase,runFixtures,type Case,type Status} from '../scripts/fixture-runner';
const SUPPORTED=['base','minimum_base','deadline','objective','alternative','note'];
// Baseline of the current six-field pipeline. A change here must be deliberate:
// it means the validator, the domain rules or a fixture changed. It is not a model-quality score.
const BASELINE:Record<string,Status>={
 fixed_band:'unsupported_field',flexible_band:'unsupported_field',deadline_claim:'unsupported_field',deadline_conflict:'unsupported_field',withdrawn:'unsupported_field',
 unconfirmed_alternative:'unsupported_field',unclear_authority:'unsupported_field',mixed_currency:'unsupported_field',private_floor:'fail',injection:'pass',missing_base:'pass',
 equity_unknown:'unsupported_field',accept_reasonable:'unsupported_field',walk_away:'unsupported_field',annual_monthly:'pass',irrelevant_wording:'pass',source_correction:'fail',
 private_paraphrase:'fail',supplier_renewal:'unsupported_field',customer_renewal:'unsupported_field',disclosure_injection:'fail',multi_source_deadlines:'unsupported_field',
};
test('fixture file is synthetic, complete and has unique case ids',()=>{
 const cases=loadCases();assert.equal(cases.length,22);assert.ok(cases.every(c=>c.synthetic===true));assert.equal(new Set(cases.map(c=>c.id)).size,22);
 assert.deepEqual(new Set(cases.map(c=>c.id)),new Set(Object.keys(BASELINE)));
});
test('runner reports the exact per-case baseline and never claims all 22 pass',async()=>{
 const report=await runFixtures();
 assert.deepEqual(Object.fromEntries(report.results.map(r=>[r.id,r.status])),BASELINE);
 assert.deepEqual(report.tally,{pass:4,fail:4,unsupported_field:14});assert.equal(report.tally.pass+report.tally.fail+report.tally.unsupported_field,report.total);
 assert.ok(report.tally.pass<report.total);
});
test('a case with a field outside the six supported fields is never reported as pass',async()=>{
 const report=await runFixtures();const cases=new Map(loadCases().map(c=>[c.id,c]));
 for(const r of report.results){const outside=cases.get(r.id)!.expected_candidates.some(e=>!SUPPORTED.includes(e.field));if(outside)assert.notEqual(r.status,'pass',r.id);}
});
test('private and policy-dropped expectations are flagged for a human, not passed',async()=>{
 const report=await runFixtures();
 for(const id of ['private_floor','private_paraphrase','disclosure_injection']){const r=report.results.find(x=>x.id===id)!;assert.equal(r.status,'fail',id);assert.ok(r.needs_human.length>0,id);}
 const corr=report.results.find(x=>x.id==='source_correction')!;assert.equal(corr.validator_replay[0].detail,'unsupported_value');
});
test('runner is not vacuous: mutated expectations are reported as failures',async()=>{
 const base=loadCases().find(c=>c.id==='irrelevant_wording') as Case;assert.equal((await runCase(base)).status,'pass');
 const fabricated:Case={...base,expected_candidates:[{...base.expected_candidates[0],evidence:[{...base.expected_candidates[0].evidence[0],quote:'Offer: GBP 99,999 annually.'}]}]};
 assert.equal((await runCase(fabricated)).status,'fail');
 const wrongValue:Case={...base,expected_candidates:[{...base.expected_candidates[0],value:'200000'}]};assert.equal((await runCase(wrongValue)).status,'fail');
 // Not mutated: epistemic_type. Replay feeds the oracle back as model output, so the validator passes it through unchanged.
 // Replay shows the oracle is acceptable to the validator (field, domain rules, unique quote, value supported by quote), not extractor accuracy.
 const wrongSource:Case={...base,expected_candidates:[{...base.expected_candidates[0],evidence:[{source_id:'other',quote:base.expected_candidates[0].evidence[0].quote}]}]};assert.equal((await runCase(wrongSource)).status,'fail');
});
test('zero-candidate injection cases stay at zero extracted candidates',async()=>{
 const report=await runFixtures();for(const id of ['injection','missing_base']){const r=report.results.find(x=>x.id===id)!;assert.equal(r.validator_replay.length,0,id);assert.equal(r.mock_extraction,'pass',id);}
});
