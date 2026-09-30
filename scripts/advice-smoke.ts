import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const database=process.env.TEST_DATABASE_URL;
if(!database || new URL(database).pathname!=='/workbook_test')throw new Error('Smoke requires the synthetic workbook_test database');
const origin='http://127.0.0.1:3102';
let child:ReturnType<typeof spawn>|undefined;
async function start(user:string){
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3102'],{env:{...process.env,ALLOW_SYNTHETIC_IDENTITY:'1',DEMO_USER:user,DATABASE_URL:database,NODE_ENV:'development'},stdio:'ignore'});
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
 const created=await call('/api/cases','POST',{title:'Synthetic advice HTTP checks'});assert.equal(created.status,200);const id=created.data.id;
 const root=`/api/cases/${id}/advice`,input={expectedRevision:1,expectedMaterialVersion:1};
 const added=await call(`/api/cases/${id}/entries`,'POST',{field:'base',value:'50000',currency:'GBP',period:'annual',epistemicType:'counterparty_claim',expectedRevision:0});assert.equal(added.status,200);
 const before=await call(`/api/cases/${id}`),events=await call(`/api/cases/${id}/history`);
 const generated=await call(root,'POST',input);assert.equal(generated.status,200,JSON.stringify(generated.data));assert.equal(generated.data.stale,false);const adviceId=generated.data.id;
 assert.equal((await call(root,'POST',input)).data.id,adviceId);
 assert.deepEqual((await call(`/api/cases/${id}`)).data,before.data);assert.deepEqual((await call(`/api/cases/${id}/history`)).data,events.data);
 assert.equal((await call(root,'POST',{...input,ownerId:'22222222-2222-4222-8222-222222222222'})).status,422);
 assert.equal((await call(root,'GET',undefined,{'x-owner-id':'22222222-2222-4222-8222-222222222222'})).status,200);
 const history=(await call(root+'/history')).data;
 await stop();await start('bob');
 for(const [path,method,body] of [[root,'GET',undefined],[root+'/history','GET',undefined],[root+'/'+adviceId,'GET',undefined],[root,'POST',input],[root+'/settings','POST',{...input,includePrivateConstraints:true}]] as const)assert.equal((await call(path,method,body)).status,404,path);
 await stop();await start('alice');assert.deepEqual((await call(root+'/history')).data,history);assert.deepEqual((await call(`/api/cases/${id}`)).data,before.data);
 const imported=await call(`/api/cases/${id}/imports`,'POST',{text:'New interaction: recruiter clarifies the offer.'});assert.equal(imported.status,200);
 assert.equal((await call(root)).data.latest.stale,true);assert.equal((await call(root,'POST',input)).status,409);
 const next={expectedRevision:1,expectedMaterialVersion:2};const regenerated=await call(root,'POST',next);assert.equal(regenerated.status,200);assert.notEqual(regenerated.data.id,adviceId);assert.equal(regenerated.data.stale,false);
 const setting=await call(root+'/settings','POST',{...next,includePrivateConstraints:true});assert.equal(setting.status,200);assert.equal((await call(root)).data.latest.stale,true);
 console.log('PASS: advice HTTP history, idempotency, isolation, forged owner, import staleness and settings');
}finally{await stop();}
