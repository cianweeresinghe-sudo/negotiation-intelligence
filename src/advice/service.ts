import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database,Sql} from '../workbook/database';
import {WorkbookError} from '../workbook/service';
import {summarizeChanges,type ReviewState} from './changes';
import {revision} from '../workbook/input';
import {freeze,type AdviceAdapter,type AdviceSnapshot,type AcceptedAssertion,type AcceptedEvidence} from './types';
import {validateAdviceOutput,AdviceValidationError} from './validate';
export const generateAdviceInput=z.object({expectedRevision:revision,expectedMaterialVersion:revision}).strict();
export const adviceSettingsInput=generateAdviceInput.extend({includePrivateConstraints:z.boolean()}).strict();
export function snapshotHash(value:unknown):string{
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
type Case={revision:number;material_version:number;include_private_constraints:boolean};
type RecordRow={id:string;revision:number;material_version:number;adapter_version:string;content:unknown;snapshot:unknown;created_at:unknown};
export class AdviceService{
 constructor(private db:Database,private maxRecords=20,private timeoutMs=30000){if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>1000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('Invalid advice configuration');}
 private async owned(tx:Sql,owner:string,caseId:string,lock=false){
  if(!z.uuid().safeParse(owner).success||!z.uuid().safeParse(caseId).success)throw new WorkbookError(404,'Case not found');
  const row=(await tx.query<Case>(`SELECT revision,material_version,include_private_constraints FROM cases WHERE id=$1 AND owner_id=$2${lock?' FOR UPDATE':''}`,[caseId,owner])).rows[0];if(!row)throw new WorkbookError(404,'Case not found');return row;
 }
 private checkCounters(row:Case,input:{expectedRevision:number;expectedMaterialVersion:number}){if(row.revision!==input.expectedRevision||row.material_version!==input.expectedMaterialVersion)throw new WorkbookError(409,'Case inputs changed; reload before generating','stale_snapshot');}
 private async capture(owner:string,caseId:string,flag?:boolean){return this.db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const c=await this.owned(tx,owner,caseId);
  const assertions=(await tx.query<AcceptedAssertion>('SELECT id,field,value,currency,period,epistemic_type,sensitivity,outbound_quote_allowed,source_id,evidence_id,conflict_group_id FROM assertions WHERE case_id=$1 AND owner_id=$2 AND status=\'active\' ORDER BY field,id',[caseId,owner])).rows;
  const evidence=(await tx.query<AcceptedEvidence>(`SELECT DISTINCT e.id,e.source_id,a.id AS assertion_id,e.quote FROM assertions a JOIN evidence e ON e.case_id=a.case_id AND e.owner_id=a.owner_id AND (e.id=a.evidence_id OR EXISTS(SELECT 1 FROM proposals p JOIN proposal_evidence pe ON pe.proposal_id=p.id AND pe.case_id=p.case_id WHERE p.accepted_assertion_id=a.id AND p.status='accepted' AND pe.evidence_id=e.id)) WHERE a.case_id=$1 AND a.owner_id=$2 AND a.status='active' ORDER BY e.id,a.id`,[caseId,owner])).rows;
  const conflicts=(await tx.query<{id:string}>("SELECT id FROM conflicts WHERE case_id=$1 AND owner_id=$2 AND status='open' ORDER BY id",[caseId,owner])).rows.map(g=>({id:g.id,assertionIds:assertions.filter(a=>a.conflict_group_id===g.id).map(a=>a.id)}));
  const proposals=(await tx.query<{id:string;status:string}>('SELECT id,status FROM proposals WHERE case_id=$1 AND owner_id=$2 ORDER BY id',[caseId,owner])).rows;
  const jobs=(await tx.query<{id:string;status:string}>('SELECT id,status FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2 ORDER BY id',[caseId,owner])).rows;
  const include=flag??c.include_private_constraints;
  const visible=assertions.filter(a=>include||(['base','deadline'].includes(a.field)&&['counterparty_claim','documented_observation'].includes(a.epistemic_type)));
  // An incomplete visible conflict cannot safely describe or resolve the group.
  const hiddenConflictIds=new Set(conflicts.filter(g=>g.assertionIds.some(id=>!visible.some(a=>a.id===id))).map(g=>g.id));
  const filtered=visible.filter(a=>!a.conflict_group_id||!hiddenConflictIds.has(a.conflict_group_id));
  const base={revision:c.revision,materialVersion:c.material_version,includePrivateConstraints:include,pendingProposalIds:proposals.filter(p=>p.status==='pending').map(p=>p.id)};
  const privacy=freeze({...base,assertions,evidence,conflicts}) as AdviceSnapshot;
  const snapshot=freeze({...base,assertions:filtered,evidence:evidence.filter(e=>filtered.some(a=>a.id===e.assertion_id)),conflicts:conflicts.filter(g=>!hiddenConflictIds.has(g.id)&&g.assertionIds.every(id=>filtered.some(a=>a.id===id)))}) as AdviceSnapshot;
  if(Buffer.byteLength(JSON.stringify({...snapshot,proposalStates:proposals,jobStates:jobs}),'utf8')>1048576)throw new WorkbookError(422,'Advice snapshot limit reached','snapshot_limit');
  return {snapshot,privacy,proposals,jobs};
 });}
 async snapshot(owner:string,caseId:string,includePrivateConstraints=false){return (await this.capture(owner,caseId,includePrivateConstraints)).snapshot;}
 async settings(owner:string,caseId:string,raw:unknown){const input=adviceSettingsInput.parse(raw);return this.db.transaction(async tx=>{
  const row=await this.owned(tx,owner,caseId,true);this.checkCounters(row,input);
  if(row.include_private_constraints!==input.includePrivateConstraints)await tx.query('UPDATE cases SET include_private_constraints=$3,material_version=material_version+1,updated_at=now() WHERE id=$1 AND owner_id=$2',[caseId,owner,input.includePrivateConstraints]);
  return {includePrivateConstraints:input.includePrivateConstraints,materialVersion:row.material_version+(row.include_private_constraints===input.includePrivateConstraints?0:1)};
 });}
 async latest(owner:string,caseId:string){return this.db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const c=await this.owned(tx,owner,caseId);
  const row=(await tx.query<RecordRow>('SELECT * FROM advice_records WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[caseId,owner])).rows[0];
  const active=(await tx.query<AcceptedAssertion>("SELECT id,field,epistemic_type,conflict_group_id FROM assertions WHERE case_id=$1 AND owner_id=$2 AND status='active'",[caseId,owner])).rows;
  const visible=active.filter(a=>c.include_private_constraints||(['base','deadline'].includes(a.field)&&['counterparty_claim','documented_observation'].includes(a.epistemic_type)));
  const visibleIds=new Set(visible.map(a=>a.id));
  const hiddenGroups=new Set(active.filter(a=>!visibleIds.has(a.id)&&a.conflict_group_id).map(a=>a.conflict_group_id));
  const modelVisibleDetailCount=visible.filter(a=>!a.conflict_group_id||!hiddenGroups.has(a.conflict_group_id)).length;
  const pending=(await tx.query<{n:number}>("SELECT count(*)::integer AS n FROM proposals WHERE case_id=$1 AND owner_id=$2 AND status='pending'",[caseId,owner])).rows[0].n;
  return {modelVisibleDetailCount,pendingSuggestedChanges:pending,latest:row?{...row,stale:row.revision!==c.revision||row.material_version!==c.material_version}:null,revision:c.revision,materialVersion:c.material_version,includePrivateConstraints:c.include_private_constraints};
 });}
 async history(owner:string,caseId:string){return this.db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const c=await this.owned(tx,owner,caseId);
  return (await tx.query<RecordRow>('SELECT id,case_id,owner_id,revision,material_version,adapter_version,include_private_constraints,snapshot_hash,created_at,content,jsonb_array_length(snapshot->\'assertions\') AS accepted_detail_count FROM advice_records WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at DESC,id DESC',[caseId,owner])).rows.map(row=>({...row,stale:row.revision!==c.revision||row.material_version!==c.material_version}));
 });}
 async read(owner:string,caseId:string,id:string){return this.db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const c=await this.owned(tx,owner,caseId);
  if(!z.uuid().safeParse(id).success)throw new WorkbookError(404,'Advice not found');const row=(await tx.query<RecordRow>('SELECT * FROM advice_records WHERE id=$1 AND case_id=$2 AND owner_id=$3',[id,caseId,owner])).rows[0];if(!row)throw new WorkbookError(404,'Advice not found');
  const citations=(await tx.query('SELECT * FROM advice_citations WHERE advice_id=$1 AND case_id=$2 AND owner_id=$3 ORDER BY claim_index,id',[id,caseId,owner])).rows;
  const sourceLabels=(await tx.query<{id:string;label:string|null}>('SELECT id,label FROM sources WHERE case_id=$1 AND owner_id=$2',[caseId,owner])).rows;
  return {...row,citations,sourceLabels,stale:row.revision!==c.revision||row.material_version!==c.material_version};
 });}
 async changes(owner:string,caseId:string,id:string){return this.db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const current=await this.owned(tx,owner,caseId);
  if(!z.uuid().safeParse(id).success)throw new WorkbookError(404,'Advice not found');
  const saved=(await tx.query<RecordRow>('SELECT * FROM advice_records WHERE id=$1 AND case_id=$2 AND owner_id=$3',[id,caseId,owner])).rows[0];if(!saved)throw new WorkbookError(404,'Advice not found');
  const baseline=saved.snapshot as AdviceSnapshot&{proposalStates:ReviewState[];jobStates:ReviewState[]};
  const proposals=(await tx.query<{id:string;status:string;candidate:{field:string}}>('SELECT id,status,candidate FROM proposals WHERE case_id=$1 AND owner_id=$2 ORDER BY id',[caseId,owner])).rows;
  const jobs=(await tx.query<ReviewState>('SELECT id,status FROM ingestion_jobs WHERE case_id=$1 AND owner_id=$2 ORDER BY id',[caseId,owner])).rows;
  const summary=summarizeChanges(baseline,{revision:current.revision,includePrivateConstraints:current.include_private_constraints,proposalStates:proposals,jobStates:jobs});
  const details=(await tx.query<AcceptedAssertion&{label:string|null;status:string;created_at:string;supersedes_id:string|null}>(`SELECT a.*,s.label FROM assertions a JOIN sources s ON s.id=a.source_id AND s.case_id=a.case_id AND s.owner_id=a.owner_id WHERE a.case_id=$1 AND a.owner_id=$2 ORDER BY a.created_at,a.id`,[caseId,owner])).rows;
  const visible=details.filter(a=>current.include_private_constraints||(['base','deadline'].includes(a.field)&&['counterparty_claim','documented_observation'].includes(a.epistemic_type)));
  const visibleIds=new Set(visible.map(a=>a.id));
  const refs=(await tx.query<{event_id:string;assertion_id:string;direction:string;revision:number;created_at:string;operation:string}>(`SELECT r.event_id,r.assertion_id,r.direction,e.revision,e.created_at,e.operation FROM events e JOIN event_assertion_refs r ON r.event_id=e.id AND r.case_id=e.case_id AND r.owner_id=e.owner_id WHERE e.case_id=$1 AND e.owner_id=$2 AND e.revision>$3 ORDER BY e.revision,r.direction,r.assertion_id`,[caseId,owner,saved.revision])).rows.filter(r=>visibleIds.has(r.assertion_id));
  const format=(a:typeof details[number])=>[a.currency,a.currency&&/^\d+(?:\.\d+)?$/.test(a.value)?a.value.replace(/\B(?=(\d{3})+(?!\d))/g,','):a.value,a.period==='annual'?'annually':a.period==='monthly'?'monthly':a.period==='one_time'?'one time':null].filter(Boolean).join(' ');
  const lines:string[]=[];
  for(const eventId of new Set(refs.map(r=>r.event_id))){
   const group=refs.filter(r=>r.event_id===eventId),before=group.filter(r=>r.direction==='before').map(r=>visible.find(a=>a.id===r.assertion_id)!),after=group.filter(r=>r.direction==='after').map(r=>visible.find(a=>a.id===r.assertion_id)!);
   for(const a of after){if(before.length&&a.supersedes_id===before[0].id)lines.push(`Corrected: ${a.field} changed from ${format(before[0])} to ${format(a)}.`);else lines.push(`${a.label?`${a.label} says`:'You entered'} ${a.field} ${format(a)} (you accepted this on ${new Date(group[0].created_at).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC'}).`);}
  }
  const open=(await tx.query<{id:string}>("SELECT id FROM conflicts WHERE case_id=$1 AND owner_id=$2 AND status='open' ORDER BY id",[caseId,owner])).rows;
  const conflicts=open.map(g=>({id:g.id,members:visible.filter(a=>a.status==='active'&&a.conflict_group_id===g.id)})).filter(g=>g.members.length>1);
  for(const group of conflicts){const [a,b]=group.members;lines.push(`Still unresolved: ${a.label??'Manual entry'} says ${format(a)}; ${b.label??'Manual entry'} says ${format(b)}. You can leave this open.`);}
  const oldStatuses=new Map(baseline.proposalStates.map(p=>[p.id,p.status]));
  for(const p of proposals.filter(p=>p.status==='rejected'&&oldStatuses.get(p.id)!=='rejected'))lines.push(`Rejected: you rejected a suggested ${p.candidate.field}. It was not used.`);
  if(summary.pending)lines.push(`Waiting for review: ${summary.pending} suggested change(s). Not used in this advice.`);
  const nowIds=visible.filter(a=>a.status==='active').map(a=>a.id).sort(),oldIds=baseline.assertions.map(a=>a.id).sort();
  const acceptedFactsStable=JSON.stringify(nowIds)===JSON.stringify(oldIds);
  if(summary.acceptedDetailsUnchanged&&saved.material_version!==current.material_version){const reason=summary.modelVisibilityChanged?'a change to private-constraint use':summary.rejectedSince?'a rejected suggestion':summary.pending?'pending changes':conflicts.length?'an unresolved disagreement':'an import';lines.unshift(`None of your accepted details changed. The previous advice was marked out of date because of ${reason}.`);}
  return {adviceId:id,stale:saved.revision!==current.revision||saved.material_version!==current.material_version,summary,acceptedFactsStable,lines,eventReferences:refs,conflicts:conflicts.map(g=>({id:g.id,field:g.members[0].field,assertionIds:g.members.map(a=>a.id)})),privateConstraintsUsed:current.include_private_constraints,privateNotice:current.include_private_constraints?'Private figures are included in this test advice.':'Private constraints are not used.'};
 });}
 async generate(owner:string,caseId:string,raw:unknown,adapter:AdviceAdapter){
  const input=generateAdviceInput.parse(raw),version=adapter.version;if(!/^[a-zA-Z0-9._-]{1,80}$/.test(version))throw new WorkbookError(422,'Invalid adapter');
  const captured=await this.capture(owner,caseId),s=captured.snapshot;
  this.checkCounters({revision:s.revision,material_version:s.materialVersion,include_private_constraints:s.includePrivateConstraints},input);
  if(!s.assertions.length)throw new WorkbookError(422,'Review model-visible facts or explicitly enable private constraints first','no_visible_facts');
  const existing=(await this.db.query<{id:string}>('SELECT id FROM advice_records WHERE case_id=$1 AND owner_id=$2 AND revision=$3 AND material_version=$4 AND adapter_version=$5',[caseId,owner,s.revision,s.materialVersion,version])).rows[0];if(existing)return this.read(owner,caseId,existing.id);
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let output:unknown;
  try{output=await Promise.race([adapter.generate(s,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new WorkbookError(503,'Advice generation timed out','timeout'));},this.timeoutMs);})]);}finally{clearTimeout(timer);}
  let content:ReturnType<typeof validateAdviceOutput>;try{content=validateAdviceOutput(output,s,captured.privacy);}catch(error){if(error instanceof AdviceValidationError)throw new WorkbookError(422,'Advice output was blocked',error.code);throw error;}
  const id=await this.db.transaction(async tx=>{
   const current=await this.owned(tx,owner,caseId,true);this.checkCounters(current,input);
   if((await tx.query('SELECT id FROM advice_records WHERE case_id=$1 AND owner_id=$2 AND revision=$3 AND material_version=$4 AND adapter_version=$5',[caseId,owner,s.revision,s.materialVersion,version])).rows.length)return (await tx.query<{id:string}>('SELECT id FROM advice_records WHERE case_id=$1 AND owner_id=$2 AND revision=$3 AND material_version=$4 AND adapter_version=$5',[caseId,owner,s.revision,s.materialVersion,version])).rows[0].id;
   const count=(await tx.query<{n:string}>('SELECT count(*)::text AS n FROM advice_records WHERE case_id=$1 AND owner_id=$2',[caseId,owner])).rows[0];if(Number(count.n)>=this.maxRecords)throw new WorkbookError(422,'Case advice limit reached','advice_limit');
   const adviceId=randomUUID();await tx.query('INSERT INTO advice_records(id,case_id,owner_id,revision,material_version,adapter_version,content,snapshot,include_private_constraints,snapshot_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)',[adviceId,caseId,owner,s.revision,s.materialVersion,version,JSON.stringify(content),JSON.stringify({...s,proposalStates:captured.proposals,jobStates:captured.jobs}),s.includePrivateConstraints,snapshotHash({...s,proposalStates:captured.proposals,jobStates:captured.jobs})]);
   for(const [index,claim] of content.claims.entries()){
    for(const ref of claim.assertion_ids)await tx.query('INSERT INTO advice_citations(id,advice_id,case_id,owner_id,claim_index,assertion_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),adviceId,caseId,owner,index,ref]);
    for(const ref of claim.evidence_ids)await tx.query('INSERT INTO advice_citations(id,advice_id,case_id,owner_id,claim_index,evidence_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),adviceId,caseId,owner,index,ref]);
   }
   return adviceId;
  });return this.read(owner,caseId,id);
 }
}
