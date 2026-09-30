import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const database=process.env.TEST_DATABASE_URL;
if(!database || new URL(database).pathname!=='/workbook_test')throw new Error('Smoke requires the synthetic workbook_test database');
const origin='http://127.0.0.1:3101';
let child:ReturnType<typeof spawn>|undefined;
async function start(user:string){
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3101'],{env:{...process.env,DEMO_USER:user,DATABASE_URL:database,NODE_ENV:'development'},stdio:'ignore'});
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error('Dev server exited');try{const r=await fetch(origin+'/api/cases');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
 throw new Error('Dev server did not become ready');
}
async function stop(){if(!child)return;const exiting=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill('SIGTERM');await exiting;child=undefined;}
async function call(path:string,method='GET',body?:unknown,extra:Record<string,string>={}){
 const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
try{
 await start('alice');
 const created=await call('/api/cases','POST',{title:'Synthetic HTTP walkthrough'});assert.equal(created.status,200);const id=created.data.id;
 const manual={field:'base',value:'50000',currency:'GBP',period:'annual',epistemicType:'counterparty_claim',expectedRevision:0};
 const added=await call(`/api/cases/${id}/entries`,'POST',manual);assert.equal(added.status,200);
 const corrected=await call(`/api/cases/${id}/entries/${added.data.id}`,'PATCH',{...manual,value:'52000',expectedRevision:1});assert.equal(corrected.status,200);
 const stale=await call(`/api/cases/${id}/entries`,'POST',manual);assert.equal(stale.status,409);
 const forged=await call('/api/cases','POST',{title:'Forged',ownerId:'22222222-2222-4222-8222-222222222222'});assert.equal(forged.status,422);
 const header=await call(`/api/cases/${id}`,'GET',undefined,{'x-owner-id':'22222222-2222-4222-8222-222222222222'});assert.equal(header.status,200);
 await stop();await start('alice');const reload=await call(`/api/cases/${id}`);assert.equal(reload.status,200);assert.equal(reload.data.negotiation.revision,2);assert.equal(reload.data.assertions.length,2);
 await stop();await start('bob');
 for(const [path,method,body] of [[`/api/cases/${id}`,'GET',undefined],[`/api/cases/${id}`,'PATCH',{title:'stolen',expectedRevision:2}],[`/api/cases/${id}`,'DELETE',{expectedRevision:2}],[`/api/cases/${id}/entries`,'POST',{...manual,expectedRevision:2}],[`/api/cases/${id}/entries/${corrected.data.id}`,'PATCH',{...manual,expectedRevision:2}],[`/api/cases/${id}/history`,'GET',undefined]] as const){assert.equal((await call(path,method,body)).status,404);}
 assert.equal((await call('/api/cases/'+crypto.randomUUID())).status,404);
 console.log('PASS: real HTTP create/correct/restart persistence, stale writes, forged owner handling and Bob isolation.');
}finally{await stop();}
