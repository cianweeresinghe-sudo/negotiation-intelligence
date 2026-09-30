import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { postgresDatabase, migrate, appDatabase, type Database } from '../src/workbook/database';
import {Proposals,runProposalJob} from '../src/proposals/service';
import type {ExtractionAdapter} from '../src/proposals/validate';
import {IngestionJobs,runOne} from '../src/ingestion/jobs';
import { Workbook,WorkbookError } from '../src/workbook/service';
import { requireCurrentOwner,DEMO_OWNERS } from '../src/workbook/identity';
import { guardRequest,parseBody } from '../src/workbook/runtime';
import { entryInput,createCaseInput } from '../src/workbook/input';
const server=!!process.env.TEST_DATABASE_URL;
let db:Database,app:Database,w:Workbook;
const A=DEMO_OWNERS.alice,B=DEMO_OWNERS.bob;
const entry={field:'base',value:'50000',currency:'GBP',period:'annual',epistemicType:'counterparty_claim',sensitivity:'private',expectedRevision:0};
before(async()=>{
 if(server){const url=new URL(process.env.TEST_DATABASE_URL!);assert.equal(url.pathname,'/workbook_test');assert.ok(['localhost','127.0.0.1'].includes(url.hostname));db=postgresDatabase(url.toString());}
 else {const pg=new PGlite();db={query:async <T>(sql:string,values?:unknown[])=>sql.includes(';')&&!values ? (await pg.exec(sql),{rows:[] as T[]}) : ({rows:(await pg.query(sql,values)).rows as T[]}),transaction:run=>pg.transaction(tx=>run({query:async <T>(sql:string,values?:unknown[])=>sql.includes(';')&&!values ? (await tx.exec(sql),{rows:[] as T[]}) : ({rows:(await tx.query(sql,values)).rows as T[]})})),close:()=>pg.close()};}
 await migrate(db);await migrate(db);app=appDatabase(db);w=new Workbook(app);
});
after(async()=>{await db.close();});
async function fresh(owner:string=A){return w.create(owner,{title:`Synthetic ${randomUUID()}`});}
async function fails404(p:Promise<unknown>){await assert.rejects(p,(e:unknown)=>e instanceof WorkbookError&&e.status===404);}
test('migrations apply twice and expose scoped schema',async()=>{const r=await db.query('SELECT version FROM schema_migrations');assert.equal(r.rows.length,3);});
test('all owner entry points reject foreign IDs identically',async()=>{
 const c=await fresh(),other=await fresh(B);const added=await w.add(A,c.id,entry);
 assert.ok(!(await w.list(B)).some(x=>x.id===c.id));
 await fails404(w.read(B,c.id));await fails404(w.history(B,c.id));
 await fails404(w.update(B,c.id,{title:'forged',expectedRevision:1}));await fails404(w.remove(B,c.id,1));
 await fails404(w.add(B,c.id,{...entry,expectedRevision:1}));await fails404(w.correct(B,c.id,added.id,{...entry,expectedRevision:1}));
 await fails404(w.correct(B,other.id,added.id,entry));await fails404(w.resolve(B,c.id,randomUUID(),{expectedRevision:1,keepAssertionId:added.id}));
 assert.equal((await w.read(A,c.id)).negotiation.revision,1);
});
test('correction retains original source, supersession and audit after service reload',async()=>{
 const c=await fresh();const old=await w.add(A,c.id,entry);const next=await w.correct(A,c.id,old.id,{...entry,value:'52000',expectedRevision:1,sensitivity:'shareable'});
 const reloaded=await new Workbook(app).read(A,c.id);assert.equal(reloaded.negotiation.revision,2);assert.equal(reloaded.negotiation.material_version,2);
 assert.equal(reloaded.assertions.find(a=>a.id===old.id)?.status,'superseded');assert.equal(reloaded.assertions.find(a=>a.id===next.id)?.supersedes_id,old.id);
 assert.equal(reloaded.assertions.find(a=>a.id===next.id)?.sensitivity,'private');assert.equal(reloaded.sources.length,2);assert.equal((await w.history(A,c.id)).length,3);
 assert.ok(reloaded.sources.some(s=>String(s.original_text).includes('50000')));
});
test('stale writes and failed partial changes leave revision and history unchanged',async()=>{
 const c=await fresh();await w.add(A,c.id,entry);const before=await w.read(A,c.id);const history=await w.history(A,c.id);
 await assert.rejects(w.add(A,c.id,{...entry,field:'note',expectedRevision:0}),(e:unknown)=>e instanceof WorkbookError&&e.status===409);
 await assert.rejects(w.add(A,c.id,{...entry,expectedRevision:1}),(e:unknown)=>e instanceof WorkbookError&&e.status===409);
 assert.deepEqual(await w.read(A,c.id),before);assert.deepEqual(await w.history(A,c.id),history);
});
test('SQL composite foreign keys reject cross-case sources and evidence',async()=>{
 const a=await fresh(),b=await fresh(B);await w.add(A,a.id,entry);const source=(await w.read(A,a.id)).sources[0];
 await assert.rejects(db.query('INSERT INTO evidence(id,case_id,owner_id,source_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,\'x\',0,1)',[randomUUID(),b.id,B,source.id]));
 await assert.rejects(db.query('INSERT INTO sources(id,case_id,owner_id,kind,original_text,checksum,sensitivity) VALUES($1,$2,$3,\'manual\',\'x\',\'hash\',\'private\')',[randomUUID(),a.id,B]));
});
test('append-only event trigger blocks updates/deletes and source originals remain immutable',async()=>{
 const c=await fresh();await w.add(A,c.id,entry);
 await assert.rejects(db.query('UPDATE events SET operation=\'tampered\' WHERE case_id=$1',[c.id]));
 await assert.rejects(db.query('DELETE FROM events WHERE case_id=$1',[c.id]));
 await assert.rejects(db.query('UPDATE sources SET original_text=\'tampered\' WHERE case_id=$1',[c.id]));
});
test('explicit conflict resolution preserves superseded claims and authoritative membership',async()=>{
 const c=await fresh();const first=await w.add(A,c.id,entry);const second=await w.add(A,c.id,{...entry,value:'51000',recordConflict:true,expectedRevision:1});
 const detail=await w.read(A,c.id);assert.equal(detail.conflicts.length,1);assert.equal(detail.assertions.filter(a=>a.status==='active').length,2);
 const conflictId=String(detail.conflicts[0].id);
 await w.resolve(A,c.id,conflictId,{expectedRevision:2,keepAssertionId:second.id});
 const result=await w.read(A,c.id);assert.equal(result.conflicts[0].status,'resolved');assert.equal(result.assertions.find(a=>a.id===first.id)?.status,'superseded');
 assert.ok(result.assertions.every(a=>a.conflict_group_id===conflictId));
 const history=await db.query("SELECT * FROM event_assertion_refs WHERE event_id=$1 AND direction='before'",[result.conflicts[0].resolution_event_id]);assert.equal(history.rows.length,2);
});
test('case deletion cascades every child without orphan history',async()=>{
 const c=await fresh();await w.add(A,c.id,entry);await w.add(A,c.id,{...entry,value:'51000',recordConflict:true,expectedRevision:1});await w.remove(A,c.id,2);await fails404(w.read(A,c.id));
 for(const table of ['assertions','sources','evidence','events','conflicts','event_assertion_refs']){const rows=await db.query(`SELECT * FROM ${table} WHERE case_id=$1`,[c.id]);assert.equal(rows.rows.length,0,table);}
});
test('input rejects forged owner, inference direct writes, floats and oversized text',()=>{
 assert.throws(()=>createCaseInput.parse({title:'Synthetic',ownerId:B}));assert.throws(()=>entryInput.parse({...entry,epistemicType:'ai_inference'}));assert.throws(()=>entryInput.parse({...entry,value:50000}));assert.throws(()=>entryInput.parse({...entry,value:'x'.repeat(2001)}));assert.throws(()=>entryInput.parse({...entry,ownerId:B}));
});
test('dev identity is configured server-side, supports two owners and refuses production',()=>{
 assert.equal(requireCurrentOwner({ALLOW_SYNTHETIC_IDENTITY:'1',NODE_ENV:'development',DEMO_USER:'alice'}),A);assert.equal(requireCurrentOwner({ALLOW_SYNTHETIC_IDENTITY:'1',NODE_ENV:'development',DEMO_USER:'bob'}),B);
 assert.throws(()=>requireCurrentOwner({NODE_ENV:'production',DEMO_USER:'alice'}));assert.throws(()=>requireCurrentOwner({NODE_ENV:'development'}));
});
test('request boundary rejects remote origins and capped bodies',async()=>{
 assert.throws(()=>guardRequest(new Request('http://127.0.0.1:3000/api/cases',{method:'POST',headers:{origin:'https://attacker.example'}})));
 assert.throws(()=>guardRequest(new Request('http://attacker.example/api/cases')));
 await assert.rejects(parseBody(new Request('http://127.0.0.1/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(10001)})),(e:unknown)=>e instanceof WorkbookError&&e.status===413);
});
test('server Postgres concurrency: same revision has exactly one winner',{skip:!server},async()=>{
 const c=await fresh();const results=await Promise.allSettled([w.add(A,c.id,entry),w.add(A,c.id,{...entry,field:'note'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await w.read(A,c.id)).negotiation.revision,1);assert.equal((await w.history(A,c.id)).length,2);
});
test('server Postgres app role cannot update/delete events',{skip:!server},async()=>{
 const c=await fresh();await assert.rejects(app.query('UPDATE events SET operation=\'tampered\' WHERE case_id=$1',[c.id]),(e:unknown)=>(e as {code:string}).code==='42501');
 await assert.rejects(app.query('DELETE FROM events WHERE case_id=$1',[c.id]),(e:unknown)=>(e as {code:string}).code==='42501');
});
test('database rejects cross-case conflict/history links and duplicate uncontested fields',async()=>{
 const a=await fresh(),b=await fresh(B);const aa=await w.add(A,a.id,entry);await w.add(B,b.id,entry);await w.add(B,b.id,{...entry,value:'51000',recordConflict:true,expectedRevision:1});
 const foreign=(await w.read(B,b.id)).conflicts[0];
 await assert.rejects(db.query('UPDATE assertions SET conflict_group_id=$1 WHERE id=$2',[foreign.id,aa.id]));
 const foreignEvent=(await w.history(B,b.id))[0];
 await assert.rejects(db.query('INSERT INTO event_assertion_refs(event_id,assertion_id,case_id,owner_id,direction) VALUES($1,$2,$3,$4,\'after\')',[foreignEvent.id,aa.id,a.id,A]));
 await assert.rejects(db.query('INSERT INTO assertions(id,case_id,owner_id,field,value,currency,period,epistemic_type,sensitivity,source_id,evidence_id) SELECT $1,case_id,owner_id,field,value,currency,period,epistemic_type,sensitivity,source_id,evidence_id FROM assertions WHERE id=$2',[randomUUID(),aa.id]),(e:unknown)=>(e as {code:string}).code==='23505');
});
test('audit failure rolls back inserted assertion, original, evidence and revision',async()=>{
 const c=await fresh();const before=await w.read(A,c.id),history=await w.history(A,c.id);
 const fault:Database={...app,transaction:run=>app.transaction(tx=>run({query:async <T>(sql:string,values?:unknown[])=>{if(sql.startsWith('INSERT INTO events'))throw new Error('synthetic fault');return tx.query<T>(sql,values);}}))};
 await assert.rejects(new Workbook(fault).add(A,c.id,entry),/synthetic fault/);
 assert.deepEqual(await w.read(A,c.id),before);assert.deepEqual(await w.history(A,c.id),history);
});

test('origin guard handles Next URL normalization without permitting remote hosts',()=>{
 assert.doesNotThrow(()=>guardRequest(new Request('http://localhost:3101/api/cases',{method:'POST',headers:{host:'127.0.0.1:3101',origin:'http://127.0.0.1:3101'}})));
 assert.throws(()=>guardRequest(new Request('http://localhost:3101/api/cases',{method:'POST',headers:{host:'attacker.example',origin:'http://attacker.example'}})));
});

test('server Postgres app role cannot rewrite assertion values/evidence/owner',{skip:!server},async()=>{
 const c=await fresh();const a=await w.add(A,c.id,entry);
 for(const sql of ["UPDATE assertions SET value='\"tampered\"'::jsonb WHERE id=$1","UPDATE assertions SET owner_id=owner_id WHERE id=$1","UPDATE assertions SET evidence_id=evidence_id WHERE id=$1"])
  await assert.rejects(app.query(sql,[a.id]),(e:unknown)=>(e as {code:string}).code==='42501');
});
test('correction in a conflict preserves a single authoritative membership chain',async()=>{
 const c=await fresh();const first=await w.add(A,c.id,entry);await w.add(A,c.id,{...entry,value:'51000',recordConflict:true,expectedRevision:1});
 const next=await w.correct(A,c.id,first.id,{...entry,value:'52000',expectedRevision:2});
 const result=await w.read(A,c.id);const group=String(result.conflicts[0].id);
 assert.ok(result.assertions.every(a=>a.conflict_group_id===group));assert.equal(result.assertions.find(a=>a.id===next.id)?.supersedes_id,first.id);
});

 test('invalid, stale and repeated conflict resolution leave state and history unchanged',async()=>{
 const c=await fresh();const first=await w.add(A,c.id,entry);await w.add(A,c.id,{...entry,value:'51000',recordConflict:true,expectedRevision:1});
 const before=await w.read(A,c.id), history=await w.history(A,c.id),group=String(before.conflicts[0].id);
 await assert.rejects(w.resolve(A,c.id,group,{expectedRevision:1,keepAssertionId:first.id}),(e:unknown)=>e instanceof WorkbookError&&e.status===409);
 await fails404(w.resolve(A,c.id,group,{expectedRevision:2,keepAssertionId:randomUUID()}));
 assert.deepEqual(await w.read(A,c.id),before);assert.deepEqual(await w.history(A,c.id),history);
 await w.resolve(A,c.id,group,{expectedRevision:2,keepAssertionId:first.id});
 const resolved=await w.read(A,c.id),resolvedHistory=await w.history(A,c.id);
 await fails404(w.resolve(A,c.id,group,{expectedRevision:3,keepAssertionId:first.id}));
 assert.deepEqual(await w.read(A,c.id),resolved);assert.deepEqual(await w.history(A,c.id),resolvedHistory);
});
test('stale deletion preserves case, originals and history',async()=>{
 const c=await fresh();await w.add(A,c.id,entry);const before=await w.read(A,c.id),history=await w.history(A,c.id);
 await assert.rejects(w.remove(A,c.id,0),(e:unknown)=>e instanceof WorkbookError&&e.status===409);
 assert.deepEqual(await w.read(A,c.id),before);assert.deepEqual(await w.history(A,c.id),history);
});
test('request boundary rejects missing Origin and non-JSON content',async()=>{
 assert.throws(()=>guardRequest(new Request('http://127.0.0.1/api/cases',{method:'POST'})),(e:unknown)=>e instanceof WorkbookError&&e.status===403);
 await assert.rejects(parseBody(new Request('http://127.0.0.1/api/cases',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})),(e:unknown)=>e instanceof WorkbookError&&e.status===422);
});

test('migration discovery orders numeric versions, preserves checksums and rolls back failures',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'migration-test-'));const pg=new PGlite();
 const isolated:Database={query:async <T>(sql:string,values?:unknown[])=>({rows:(await pg.query(sql,values)).rows as T[]}),transaction:run=>pg.transaction(tx=>run({query:async <T>(sql:string,values?:unknown[])=>({rows:(await tx.query(sql,values)).rows as T[]})})),close:()=>pg.close()};
 try{
 writeFileSync(join(dir,'10_later.sql'),'ALTER TABLE migration_fixture ADD COLUMN next_value integer');
 writeFileSync(join(dir,'2_first.sql'),'CREATE TABLE migration_fixture(id integer)');
 await migrate(isolated,dir);await migrate(isolated,dir);
 assert.deepEqual((await isolated.query<{version:number}>('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version),[2,10]);
 writeFileSync(join(dir,'11_bad.sql'),'ALTER TABLE nonexistent_table ADD COLUMN bad integer');
 await assert.rejects(migrate(isolated,dir));assert.equal((await isolated.query('SELECT * FROM schema_migrations')).rows.length,2);
 rmSync(join(dir,'11_bad.sql'));writeFileSync(join(dir,'2_first.sql'),'CREATE TABLE changed(id integer)');
 await assert.rejects(migrate(isolated,dir),/checksum changed/);
 writeFileSync(join(dir,'2_first.sql'),'CREATE TABLE migration_fixture(id integer)');
 writeFileSync(join(dir,'02_duplicate.sql'),'SELECT 1');await assert.rejects(migrate(isolated,dir),/Duplicate migration/);
 rmSync(join(dir,'02_duplicate.sql'));writeFileSync(join(dir,'1_backfill.sql'),'SELECT 1');await assert.rejects(migrate(isolated,dir),/before applied/);
 rmSync(join(dir,'1_backfill.sql'));rmSync(join(dir,'10_later.sql'));await assert.rejects(migrate(isolated,dir),/missing/);
 }finally{await isolated.close();rmSync(dir,{recursive:true,force:true});}
});

test('pasted text is private, idempotent and owner scoped without accepted-state writes',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app);const before=await w.read(A,c.id),history=await w.history(A,c.id);
 const one=await jobs.importText(A,c.id,{text:'Synthetic offer 😀 £50000'}),two=await jobs.importText(A,c.id,{text:'Synthetic offer 😀 £50000'});
 assert.equal(one.id,two.id);assert.equal(one.source_id,two.source_id);assert.equal((await jobs.list(A,c.id)).length,1);
 const after=await w.read(A,c.id);assert.equal(after.sources.length,1);assert.equal(after.sources[0].sensitivity,'private');assert.equal(after.sources[0].original_text,'Synthetic offer 😀 £50000');
 assert.deepEqual(after.assertions,before.assertions);assert.deepEqual(after.negotiation,before.negotiation);assert.deepEqual(await w.history(A,c.id),history);
 await fails404(jobs.list(B,c.id));await fails404(jobs.importText(B,c.id,{text:'forged'}));
 await assert.rejects(jobs.importText(A,c.id,{text:'x',ownerId:B}));
});
test('persisted leases resume after restart and fence superseded workers',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-restart');const queued=await jobs.importText(A,c.id,{text:randomUUID()});
 const first=await jobs.claim(A);assert.ok(first);assert.equal(first.id,queued.id);
 await db.query("UPDATE ingestion_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[first.id]);
 const restarted=new IngestionJobs(app,'test-restart'),second=await restarted.claim(A);assert.ok(second);assert.equal(second.id,first.id);assert.equal(second.attempt,2);
 assert.equal(await jobs.finish(A,first),false);assert.equal(await restarted.finish(A,second),true);
 assert.equal((await restarted.list(A,c.id))[0].status,'complete');assert.equal(await restarted.claim(A),undefined);
 assert.equal((await w.read(A,c.id)).sources.length,1);
});
test('failed processing retries to configured cap and timeout preserves saved source',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-retry',3);await jobs.importText(A,c.id,{text:randomUUID()});
 for(let i=0;i<3;i++)assert.equal(await runOne(jobs,A,async()=>{throw new Error('synthetic failure');}),true);
 assert.equal(await jobs.claim(A),undefined);const state=(await jobs.list(A,c.id))[0];assert.equal(state.status,'failed');assert.equal(state.attempt,3);
 const timeout=new IngestionJobs(app,'test-timeout');await timeout.importText(A,c.id,{text:randomUUID()});
 await runOne(timeout,A,async(_s,signal)=>new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve())),1);
 const row=(await db.query<{error_code:string}>('SELECT error_code FROM ingestion_jobs WHERE case_id=$1 AND extractor_version=$2',[c.id,'test-timeout'])).rows[0];assert.equal(row.error_code,'timeout');assert.equal((await w.read(A,c.id)).negotiation.revision,0);
});
test('late completion after deletion never recreates sources/jobs',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-delete');await jobs.importText(A,c.id,{text:randomUUID()});const job=await jobs.claim(A);assert.ok(job);
 await w.remove(A,c.id,0);assert.equal(await jobs.finish(A,job),false);
 for(const table of ['sources','ingestion_jobs'])assert.equal((await db.query(`SELECT id FROM ${table} WHERE case_id=$1`,[c.id])).rows.length,0);
 await assert.rejects(db.query("INSERT INTO ingestion_jobs(id,case_id,owner_id,source_id,idempotency_key,extractor_version) VALUES($1,$2,$3,$4,'late','v1')",[randomUUID(),c.id,A,job.source_id]));
});
test('paste limits count Unicode code points and strict inputs reject files',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-limits');
 await jobs.importText(A,c.id,{text:'😀'.repeat(100000)});
 await assert.rejects(jobs.importText(A,c.id,{text:'😀'.repeat(100001)}));
 await assert.rejects(jobs.importText(A,c.id,{text:'x',file:'unsupported.pdf'}));
});

test('server Postgres workers claim a queued job only once',{skip:!server},async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-parallel-claim');await jobs.importText(A,c.id,{text:randomUUID()});await jobs.importText(A,c.id,{text:randomUUID()});
 const claimed=await Promise.all([jobs.claim(A,c.id),jobs.claim(A,c.id),jobs.claim(A,c.id)]);assert.equal(claimed.filter(Boolean).length,2);assert.equal(new Set(claimed.filter(Boolean).map(j=>j!.id)).size,2);
 const job=claimed.find(Boolean)!;assert.equal(await jobs.finish(B,job),false);assert.equal((await jobs.list(A,c.id))[0].status,'running');assert.equal(await jobs.finish(A,job),true);
});

test('worker configuration rejects timeout at or beyond lease and empty content',async()=>{
 const jobs=new IngestionJobs(app,'test-config',3,100);
 await assert.rejects(runOne(jobs,A,async()=>{},100),/below lease/);
 await assert.rejects(runOne(jobs,A,async()=>{},101),/below lease/);
 const c=await fresh();await assert.rejects(jobs.importText(A,c.id,{text:'  \n\t'}));
});

test('source count and byte caps reject new content but preserve duplicate access',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-caps',3,60000,100000,2,10);
 const first=await jobs.importText(A,c.id,{text:'12345'});await jobs.importText(A,c.id,{text:'67890'});
 await assert.rejects(jobs.importText(A,c.id,{text:'third'}),(e:unknown)=>e instanceof WorkbookError&&e.status===422);
 assert.equal((await jobs.importText(A,c.id,{text:'12345'})).id,first.id);assert.equal((await jobs.list(A,c.id)).length,2);
 const other=await fresh();await assert.rejects(jobs.importText(A,other.id,{text:'12345678901'}),(e:unknown)=>e instanceof WorkbookError&&e.status===422);
 assert.equal((await w.read(A,other.id)).sources.length,0);
 await assert.rejects(jobs.importText(A,c.id,{text:'bad\0text'}));
});
test('import body cap permits worst-case escaped code points and rejects larger transport',async()=>{
 const escaped='{"text":"'+'\\ud83d\\ude00'.repeat(100000)+'"}';
 const parsed=await parseBody(new Request('http://127.0.0.1/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:escaped}),1300000);
 assert.equal(Array.from((parsed as {text:string}).text).length,100000);
 await assert.rejects(parseBody(new Request('http://127.0.0.1/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(1300001)}),1300000),(e:unknown)=>e instanceof WorkbookError&&e.status===413);
});

const proposalAdapter:ExtractionAdapter={async extract(s){return {source_id:s.id,base_revision:999,candidates:[{field:'base',value:'52000',currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Synthetic quote.',sensitivity:'shareable',evidence:[{source_id:s.id,quote:'£52,000 annually'}]}],unknowns:[],conflicts:[]};}};
test('proposal extraction publishes evidence once without accepted writes or raw output',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-proposals'),proposals=new Proposals(app);await jobs.importText(A,c.id,{text:'😀 £52,000 annually'});
 const before=await w.read(A,c.id),history=await w.history(A,c.id);const job=await jobs.claim(A,c.id);assert.ok(job);
 assert.equal(await proposals.extract(A,job,proposalAdapter,new AbortController().signal),true);
 const published=await proposals.list(A,c.id),after=await w.read(A,c.id);assert.equal(published.proposals.length,1);assert.equal(published.evidence.length,1);
 assert.deepEqual(after.assertions,before.assertions);assert.equal(after.negotiation.revision,0);assert.equal(after.negotiation.material_version,1);assert.deepEqual(await w.history(A,c.id),history);
 const span=published.evidence[0] as {quote:string;start_offset:number;end_offset:number};assert.equal(Array.from(job.original_text).slice(span.start_offset,span.end_offset).join(''),span.quote);
 assert.equal(await proposals.extract(A,job,proposalAdapter,new AbortController().signal),false);assert.deepEqual(await proposals.list(A,c.id),published);assert.equal((await w.read(A,c.id)).negotiation.material_version,1);await fails404(proposals.list(B,c.id));
});
test('timed-out and superseded extraction outputs cannot publish proposals',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-late'),proposals=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});
 let deliver!:()=>void;let reached!:()=>void;const started=new Promise<void>(r=>{reached=r;});
 const late:ExtractionAdapter={async extract(s){reached();await new Promise<void>(r=>{deliver=r;});return proposalAdapter.extract(s,new AbortController().signal);}};
 let latePublish!:Promise<boolean>;const tracked:Proposals=Object.create(proposals);tracked.extract=(...args:Parameters<Proposals['extract']>)=>{latePublish=proposals.extract(...args);return latePublish;};
 const running=runProposalJob(jobs,tracked,A,late,5,c.id);await started;await running;
 const reclaimed=await jobs.claim(A,c.id);assert.ok(reclaimed);deliver();assert.equal(await latePublish,false);assert.equal((await proposals.list(A,c.id)).proposals.length,0);
 await proposals.extract(A,reclaimed,proposalAdapter,new AbortController().signal);assert.equal((await proposals.list(A,c.id)).proposals.length,1);
});
test('deleted case rejects late proposal completion and cascades proposal evidence',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-proposal-delete'),proposals=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);
 await proposals.extract(A,job,proposalAdapter,new AbortController().signal);await w.remove(A,c.id,0);assert.equal(await proposals.extract(A,job,proposalAdapter,new AbortController().signal),false);
 for(const table of ['proposals','proposal_evidence','ingestion_jobs','sources','evidence'])assert.equal((await db.query(`SELECT * FROM ${table} WHERE case_id=$1`,[c.id])).rows.length,0);
});
test('proposal caps roll back completion and permit retry after original remains saved',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-proposal-caps'),limited=new Proposals(app,1,1);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);
 const two:ExtractionAdapter={async extract(s){const raw=await proposalAdapter.extract(s,new AbortController().signal) as {candidates:unknown[]};return {...raw,candidates:[...raw.candidates,{...raw.candidates[0] as Record<string,unknown>,field:'note',value:'£52,000 annually',currency:null,period:null}]};}};
 await assert.rejects(limited.extract(A,job,two,new AbortController().signal));assert.equal((await limited.list(A,c.id)).proposals.length,0);assert.equal((await jobs.list(A,c.id))[0].status,'running');assert.equal((await w.read(A,c.id)).negotiation.material_version,0);
 assert.equal(await limited.extract(A,job,proposalAdapter,new AbortController().signal),true);assert.equal(await limited.extract(A,job,proposalAdapter,new AbortController().signal),false);
});
test('zero valid proposals completes with exact dropped count and no accepted writes',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-zero'),p=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);
 const bad:ExtractionAdapter={async extract(s){const raw=await proposalAdapter.extract(s,new AbortController().signal) as {candidates:Record<string,unknown>[]};return {...raw,candidates:raw.candidates.map(c=>({...c,value:'200000'}))};}};
 await p.extract(A,job,bad,new AbortController().signal);const row=(await db.query<{status:string;proposal_count:number;drop_counts:unknown}>('SELECT status,proposal_count,drop_counts FROM ingestion_jobs WHERE id=$1',[job.id])).rows[0];assert.equal(row.status,'complete');assert.equal(row.proposal_count,0);assert.deepEqual(row.drop_counts,{unsupported_value:1});assert.equal((await w.read(A,c.id)).assertions.length,0);
});
test('server Postgres proposal candidates/evidence/job links are immutable to app role',{skip:!server},async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-proposal-grants'),p=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);await p.extract(A,job,proposalAdapter,new AbortController().signal);
 for(const column of ['candidate','source_id','job_id'])await assert.rejects(app.query(`UPDATE proposals SET ${column}=${column} WHERE case_id=$1`,[c.id]),(e:unknown)=>(e as {code:string}).code==='42501');
 await assert.rejects(app.query('UPDATE proposal_evidence SET evidence_id=evidence_id WHERE case_id=$1',[c.id]),(e:unknown)=>(e as {code:string}).code==='42501');
});

test('wrong-source batch fails safely with no partial proposal or evidence writes',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-wrong-source'),p=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});
 const before=await w.read(A,c.id);const wrong:ExtractionAdapter={async extract(s){return {...await proposalAdapter.extract(s,new AbortController().signal) as Record<string,unknown>,source_id:randomUUID()};}};
 assert.equal(await runProposalJob(jobs,p,A,wrong,30000,c.id),false);assert.deepEqual(await w.read(A,c.id),before);assert.equal((await p.list(A,c.id)).proposals.length,0);
 assert.equal((await db.query<{error_code:string}>('SELECT error_code FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2',[c.id,A])).rows[0].error_code,'wrong_source');
});

test('DB attempt fence rejects superseded worker with a fresh non-aborted signal',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-direct-fence'),p=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});const first=await jobs.claim(A,c.id);assert.ok(first);
 await db.query("UPDATE ingestion_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[first.id]);const second=await jobs.claim(A,c.id);assert.ok(second);
 assert.equal(await p.extract(A,first,proposalAdapter,new AbortController().signal),false);assert.equal((await p.list(A,c.id)).proposals.length,0);assert.equal((await w.read(A,c.id)).negotiation.material_version,0);
 assert.equal(await p.extract(A,second,proposalAdapter,new AbortController().signal),true);
});
test('proposal target set and base revision are persisted for explicit later review',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-targets'),p=new Proposals(app);const original=await w.add(A,c.id,entry);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);await p.extract(A,job,proposalAdapter,new AbortController().signal);
 const conflict=(await p.list(A,c.id)).proposals[0] as {operation:string;target_assertion_ids:string[];base_revision:number};assert.equal(conflict.operation,'conflict');assert.deepEqual(conflict.target_assertion_ids,[original.id]);assert.equal(conflict.base_revision,1);
 const blank=await fresh();await jobs.importText(A,blank.id,{text:'£52,000 annually'});const empty=await jobs.claim(A,blank.id);assert.ok(empty);await p.extract(A,empty,proposalAdapter,new AbortController().signal);const added=(await p.list(A,blank.id)).proposals[0] as typeof conflict;assert.equal(added.operation,'add');assert.deepEqual(added.target_assertion_ids,[]);assert.equal(added.base_revision,0);
 const same=await fresh();const active=await w.add(A,same.id,{...entry,value:'52000'});await jobs.importText(A,same.id,{text:'£52,000 annually'});const equal=await jobs.claim(A,same.id);assert.ok(equal);await p.extract(A,equal,proposalAdapter,new AbortController().signal);const confirming=(await p.list(A,same.id)).proposals[0] as typeof conflict;assert.equal(confirming.operation,'add');assert.deepEqual(confirming.target_assertion_ids,[active.id]);
});

test('proposal review status requires accepted link and decisions cannot be replayed',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-decision-integrity'),p=new Proposals(app);await jobs.importText(A,c.id,{text:'£52,000 annually'});const job=await jobs.claim(A,c.id);assert.ok(job);await p.extract(A,job,proposalAdapter,new AbortController().signal);
 const id=(await db.query<{id:string}>('SELECT id FROM proposals WHERE case_id=$1',[c.id])).rows[0].id;
 await assert.rejects(app.query("UPDATE proposals SET status='accepted' WHERE id=$1",[id]));
 await app.query("UPDATE proposals SET status='rejected',decision='{}'::jsonb WHERE id=$1",[id]);
 await assert.rejects(app.query("UPDATE proposals SET status='pending' WHERE id=$1",[id]),/proposal decision is final/);
});
test('limit and deterministic validation failures are not automatically retried',async()=>{
 const c=await fresh(),jobs=new IngestionJobs(app,'test-terminal'),p=new Proposals(app,1,1);await jobs.importText(A,c.id,{text:'£52,000 annually'});
 const two:ExtractionAdapter={async extract(s){const raw=await proposalAdapter.extract(s,new AbortController().signal) as {candidates:Record<string,unknown>[]};return {...raw,candidates:[...raw.candidates,{...raw.candidates[0],field:'note',value:'£52,000 annually',currency:null,period:null}]};}};
 assert.equal(await runProposalJob(jobs,p,A,two,30000,c.id),false);assert.equal(await jobs.claim(A,c.id),undefined);
 assert.equal((await db.query<{error_code:string}>('SELECT error_code FROM ingestion_jobs WHERE case_id=$1',[c.id])).rows[0].error_code,'limit_reached');
});
