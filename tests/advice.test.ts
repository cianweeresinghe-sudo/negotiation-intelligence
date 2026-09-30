import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {adviceMock} from '../src/advice/mock';
import {freeze,type AdviceSnapshot} from '../src/advice/types';
import {validateAdviceOutput,AdviceValidationError,numberTokens,GENERIC_DRAFT} from '../src/advice/validate';
const id=randomUUID(),eid=randomUUID(),sid=randomUUID();
const snapshot:AdviceSnapshot=freeze({revision:2,materialVersion:3,includePrivateConstraints:false,assertions:[{id,field:'base',value:'52000',currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',sensitivity:'private',outbound_quote_allowed:false,source_id:sid,evidence_id:eid,conflict_group_id:null}],evidence:[{id:eid,source_id:sid,assertion_id:id,quote:'£52,000 annually'}],conflicts:[],pendingProposalIds:[]});
async function raw(s=snapshot){return structuredClone(await adviceMock.generate(s,new AbortController().signal)) as any;}
function blocked(value:unknown,code:string,s=snapshot){assert.throws(()=>validateAdviceOutput(value,s),(e:unknown)=>e instanceof AdviceValidationError&&e.code===code);}
function rewrite(value:any,path:string,text:string){value[path]=text;value.claims.find((c:any)=>c.output_path==='/'+path).text=text;}
test('advice mock uses actual assertion and evidence IDs and server counters',async()=>{const result=validateAdviceOutput(await raw(),snapshot);assert.equal(result.revision,2);assert.equal(result.material_version,3);assert.deepEqual(result.evidence_ids,[eid]);assert.deepEqual(result.assertion_ids,[id]);});
test('adversarial advice rejects wrong numbers, currencies and date combinations',async()=>{
 for(const text of ['The base is £200,000.','The base is EUR 52,000.']){const v=await raw();rewrite(v,'situation',text);blocked(v,'unsupported_value');}
 const dateId=randomUUID();const s:AdviceSnapshot={...snapshot,assertions:[{...snapshot.assertions[0],id:dateId,field:'deadline',value:'5 October 2026',currency:null,period:null}],evidence:[{...snapshot.evidence[0],assertion_id:dateId,quote:'5 October 2026'}]};const v=await raw(s);rewrite(v,'situation','The deadline is 26 October 2025.');blocked(v,'unsupported_value',s);
});
test('adversarial advice rejects fabricated, cross-case and source-as-evidence references',async()=>{
 for(const ref of [randomUUID(),sid]){const v=await raw();v.claims[0].evidence_ids=[ref];blocked(v,'invalid_reference');}
 const v=await raw();v.claims[0].assertion_ids=[randomUUID()];blocked(v,'invalid_reference');
});
test('uncited prose and dedicated-question factual presuppositions fail coverage',async()=>{
 const v=await raw();v.main_risk+=' Another offer is secured.';blocked(v,'uncovered_statement');
 const q=await raw();q.decision_changing_question='Why is the base £200,000?';q.claims=q.claims.filter((c:any)=>c.output_path!=='/decision_changing_question');blocked(q,'uncovered_statement');
 const cited=await raw();rewrite(cited,'decision_changing_question','Why is the base £200,000?');blocked(cited,'unsupported_value');
});
test('open conflict requires all members and never promotes one deadline to fact',async()=>{
 const second=randomUUID(),group=randomUUID();const s:AdviceSnapshot={...snapshot,assertions:[{...snapshot.assertions[0],conflict_group_id:group},{...snapshot.assertions[0],id:second,value:'62000',conflict_group_id:group}],conflicts:[{id:group,assertionIds:[id,second]}]};
 validateAdviceOutput(await raw(s),s);const partial=await raw(s);partial.claims[0].assertion_ids=[id];blocked(partial,'partial_conflict',s);
 const fact=await raw(s);rewrite(fact,'situation','The unresolved base is £52,000.');blocked(fact,'conflict_presented_as_fact',s);
});
test('draft checker blocks private formats, words, quotes and alternative existence with adversarial outputs',async()=>{
 for(const text of ['My minimum is 52000.','My minimum is £52,000.','My minimum is 52k.','My minimum is 52 000.']){const v=await raw();v.draft=text;blocked(v,'private_value_in_draft');}
 for(const text of ['I cannot go below fifty two thousand.','I have another offer.','We cannot go below the mid-forties.']){const v=await raw();v.draft=text;blocked(v,'draft_not_permitted');}
 const quote=await raw();quote.draft='The quote is £52,000 annually';blocked(quote,'private_value_in_draft');
 const generic=await raw();generic.draft=GENERIC_DRAFT;validateAdviceOutput(generic,snapshot);
 const cited=await raw();cited.draft=GENERIC_DRAFT;cited.claims.push({text:GENERIC_DRAFT,output_path:'/draft',assertion_ids:[id],evidence_ids:[]});blocked(cited,'draft_reference_not_permitted');
});
test('advice strict contract rejects oversized, extra-key, control and empty statements',async()=>{
 const extra=await raw();extra.tool='network';blocked(extra,'invalid_response');blocked('x'.repeat(131073),'invalid_response');
 for(const text of ['\u0000','\u0001','   ']){const v=await raw();rewrite(v,'situation',text);blocked(v,'invalid_response');}
});
test('normalised numbers preserve decimal precision without floating point',()=>{assert.deepEqual(numberTokens('£48,000 / 48k / 48 000 / 0.10 / 9007199254740993'),['48000','48000','48000','0.1','9007199254740993']);});
test('correct amount display formats pass exactly and mismatched deadline is rejected',async()=>{
 for(const amount of ['£52k','GBP 52,000.00','52 000']){const v=await raw();rewrite(v,'situation',`The reviewed base is ${amount}.`);validateAdviceOutput(v,snapshot);}
 const d:AdviceSnapshot={...snapshot,assertions:[{...snapshot.assertions[0],field:'deadline',value:'5 October',currency:null,period:null}],evidence:[{...snapshot.evidence[0],quote:'5 October'}]};const v=await raw(d);rewrite(v,'situation','The deadline is 4 October.');blocked(v,'unsupported_value',d);
});
test('private floor missing from model snapshot is still checked by the outbound guard',async()=>{
 const floor={...snapshot.assertions[0],id:randomUUID(),field:'minimum_base',value:'48000'};const privacy:AdviceSnapshot={...snapshot,assertions:[...snapshot.assertions,floor]};
 for(const amount of ['48000','£48,000','GBP 48,000','48k','48 000','48,000.00']){const v=await raw();v.draft=`I need ${amount}.`;assert.throws(()=>validateAdviceOutput(v,snapshot,privacy),(e:unknown)=>e instanceof AdviceValidationError&&e.code==='private_value_in_draft');}
 const p:AdviceSnapshot={...privacy,evidence:[...snapshot.evidence,{id:randomUUID(),source_id:sid,assertion_id:floor.id,quote:'My strategic walk-away position'}]};const v=await raw();v.draft='My strategic walk-away position';assert.throws(()=>validateAdviceOutput(v,snapshot,p),(e:unknown)=>e instanceof AdviceValidationError&&e.code==='private_quote_in_draft');
});
test('claims never reinterpret an exact cited amount as a range or rounded estimate',async()=>{
 for(const text of ['The base is about £52,000.','The base is £52,000 to £52,000.']){const v=await raw();rewrite(v,'situation',text);blocked(v,'unsupported_value');}
});
