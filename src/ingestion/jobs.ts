import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../workbook/database';
import {WorkbookError} from '../workbook/service';
export const pasteInput=z.object({label:z.string().trim().min(1).max(60).refine(s=>!/[\x00-\x1f\x7f]/.test(s),'Control characters are unsupported').optional(),text:z.string().min(1).refine(s=>!s.includes('\0'),'NUL is unsupported').refine(s=>s.trim().length>0,'Text required').refine(s=>Array.from(s).length<=100000,'Text limit exceeded')}).strict();
export type Job={id:string;case_id:string;owner_id:string;source_id:string;status:string;attempt:number;extractor_version:string};
export type ClaimedJob=Job&{original_text:string;sensitivity:'private'|'shareable'};
export class IngestionJobs {
 constructor(private db:Database,private version='text-foundation-v1',private maxAttempts=3,private leaseMs=60000,private maxText=100000,private maxSources=20,private maxBytes=2097152){
  if(!/^[a-zA-Z0-9._-]{1,80}$/.test(version)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10||!Number.isInteger(leaseMs)||leaseMs<1||leaseMs>300000||!Number.isInteger(maxText)||maxText<1||maxText>100000||!Number.isInteger(maxSources)||maxSources<1||maxSources>100||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>10485760)throw new Error('Invalid job configuration');
 }
 async importText(owner:string,caseId:string,raw:unknown){
  const input=pasteInput.parse(raw);
  if(Array.from(input.text).length>this.maxText)throw new WorkbookError(422,'Text limit exceeded');
  return this.db.transaction(async tx=>{
   if(!z.uuid().safeParse(caseId).success||!z.uuid().safeParse(owner).success)throw new WorkbookError(404,'Case not found');
   const owned=await tx.query('SELECT id FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE',[caseId,owner]);
   if(!owned.rows.length)throw new WorkbookError(404,'Case not found');
   const checksum=createHash('sha256').update(input.text,'utf8').digest('hex');
   let source=(await tx.query<{id:string}>("SELECT id FROM sources WHERE case_id=$1 AND owner_id=$2 AND checksum=$3 AND kind='paste'",[caseId,owner,checksum])).rows[0];
   if(!source){
    const usage=(await tx.query<{n:string;bytes:string}>("SELECT count(*)::text AS n,coalesce(sum(octet_length(original_text)),0)::text AS bytes FROM sources WHERE case_id=$1 AND owner_id=$2 AND kind='paste'",[caseId,owner])).rows[0];
    if(Number(usage.n)>=this.maxSources||Number(usage.bytes)+Buffer.byteLength(input.text,'utf8')>this.maxBytes)throw new WorkbookError(422,'Case source limit reached');
    source={id:randomUUID()};await tx.query("INSERT INTO sources(id,case_id,owner_id,kind,original_text,checksum,sensitivity,label) VALUES($1,$2,$3,'paste',$4,$5,'private',$6)",[source.id,caseId,owner,input.text,checksum,input.label??`Pasted text ${Number(usage.n)+1}`]);}
   const key=checksum+':'+this.version;
   const existing=(await tx.query<Job>('SELECT * FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2 AND idempotency_key=$3',[caseId,owner,key])).rows[0];if(existing)return existing;
   const count=(await tx.query<{n:string}>('SELECT count(*)::text AS n FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2',[caseId,owner])).rows[0];if(Number(count.n)>=60)throw new WorkbookError(422,'Case job limit reached');
   await tx.query('INSERT INTO ingestion_jobs(id,case_id,owner_id,source_id,idempotency_key,extractor_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(case_id,idempotency_key) DO NOTHING',[randomUUID(),caseId,owner,source.id,key,this.version]);
   await tx.query('UPDATE cases SET material_version=material_version+1 WHERE id=$1 AND owner_id=$2',[caseId,owner]);
   return (await tx.query<Job>('SELECT * FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2 AND idempotency_key=$3',[caseId,owner,key])).rows[0];
  });
 }
 async list(owner:string,caseId:string){
  if(!z.uuid().safeParse(caseId).success||!z.uuid().safeParse(owner).success)throw new WorkbookError(404,'Case not found');
  if(!(await this.db.query('SELECT id FROM cases WHERE id=$1 AND owner_id=$2',[caseId,owner])).rows.length)throw new WorkbookError(404,'Case not found');
  return (await this.db.query<Job>('SELECT * FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at,id',[caseId,owner])).rows;
 }
 async claim(owner:string,caseId?:string):Promise<ClaimedJob|undefined>{
  z.uuid().parse(owner);if(caseId!==undefined)z.uuid().parse(caseId);
  return this.db.transaction(async tx=>{
   // Expired workers are fenced by the incremented attempt. Terminal exhaustion
   // remains inspectable; importing duplicate text cannot reset the attempt cap.
   await tx.query("UPDATE ingestion_jobs SET status='failed',lease_expires_at=NULL,error_code='attempts_exhausted',updated_at=now() WHERE owner_id=$1 AND extractor_version=$2 AND status='running' AND lease_expires_at<=now() AND attempt >= $3 AND ($4::uuid IS NULL OR case_id=$4)",[owner,this.version,this.maxAttempts,caseId??null]);
   const found=(await tx.query<Job>("SELECT * FROM ingestion_jobs WHERE owner_id=$1 AND extractor_version=$2 AND attempt<$3 AND (status='queued' OR (status='failed' AND coalesce(error_code,'') NOT IN ('invalid_response','wrong_source','limit_reached')) OR (status='running' AND lease_expires_at<=now())) AND ($4::uuid IS NULL OR case_id=$4) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[owner,this.version,this.maxAttempts,caseId??null])).rows[0];
   if(!found)return;
   const job=(await tx.query<Job>("UPDATE ingestion_jobs SET status='running',attempt=attempt+1,lease_expires_at=now()+($3::integer * interval '1 millisecond'),error_code=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *",[found.id,owner,this.leaseMs])).rows[0];
   const source=(await tx.query<{original_text:string;sensitivity:'private'|'shareable'}>('SELECT original_text,sensitivity FROM sources WHERE id=$1 AND case_id=$2 AND owner_id=$3',[job.source_id,job.case_id,owner])).rows[0];
   return {...job,...source};
  });
 }
 validateTimeout(timeoutMs:number){if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||timeoutMs>=this.leaseMs)throw new Error('Timeout must be below lease');}
 async finish(owner:string,job:Job,error?:'processing_failed'|'timeout'|'invalid_response'|'wrong_source'|'limit_reached'){
  // Worker output cannot create or update accepted state. M2b will add validated
  // proposals inside this same fenced transaction, never after completion.
  const result=await this.db.query("UPDATE ingestion_jobs SET status=$4,lease_expires_at=NULL,error_code=$5,updated_at=now() WHERE id=$1 AND owner_id=$2 AND attempt=$3 AND status='running' AND lease_expires_at>now() RETURNING id",[job.id,owner,job.attempt,error?'failed':'complete',error??null]);
  return result.rows.length===1;
 }
}
export async function runOne(jobs:IngestionJobs,owner:string,processSource:(source:ClaimedJob,signal:AbortSignal)=>Promise<void>,timeoutMs=30000,caseId?:string){
 jobs.validateTimeout(timeoutMs);
 const job=await jobs.claim(owner,caseId);if(!job)return false;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([processSource(job,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error('timeout'));controller.abort();},timeoutMs);})]);
  return await jobs.finish(owner,job);
 }catch{ return await jobs.finish(owner,job,controller.signal.aborted?'timeout':'processing_failed'); }
 finally{clearTimeout(timer);}
}

export function configuredJobs(db:Database,env:Record<string,string|undefined>=process.env){
 return new IngestionJobs(db,env.INGESTION_EXTRACTOR_VERSION??'text-foundation-v1',Number(env.INGESTION_MAX_ATTEMPTS??3),Number(env.INGESTION_LEASE_MS??60000),Number(env.INGESTION_TEXT_LIMIT??100000),Number(env.INGESTION_SOURCE_LIMIT??20),Number(env.INGESTION_BYTE_LIMIT??2097152));
}
