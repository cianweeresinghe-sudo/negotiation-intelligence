import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../workbook/database';
import {WorkbookError} from '../workbook/service';
import type {ClaimedJob} from '../ingestion/jobs';
import {validateCandidates,ExtractionError,type ExtractionAdapter} from './validate';
export class Proposals {
 constructor(private db:Database,private maxProposals=200,private maxEvidence=1000){if(!Number.isInteger(maxProposals)||maxProposals<1||maxProposals>200||!Number.isInteger(maxEvidence)||maxEvidence<1||maxEvidence>1000)throw new Error('Invalid proposal limits');}
 async list(owner:string,caseId:string){
  if(!z.uuid().safeParse(caseId).success||!z.uuid().safeParse(owner).success||!(await this.db.query('SELECT id FROM cases WHERE id=$1 AND owner_id=$2',[caseId,owner])).rows.length)throw new WorkbookError(404,'Case not found');
  const proposals=(await this.db.query<{id:string;source_id:string;candidate:Record<string,unknown>;status:string;operation:string;target_assertion_ids:string[];base_revision:number}>('SELECT * FROM proposals WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at,candidate_index',[caseId,owner])).rows;
  const evidence=(await this.db.query('SELECT pe.proposal_id,e.* FROM proposal_evidence pe JOIN evidence e ON e.id=pe.evidence_id AND e.case_id=pe.case_id WHERE pe.case_id=$1 AND pe.owner_id=$2',[caseId,owner])).rows;
  const seen=new Map<string,string>();const flagged=proposals.map(p=>{const c=p.candidate,key=JSON.stringify([p.source_id,c.field,c.value,c.currency,c.period,c.epistemic_type]);const duplicate_of=p.status==='pending'?seen.get(key):undefined;if(p.status==='pending'&&!duplicate_of)seen.set(key,p.id);return {...p,duplicate_of:duplicate_of??null};});
  return {proposals:flagged,evidence};
 }
 async extract(owner:string,job:ClaimedJob,adapter:ExtractionAdapter,signal:AbortSignal){
  // Snapshot provenance before extraction; target state is captured when pending
  // proposals are published. Model gets no case/owner/context or write handle.
  const current=(await this.db.query<{revision:number;original_text:string;sensitivity:'private'|'shareable'}>('SELECT c.revision,s.original_text,s.sensitivity FROM cases c JOIN sources s ON s.case_id=c.id AND s.owner_id=c.owner_id WHERE c.id=$1 AND c.owner_id=$2 AND s.id=$3',[job.case_id,owner,job.source_id])).rows[0];if(!current)return false;
  const source=Object.freeze({id:job.source_id,text:current.original_text,sensitivity:current.sensitivity});
  const validated=validateCandidates(await adapter.extract(source,signal),source);
  if(signal.aborted)return false;
  return this.db.transaction(async tx=>{
   const owned=(await tx.query('SELECT id FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE',[job.case_id,owner])).rows[0];if(!owned)return false;
   // Acquire the job lock and fence BEFORE any evidence/proposal write. All
   // subsequent inserts and completion roll back together on error.
   if(signal.aborted)return false;
   const fence=await tx.query("UPDATE ingestion_jobs SET status='complete',lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND case_id=$2 AND owner_id=$3 AND source_id=$4 AND attempt=$5 AND status='running' AND lease_expires_at>now() RETURNING id",[job.id,job.case_id,owner,job.source_id,job.attempt]);
   if(!fence.rows.length)return false;
   const count=(await tx.query<{n:string}>('SELECT count(*)::text AS n FROM proposals WHERE case_id=$1 AND owner_id=$2 AND status=\'pending\'',[job.case_id,owner])).rows[0];
   const evidenceCount=(await tx.query<{n:string}>('SELECT count(*)::text AS n FROM evidence e WHERE e.case_id=$1 AND e.owner_id=$2 AND (EXISTS(SELECT 1 FROM assertions a WHERE a.evidence_id=e.id AND a.case_id=e.case_id) OR EXISTS(SELECT 1 FROM proposal_evidence pe JOIN proposals p ON p.id=pe.proposal_id AND p.case_id=pe.case_id WHERE pe.evidence_id=e.id AND pe.case_id=e.case_id AND p.status=\'pending\'))',[job.case_id,owner])).rows[0];
   if(Number(count.n)+validated.candidates.length>this.maxProposals||Number(evidenceCount.n)+validated.candidates.reduce((n,c)=>n+c.evidence.length,0)>this.maxEvidence)throw new WorkbookError(422,'Proposal limit reached');
   for(const c of validated.candidates){
    const active=(await tx.query<{id:string;value:unknown}>('SELECT id,value FROM assertions WHERE case_id=$1 AND owner_id=$2 AND field=$3 AND status=\'active\' ORDER BY id',[job.case_id,owner,c.field])).rows;
    const id=randomUUID();
    await tx.query('INSERT INTO proposals(id,case_id,owner_id,job_id,source_id,candidate_index,candidate,operation,base_revision,target_assertion_ids) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb)',[id,job.case_id,owner,job.id,job.source_id,c.index,JSON.stringify({...c,evidence:undefined}),active.some(a=>a.value!==c.value)?'conflict':'add',current.revision,JSON.stringify(active.map(a=>a.id))]);
    for(const span of c.evidence){const evidenceId=randomUUID();await tx.query('INSERT INTO evidence(id,case_id,owner_id,source_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7)',[evidenceId,job.case_id,owner,job.source_id,span.quote,span.start,span.end]);await tx.query('INSERT INTO proposal_evidence(proposal_id,evidence_id,source_id,case_id,owner_id) VALUES($1,$2,$3,$4,$5)',[id,evidenceId,job.source_id,job.case_id,owner]);}
   }
   await tx.query('UPDATE ingestion_jobs SET proposal_count=$4,drop_counts=$5::jsonb,advisory_unknowns=$6::jsonb,advisory_conflicts=$7::jsonb WHERE id=$1 AND case_id=$2 AND owner_id=$3',[job.id,job.case_id,owner,validated.candidates.length,JSON.stringify(validated.drops),JSON.stringify(validated.unknowns),JSON.stringify(validated.advisoryConflicts)]);
   await tx.query('UPDATE cases SET material_version=material_version+1 WHERE id=$1 AND owner_id=$2',[job.case_id,owner]);if(signal.aborted)throw new Error('Attempt aborted');return true;
  });
 }
}

// Timeout cancels/fails this attempt. Even if the adapter ignores abort, the
// later publication checks the aborted signal and persisted attempt fence.
export async function runProposalJob(jobs:import('../ingestion/jobs').IngestionJobs,proposals:Proposals,owner:string,adapter:ExtractionAdapter,timeoutMs=30000,caseId?:string){
 jobs.validateTimeout(timeoutMs);const job=await jobs.claim(owner,caseId);if(!job)return false;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([proposals.extract(owner,job,adapter,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new Error('timeout'));controller.abort();},timeoutMs);})]);}
 catch(error){await jobs.finish(owner,job,controller.signal.aborted?'timeout':error instanceof ExtractionError?error.code:error instanceof WorkbookError&&error.status===422?'limit_reached':'processing_failed');return false;}
 finally{clearTimeout(timer);}
}
