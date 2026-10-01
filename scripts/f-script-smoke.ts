import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
// Independent HTTP check of the M3 demo loop (checklist F, from fixtures/UPDATE_LOOP.json).
// Counters follow the corrected oracle: each accept is one revision. Invented text only.
const database=process.env.TEST_DATABASE_URL;
if(!database || new URL(database).pathname!=='/workbook_test')throw new Error('Smoke requires the synthetic workbook_test database');
const origin='http://127.0.0.1:3104';
let child:ReturnType<typeof spawn>|undefined;
async function start(user:string){
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3104'],{env:{...process.env,ALLOW_SYNTHETIC_IDENTITY:'1',DEMO_USER:user,DATABASE_URL:database,NODE_ENV:'development'},stdio:'ignore'});
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error('Dev server exited');try{const r=await fetch(origin+'/api/cases');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
 throw new Error('Dev server did not become ready');
}
async function stop(){if(!child)return;const exiting=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill('SIGTERM');await exiting;child=undefined;}
async function call(path:string,method='GET',body?:unknown){
 const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
type Detail={negotiation:{revision:number;material_version:number};assertions:{id:string;field:string;value:string;status:string;epistemic_type:string;source_id:string;supersedes_id:string|null;conflict_group_id:string|null}[];sources:{id:string;kind:string}[];conflicts:{id:string;status:string}[]};
type Proposal={id:string;status:string;candidate:{field:string;value:string};operation:string};
try{
 await start('alice');
 const id=(await call('/api/cases','POST',{title:'Synthetic F-script loop'})).data.id as string;
 const detail=async()=>(await call(`/api/cases/${id}`)).data as Detail;
 const proposals=async()=>(await call(`/api/cases/${id}/proposals`)).data as {proposals:Proposal[];evidence:{proposal_id:string;quote:string}[]};
 const pending=async()=>(await proposals()).proposals.filter(p=>p.status==='pending');
 const advice=async()=>{const d=await detail();return {revisionNow:d.negotiation.revision,materialNow:d.negotiation.material_version};};
 const generate=async()=>{const {revisionNow,materialNow}=await advice();const r=await call(`/api/cases/${id}/advice`,'POST',{expectedRevision:revisionNow,expectedMaterialVersion:materialNow});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const latest=async()=>(await call(`/api/cases/${id}/advice`)).data.latest as {id:string;stale:boolean}|null;

 // F1: import the recruiter email. Two pending proposals with exact quotes, revision 0, no assertions.
 const email1='Recruiter: Offer GBP 50,000 annually; deadline 5 October.';
 assert.equal((await call(`/api/cases/${id}/proposals/import`,'POST',{text:email1})).status,200);
 let p=await proposals();const first=p.proposals.filter(x=>x.status==='pending');
 assert.deepEqual(first.map(x=>`${x.candidate.field}:${x.candidate.value}`).sort(),['base:50000','deadline:5 October']);
 for(const x of first){const quotes=p.evidence.filter(e=>e.proposal_id===x.id).map(e=>e.quote);assert.equal(quotes.length,1);assert.ok(email1.includes(quotes[0]),quotes[0]);}
 let d=await detail();assert.equal(d.negotiation.revision,0);assert.equal(d.assertions.length,0);

 // F2: accept both, one at a time. Each accept is one revision, so 2 in total.
 for(const [index,x] of first.entries()){const r=await call(`/api/cases/${id}/proposals/${x.id}/accept`,'POST',{expectedRevision:index,operation:'add'});assert.equal(r.status,200,JSON.stringify(r.data));}
 d=await detail();assert.equal(d.negotiation.revision,2);assert.equal(d.assertions.length,2);
 const paste=d.sources.find(s=>s.kind==='paste')!;assert.ok(paste);
 for(const a of d.assertions){assert.equal(a.epistemic_type,'counterparty_claim');assert.equal(a.source_id,paste.id);assert.equal(a.status,'active');}

 // Advice for the first interaction: current, not stale.
 const firstAdvice=await generate();assert.equal(firstAdvice.stale,false);assert.equal((await latest())!.stale,false);

 // F3: second email. Proposals appear, revision unchanged, existing advice is stale.
 const email2='Hiring manager: Offer GBP 52,000 annually; deadline 4 October.';
 assert.equal((await call(`/api/cases/${id}/proposals/import`,'POST',{text:email2})).status,200);
 const second=await pending();assert.deepEqual(second.map(x=>`${x.candidate.field}:${x.candidate.value}`).sort(),['base:52000','deadline:4 October']);
 d=await detail();assert.equal(d.negotiation.revision,2);assert.equal(d.assertions.length,2);
 assert.equal((await latest())!.stale,true);

 // F4: correct the base, then record the deadline as a conflict. Revision goes 2 to 3 to 4.
 const base=second.find(x=>x.candidate.field==='base')!,deadline=second.find(x=>x.candidate.field==='deadline')!;
 const oldBase=d.assertions.find(a=>a.field==='base')!,oldDeadline=d.assertions.find(a=>a.field==='deadline')!;
 const correct=await call(`/api/cases/${id}/proposals/${base.id}/accept`,'POST',{expectedRevision:2,operation:'correct',correctAssertionId:oldBase.id,reviewedTargetIds:[oldBase.id]});assert.equal(correct.status,200,JSON.stringify(correct.data));
 const conflict=await call(`/api/cases/${id}/proposals/${deadline.id}/accept`,'POST',{expectedRevision:3,operation:'conflict',reviewedTargetIds:[oldDeadline.id]});assert.equal(conflict.status,200,JSON.stringify(conflict.data));
 d=await detail();assert.equal(d.negotiation.revision,4);
 assert.equal(d.assertions.find(a=>a.id===oldBase.id)!.status,'superseded');
 const activeBase=d.assertions.find(a=>a.field==='base'&&a.status==='active')!;assert.equal(activeBase.value,'52000');assert.equal(activeBase.supersedes_id,oldBase.id);
 const deadlines=d.assertions.filter(a=>a.field==='deadline'&&a.status==='active');assert.equal(deadlines.length,2);
 assert.equal(new Set(deadlines.map(a=>a.conflict_group_id)).size,1);const group=deadlines[0].conflict_group_id!;assert.ok(group);
 assert.equal(d.conflicts.find(c=>c.id===group)!.status,'open');

 // F5: new advice. It asks for clarification, cites both deadlines and states neither date as fact.
 const clarified=await generate();assert.equal(clarified.stale,false);assert.notEqual(clarified.id,firstAdvice.id);
 const content=clarified.content as {situation:string;claims:{text:string;assertion_ids:string[]}[]};
 const conflictClaims=content.claims.filter(c=>deadlines.every(a=>c.assertion_ids.includes(a.id)));assert.ok(conflictClaims.length>0,'a claim cites both deadlines');
 for(const c of conflictClaims){assert.match(c.text,/unresolved|disputed|clarify/i);assert.doesNotMatch(c.text,/\b(4|5)\b|October/i,c.text);}
 // While the conflict is open, no field of the advice may state either date.
 assert.doesNotMatch(JSON.stringify(clarified.content),/\b(?:4|5)(?:st|nd|rd|th)?\s+October\b|\bOctober\s+(?:4|5)\b/i,'advice states a disputed date');
 const history=(await call(`/api/cases/${id}/advice/history`)).data as {id:string;stale:boolean}[];
 assert.equal(history.length,2);assert.equal(history.find(h=>h.id===firstAdvice.id)!.stale,true);assert.equal(history.find(h=>h.id===clarified.id)!.stale,false);
 for(const h of history)assert.ok(!('snapshot' in h),'history carries no snapshot body');

 // F6: the recruiter confirms. A reviewed proposal appears and nothing resolves on its own.
 assert.equal((await call(`/api/cases/${id}/proposals/import`,'POST',{text:'Recruiter confirms 5 October deadline.'})).status,200);
 const confirm=await pending();assert.deepEqual(confirm.map(x=>`${x.candidate.field}:${x.candidate.value}`),['deadline:5 October']);
 d=await detail();assert.equal(d.negotiation.revision,4);assert.equal(d.conflicts.find(c=>c.id===group)!.status,'open');
 assert.equal(d.assertions.filter(a=>a.field==='deadline'&&a.status==='active').length,2);
 assert.equal((await latest())!.stale,true);

 // Isolation: Bob cannot read or change any of it.
 const adviceId=clarified.id as string;
 await stop();await start('bob');
 for(const [path,method,body] of [[`/api/cases/${id}`,'GET',undefined],[`/api/cases/${id}/proposals`,'GET',undefined],[`/api/cases/${id}/advice`,'GET',undefined],[`/api/cases/${id}/advice/history`,'GET',undefined],[`/api/cases/${id}/advice/${adviceId}`,'GET',undefined],[`/api/cases/${id}/proposals/${confirm[0].id}/accept`,'POST',{expectedRevision:4,operation:'add'}]] as const)assert.equal((await call(path,method,body)).status,404,path);
 await stop();await start('alice');
 const after=await detail();assert.equal(after.negotiation.revision,4);assert.equal((await pending()).length,1);
 console.log('PASS: M3 loop F1 to F6 over HTTP with revisions 0, 2, 4, stale advice, open conflict, no auto-resolution and Bob isolation');
}finally{await stop();}
