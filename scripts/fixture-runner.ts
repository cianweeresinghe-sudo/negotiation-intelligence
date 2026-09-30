import {readFileSync} from 'node:fs';
import {validateCandidates,ExtractionError,type ExtractionSource,type DropCode} from '../src/proposals/validate';
import {proposalMock} from '../src/proposals/mock';
// Test-only runner: replays fixtures/CASES.json through the extraction validator.
// Validator replay feeds each expected candidate back as model output, so it checks that the
// oracle is acceptable to the validator, not that an extractor would find it. The mock column
// runs the real deterministic mock extractor and is the only extraction-accuracy signal here.
// It evaluates extraction expectations only. Draft leakage, unknowns, conflicts
// and state-effect expectations belong to later slices and are listed, not scored.
export type Status='pass'|'fail'|'unsupported_field';
type Source={id:string;text:string;sensitivity:'private'|'shareable'};
type Expected={field:string;value:unknown;currency:string|null;period:string|null;epistemic_type:string;sensitivity:'private'|'shareable';evidence:{source_id:string;quote:string}[]};
export type ExpectedDrop=Expected&{reason:string;rationale?:string};
export type Case={id:string;synthetic:boolean;sources:Source[];expected_candidates:Expected[];expected_dropped?:ExpectedDrop[];allow_extra_candidates?:boolean;should_be_unknown?:string[];expected_conflict_fields?:string[];forbidden_draft_values?:string[]};
export type CandidateResult={field:string;value:string;outcome:'kept'|'dropped'|'mismatch'|'not_extracted'|'dropped_as_expected'|'kept_unexpectedly'|'wrong_drop_reason';detail:string};
export type CaseResult={id:string;status:Status;validator_replay:CandidateResult[];mock_extraction:'pass'|'fail'|'not_supported';mock_detail:string;needs_human:string[];not_evaluated:string[]};
const stringify=(v:unknown)=>typeof v==='string'?v:JSON.stringify(v);
function toOutput(source:Source,expected:Expected[]){return {source_id:source.id,base_revision:0,unknowns:[],conflicts:[],
 candidates:expected.map(e=>({field:e.field,value:e.value,currency:e.currency,period:e.period,epistemic_type:e.epistemic_type,confidence:'high',confidence_rationale:'Fixture oracle replay.',sensitivity:e.sensitivity,evidence:e.evidence}))};}
// Drops are reported per source as counts. To attribute a drop to one expected
// candidate, each candidate is validated on its own.
function replay(source:Source,e:Expected):CandidateResult{
 const base={field:e.field,value:stringify(e.value),outcome:'kept' as CandidateResult['outcome'],detail:''};
 try{
  const r=validateCandidates(toOutput(source,[e]),source as ExtractionSource);
  if(r.candidates.length===0){const code=Object.keys(r.drops)[0] as DropCode|undefined;return {...base,outcome:'dropped',detail:code??'dropped'};}
  const k=r.candidates[0];const diffs:string[]=[];
  if(k.value!==stringify(e.value))diffs.push(`value ${k.value}`);if(k.currency!==e.currency)diffs.push(`currency ${k.currency}`);if(k.period!==e.period)diffs.push(`period ${k.period}`);
  if(k.epistemic_type!==e.epistemic_type)diffs.push(`type ${k.epistemic_type}`);if(k.sensitivity!==e.sensitivity)diffs.push(`sensitivity ${k.sensitivity}`);
  return diffs.length?{...base,outcome:'mismatch',detail:diffs.join(', ')}:base;
 }catch(error){return {...base,outcome:'dropped',detail:error instanceof ExtractionError?error.code:'error'};}
}
async function mockRun(c:Case):Promise<{status:CaseResult['mock_extraction'];detail:string}>{
 const extracted:string[]=[];
 for(const s of c.sources){
  const raw=await proposalMock.extract(s as ExtractionSource,new AbortController().signal);
  try{for(const k of validateCandidates(raw,s as ExtractionSource).candidates)extracted.push(`${k.field}:${k.value}:${k.currency}:${k.period}`);}catch(error){return {status:'fail',detail:error instanceof ExtractionError?error.code:'error'};}
 }
 const want=c.expected_candidates.map(e=>`${e.field}:${stringify(e.value)}:${e.currency}:${e.period}`);
 const missing=want.filter(w=>!extracted.includes(w)),extra=extracted.filter(x=>!want.includes(x));
 if(!missing.length&&(!extra.length||c.allow_extra_candidates))return {status:'pass',detail:`${extracted.length} extracted`};
 return {status:'fail',detail:[missing.length?`missing ${missing.join(' | ')}`:'',extra.length?`extra ${extra.join(' | ')}`:''].filter(Boolean).join('; ')};
}
export async function runCase(c:Case):Promise<CaseResult>{
 const byId=new Map(c.sources.map(s=>[s.id,s]));
 const replayed=c.expected_candidates.map(e=>{const s=byId.get(e.evidence[0]?.source_id);return s?replay(s,e):{field:e.field,value:stringify(e.value),outcome:'dropped' as const,detail:'unknown_source'};});
 const dropChecks:CandidateResult[]=(c.expected_dropped??[]).map(e=>{
  const s=byId.get(e.evidence[0]?.source_id);const r=s?replay(s,e):{field:e.field,value:stringify(e.value),outcome:'dropped' as const,detail:'unknown_source'};
  if(r.outcome==='dropped'&&r.detail===e.reason)return {...r,outcome:'dropped_as_expected' as const};
  if(r.outcome==='dropped')return {...r,outcome:'wrong_drop_reason' as const,detail:`expected ${e.reason}, got ${r.detail}`};
  return {...r,outcome:'kept_unexpectedly' as const,detail:`expected drop ${e.reason}, but the validator kept it`};
 });
 const bad=[...replayed.filter(r=>r.outcome!=='kept'),...dropChecks.filter(r=>r.outcome!=='dropped_as_expected')];
 const needs:string[]=[];
 if(bad.some(r=>r.detail==='constraint_requires_user'))needs.push('Oracle expects a stored minimum_base from an import, but policy drops it until the user states it. Owner/product decision, not a validator bug.');
 if(bad.some(r=>r.detail==='invalid_field_or_value'))needs.push('Oracle has a value or period the current domain rules reject (for example a missing period). Change the fixture or extend the domain, then re-review.');
 let status:Status='pass';
 if(bad.length)status=bad.every(r=>r.outcome==='dropped'&&r.detail==='unsupported_field')?'unsupported_field':'fail';
 const mock=await mockRun(c);
 const notEval:string[]=[];
 if(c.should_be_unknown?.length)notEval.push(`unknowns: ${c.should_be_unknown.join(', ')}`);
 if(c.expected_conflict_fields?.length)notEval.push(`conflict fields: ${c.expected_conflict_fields.join(', ')}`);
 if(c.forbidden_draft_values?.length)notEval.push(`forbidden draft values: ${c.forbidden_draft_values.join(', ')}`);
 return {id:c.id,status,validator_replay:[...replayed,...dropChecks],mock_extraction:replayed.some(r=>r.detail==='unsupported_field')?'not_supported':mock.status,mock_detail:mock.detail,needs_human:needs,not_evaluated:notEval};
}
export function loadCases(path=new URL('../fixtures/CASES.json',import.meta.url)):Case[]{return JSON.parse(readFileSync(path,'utf8')) as Case[];}
export async function runFixtures(cases=loadCases()){
 const results:CaseResult[]=[];for(const c of cases)results.push(await runCase(c));
 const tally:Record<Status,number>={pass:0,fail:0,unsupported_field:0};for(const r of results)tally[r.status]++;
 return {total:results.length,tally,results};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
 const report=await runFixtures();
 console.log('| case | validator replay | kept | mock extractor | detail |\n| --- | --- | --- | --- | --- |');
 for(const r of report.results)console.log(`| ${r.id} | ${r.status} | ${r.validator_replay.filter(x=>x.outcome==='kept'||x.outcome==='dropped_as_expected').length}/${r.validator_replay.length} | ${r.mock_extraction} | ${r.validator_replay.filter(x=>x.outcome!=='kept').map(x=>`${x.field}: ${x.outcome==='dropped_as_expected'?'expected drop ':''}${x.detail}`).join('; ')||'-'}${r.mock_extraction==='fail'?` (mock: ${r.mock_detail})`:''} |`);
 console.log(`\nValidator replay: ${report.tally.pass} pass, ${report.tally.fail} fail, ${report.tally.unsupported_field} unsupported_field of ${report.total}. Pass means the validator kept every expected candidate unchanged and dropped every expected drop for its stated reason. It is a pipeline check, not model quality.`);
 if(process.env.FIXTURE_JSON==='1')console.log(JSON.stringify(report,null,1));
}
