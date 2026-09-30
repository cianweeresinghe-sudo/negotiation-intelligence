import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database, Sql } from './database';
import { createCaseInput, updateCaseInput, entryInput, resolveInput, revision, type EntryInput } from './input';
export class WorkbookError extends Error { constructor(public status: number, message: string) { super(message); } }
type CaseRow = { id: string; owner_id: string; title: string; revision: number; material_version: number; status: string };
type Assertion = { id: string; field: string; value: string; currency: string|null; period:string|null; status:string; sensitivity:string; source_id:string; evidence_id:string; conflict_group_id:string|null; supersedes_id:string|null };
const ownerSchema = z.uuid();
export class Workbook {
 constructor(private db: Database) {}
 private async owned(tx: Sql, ownerId: string, caseId: string, lock=false): Promise<CaseRow> {
  if (!ownerSchema.safeParse(ownerId).success || !ownerSchema.safeParse(caseId).success) throw new WorkbookError(404,'Case not found');
  const result = await tx.query<CaseRow>(`SELECT * FROM cases WHERE id=$1 AND owner_id=$2${lock ? ' FOR UPDATE' : ''}`, [caseId,ownerId]);
  if (!result.rows[0]) throw new WorkbookError(404,'Case not found'); return result.rows[0];
 }
 async list(ownerId: string) { ownerSchema.parse(ownerId); return (await this.db.query<CaseRow>('SELECT * FROM cases WHERE owner_id=$1 ORDER BY created_at DESC', [ownerId])).rows; }
 async create(ownerId: string, raw: unknown) {
  ownerSchema.parse(ownerId); const input=createCaseInput.parse(raw); const id=randomUUID();
  return this.db.transaction(async tx => {
   await tx.query('INSERT INTO owners(id) VALUES($1) ON CONFLICT DO NOTHING',[ownerId]);
   const result=await tx.query<CaseRow>('INSERT INTO cases(id,owner_id,title) VALUES($1,$2,$3) RETURNING *',[id,ownerId,input.title]);
   await this.event(tx,ownerId,id,0,'create_case','case_created',[],[id]); return result.rows[0];
  });
 }
 async read(ownerId: string, caseId: string) {
  return this.db.transaction(async tx => {
   const negotiation=await this.owned(tx,ownerId,caseId,true);
   const assertions=await tx.query<Assertion>('SELECT * FROM assertions WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at,id',[caseId,ownerId]);
   const sources=await tx.query('SELECT * FROM sources WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at,id',[caseId,ownerId]);
   const evidence=await tx.query('SELECT * FROM evidence WHERE case_id=$1 AND owner_id=$2',[caseId,ownerId]);
   const conflicts=await tx.query('SELECT * FROM conflicts WHERE case_id=$1 AND owner_id=$2',[caseId,ownerId]);
   return { negotiation, assertions:assertions.rows, sources:sources.rows, evidence:evidence.rows, conflicts:conflicts.rows };
  });
 }
 async history(ownerId: string, caseId: string) {
  await this.owned(this.db,ownerId,caseId);
  return (await this.db.query('SELECT * FROM events WHERE case_id=$1 AND owner_id=$2 ORDER BY revision,created_at',[caseId,ownerId])).rows;
 }
 // One revision/material bump per successful accepted-state transaction.
 private async applyChange<T>(ownerId:string,caseId:string,expected:number,run:(tx:Sql,next:number)=>Promise<T>) {
  revision.parse(expected);
  return this.db.transaction(async tx => {
   const current=await this.owned(tx,ownerId,caseId,true);
   if(current.revision!==expected) throw new WorkbookError(409,'Case changed; reload before saving');
   const next=expected+1;
   await tx.query('UPDATE cases SET revision=$3,material_version=material_version+1,updated_at=now() WHERE id=$1 AND owner_id=$2',[caseId,ownerId,next]);
   return run(tx,next);
  });
 }
 private async event(tx:Sql,owner:string,caseId:string,rev:number,op:string,reason:string,before:string[],after:string[],id=randomUUID()) {
  await tx.query('INSERT INTO events(id,case_id,owner_id,actor_id,revision,operation,reason,before_ids,after_ids) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8)',[id,caseId,owner,rev,op,reason,before,after]);
  if(op!=='create_case' && op!=='update_case') {
   for(const [direction,refs] of [['before',before],['after',after]] as const) for(const assertionId of refs)
    await tx.query('INSERT INTO event_assertion_refs(event_id,assertion_id,case_id,owner_id,direction) VALUES($1,$2,$3,$4,$5)',[id,assertionId,caseId,owner,direction]);
  }
  return id;
 }
 async update(owner:string,caseId:string,raw:unknown) {
  const input=updateCaseInput.parse(raw);return this.applyChange(owner,caseId,input.expectedRevision,async(tx,next)=>{
   await tx.query('UPDATE cases SET title=$3 WHERE id=$1 AND owner_id=$2',[caseId,owner,input.title]);
   await this.event(tx,owner,caseId,next,'update_case','case_updated',[caseId],[caseId]);return { revision:next };
  });
 }
 private async insertAssertion(tx:Sql,owner:string,caseId:string,input:EntryInput,supersedes:string|null,group:string|null,sensitivity=input.sensitivity) {
  const count=await tx.query<{ n:string }>('SELECT count(*)::text AS n FROM assertions WHERE case_id=$1 AND owner_id=$2',[caseId,owner]);
  if(Number(count.rows[0].n)>=100) throw new WorkbookError(422,'Case entry limit reached');
  const sourceId=randomUUID(), evidenceId=randomUUID(), id=randomUUID();
  const text=JSON.stringify({field:input.field,value:input.value,currency:input.currency,period:input.period,epistemic_type:input.epistemicType});
  await tx.query('INSERT INTO sources(id,case_id,owner_id,kind,original_text,checksum,sensitivity) VALUES($1,$2,$3,\'manual\',$4,$5,$6)',[sourceId,caseId,owner,text,createHash('sha256').update(text).digest('hex'),sensitivity]);
  await tx.query('INSERT INTO evidence(id,case_id,owner_id,source_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,0,$6)',[evidenceId,caseId,owner,sourceId,text,Array.from(text).length]);
  await tx.query('INSERT INTO assertions(id,case_id,owner_id,field,value,currency,period,epistemic_type,sensitivity,source_id,evidence_id,supersedes_id,conflict_group_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)',[id,caseId,owner,input.field,JSON.stringify(input.value),input.currency,input.period,input.epistemicType,sensitivity,sourceId,evidenceId,supersedes,group]);
  if(group) await tx.query('INSERT INTO conflict_members(conflict_id,assertion_id,case_id,owner_id) VALUES($1,$2,$3,$4)',[group,id,caseId,owner]);
  return id;
 }
 async add(owner:string,caseId:string,raw:unknown) {
  const input=entryInput.parse(raw);return this.applyChange(owner,caseId,input.expectedRevision,async(tx,next)=>{
   const active=(await tx.query<Assertion>('SELECT * FROM assertions WHERE case_id=$1 AND owner_id=$2 AND field=$3 AND status=\'active\'',[caseId,owner,input.field])).rows;
   let group:string|null=null;
   if(active.length){
    if(!input.recordConflict) throw new WorkbookError(409,'Field exists; correct it or explicitly record a conflict');
    group=active[0].conflict_group_id;
    if(!group){group=randomUUID();await tx.query('INSERT INTO conflicts(id,case_id,owner_id) VALUES($1,$2,$3)',[group,caseId,owner]);
     await tx.query('UPDATE assertions SET conflict_group_id=$4 WHERE case_id=$1 AND owner_id=$2 AND field=$3 AND status=\'active\'',[caseId,owner,input.field,group]);
     for(const a of active) await tx.query('INSERT INTO conflict_members(conflict_id,assertion_id,case_id,owner_id) VALUES($1,$2,$3,$4)',[group,a.id,caseId,owner]);
    }
   }
   const id=await this.insertAssertion(tx,owner,caseId,input,null,group);
   await this.event(tx,owner,caseId,next,group?'record_conflict':'manual_entry','manual_entry',active.map(a=>a.id),[id]);return {id,revision:next};
  });
 }
 async correct(owner:string,caseId:string,assertionId:string,raw:unknown) {
  const input=entryInput.parse(raw);if(!z.uuid().safeParse(assertionId).success)throw new WorkbookError(404,'Entry not found');
  return this.applyChange(owner,caseId,input.expectedRevision,async(tx,next)=>{
   const old=(await tx.query<Assertion>('SELECT * FROM assertions WHERE id=$1 AND case_id=$2 AND owner_id=$3 AND status=\'active\'',[assertionId,caseId,owner])).rows[0];
   if(!old)throw new WorkbookError(404,'Entry not found');
   if(old.field!==input.field || input.recordConflict)throw new WorkbookError(422,'Correction must keep the field');
   await tx.query('UPDATE assertions SET status=\'superseded\' WHERE id=$1 AND case_id=$2 AND owner_id=$3',[assertionId,caseId,owner]);
   const id=await this.insertAssertion(tx,owner,caseId,input,old.id,old.conflict_group_id,old.sensitivity==='private'?'private':input.sensitivity);
   await this.event(tx,owner,caseId,next,'correct_assertion','user_correction',[old.id],[id]);return {id,revision:next};
  });
 }
 async resolve(owner:string,caseId:string,conflictId:string,raw:unknown) {
  const input=resolveInput.parse(raw);if(!z.uuid().safeParse(conflictId).success)throw new WorkbookError(404,'Conflict not found');
  return this.applyChange(owner,caseId,input.expectedRevision,async(tx,next)=>{
   const group=(await tx.query('SELECT id FROM conflicts WHERE id=$1 AND case_id=$2 AND owner_id=$3 AND status=\'open\'',[conflictId,caseId,owner])).rows[0];
   const members=(await tx.query<Assertion>('SELECT * FROM assertions WHERE conflict_group_id=$1 AND case_id=$2 AND owner_id=$3 AND status=\'active\'',[conflictId,caseId,owner])).rows;
   if(!group || !members.some(a=>a.id===input.keepAssertionId))throw new WorkbookError(404,'Conflict not found');
   await tx.query('UPDATE assertions SET status=\'retracted\' WHERE conflict_group_id=$1 AND case_id=$2 AND owner_id=$3 AND id<>$4 AND status=\'active\'',[conflictId,caseId,owner,input.keepAssertionId]);
   await tx.query('UPDATE assertions SET conflict_group_id=NULL WHERE id=$1 AND case_id=$2 AND owner_id=$3',[input.keepAssertionId,caseId,owner]);
   const eventId=await this.event(tx,owner,caseId,next,'resolve_conflict','user_resolution',members.map(a=>a.id),[input.keepAssertionId]);
   await tx.query('UPDATE conflicts SET status=\'resolved\',resolution_event_id=$4 WHERE id=$1 AND case_id=$2 AND owner_id=$3',[conflictId,caseId,owner,eventId]);return {revision:next};
  });
 }
 async remove(owner:string,caseId:string,expected:number) {
  return this.applyChange(owner,caseId,expected,async tx=>{await tx.query('DELETE FROM cases WHERE id=$1 AND owner_id=$2',[caseId,owner]);});
 }
}
