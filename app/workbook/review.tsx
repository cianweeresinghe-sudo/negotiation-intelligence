'use client';
import {useEffect,useState} from 'react';
type Candidate={field:string;value:string;currency:string|null;period:string|null;epistemic_type:string;sensitivity:string;confidence:string;confidence_rationale:string};
type Proposal={id:string;candidate:Candidate;status:string;duplicate_of:string|null;target_assertion_ids:string[];decision?:{accepted?:{epistemicType:string;sensitivity:string}}};
type Active={id:string;field:string;value:string;status:string;currency?:string|null;period?:string|null;epistemic_type?:string};
export function Advisory({text}:{text:string}){return <pre>{text}</pre>;}
type JobOutcomeRow={drop_counts?:Record<string,number>;advisory_unknowns?:string[];advisory_conflicts?:string[]};
export function JobOutcome({job:j}:{job:JobOutcomeRow}){return <div><p>{j.drop_counts?.unsupported_field??0} terms not recognised</p>{Object.entries(j.drop_counts??{}).filter(([k])=>k!=='unsupported_field').map(([k,n])=><p key={k}>{k}: {n}</p>)}{[...(j.advisory_unknowns??[]),...(j.advisory_conflicts??[])].map((s,k)=><Advisory key={k} text={s}/>)}</div>;}
export default function Review({caseId,revision,assertions,reload}:{caseId:string;revision:number;assertions:Active[];reload:()=>Promise<void>}){
 const [rows,setRows]=useState<Proposal[]>([]),[evidence,setEvidence]=useState<{proposal_id:string;quote:string}[]>([]),[jobs,setJobs]=useState<JobOutcomeRow[]>([]),[text,setText]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function api(path:string,body?:unknown){const r=await fetch(`/api/cases/${caseId}/${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
 async function load(){const p=await api('proposals');setRows(p.proposals);setEvidence(p.evidence);setJobs(await api('imports'));}
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[caseId]); // Drafts survive revision reloads.
 async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();await reload();await load();}catch(e){setMessage(e instanceof Error?e.message:'Review failed');await reload();await load();}finally{setBusy(false);}}
 return <section><h2>Import and review · deterministic mock</h2><p>Invented text only. Supported extraction is limited; this is a pipeline demo.</p>
 <form onSubmit={e=>{e.preventDefault();void act(async()=>{await api('proposals/import',{text});setText('');});}}><label>Paste original source<textarea placeholder="Offer: GBP 52,000 annually" value={text} onChange={e=>setText(e.target.value)} required maxLength={100000}/></label><button disabled={busy}>Import and extract</button></form>
 {message&&<p role="alert">{message}. Your review edits are retained; check the current workbook before retrying.</p>}
 {jobs.map((j,i)=><JobOutcome key={i} job={j}/>)}
 {rows.map(p=><Card key={p.id} proposal={p} quotes={evidence.filter(e=>e.proposal_id===p.id).map(e=>e.quote)} active={assertions.filter(a=>a.status==='active'&&a.field===p.candidate.field)} revision={revision} busy={busy} submit={(action,body)=>act(async()=>{await api(`proposals/${p.id}/${action}`,body);})}/>)}
 </section>;
}
function Card({proposal:p,quotes,active,revision,busy,submit}:{proposal:Proposal;quotes:string[];active:Active[];revision:number;busy:boolean;submit:(action:string,body:unknown)=>Promise<void>}){
 const c=p.candidate;const [value,setValue]=useState(c.value),[type,setType]=useState(c.epistemic_type),[operation,setOperation]=useState(''),[target,setTarget]=useState(''),[ack,setAck]=useState(false),[provenance,setProvenance]=useState(false);
 useEffect(()=>{setAck(false);setProvenance(false);},[active.map(a=>a.id).sort().join(','),type,value]);
 const equal=active.length===1&&active[0].value===value&&active[0].currency===c.currency&&active[0].period===c.period;
 const changed=JSON.stringify(active.map(a=>a.id).sort())!==JSON.stringify([...p.target_assertion_ids].sort());
 const edits={...(value!==c.value?{value}:{}),...(type!==c.epistemic_type?{epistemicType:type}:{})};
 return <article><h3>{c.field}: {c.value} · {p.status}</h3><p>Original proposal: {c.epistemic_type} · {c.sensitivity} · confidence {c.confidence}</p>{p.status==='accepted'&&p.decision?.accepted&&<p>Accepted classification: {p.decision.accepted.epistemicType} · {p.decision.accepted.sensitivity}</p>}<Advisory text={c.confidence_rationale}/>{quotes.map((q,i)=><blockquote key={i}><Advisory text={q}/></blockquote>)}
 {p.duplicate_of&&<p>Duplicate of pending proposal {p.duplicate_of}</p>}
 {p.status==='pending'&&<><label>Reviewed value<input value={value} onChange={e=>setValue(e.target.value)} maxLength={2000}/></label><label>Classification<select value={type} onChange={e=>setType(e.target.value)}><option value="ai_inference">AI inference — choose an explicit classification</option>{['counterparty_claim','documented_observation','user_assumption','user_constraint'].map(t=><option key={t}>{t}</option>)}</select></label>
 {active.map(a=><p key={a.id}>Current: {a.value} · {a.epistemic_type}</p>)}
 {equal?<><p>Same value: dismiss as duplicate to preserve the accepted source.</p><button disabled={busy} onClick={()=>void submit('reject',{expectedRevision:revision,reason:'duplicate'})}>Dismiss duplicate</button><label><input type="checkbox" checked={provenance} onChange={e=>setProvenance(e.target.checked)}/> Explicitly replace the source and classification with {type}</label></>:active.length>0&&<><label>Decision<select value={operation} onChange={e=>setOperation(e.target.value)}><option value="">Choose explicitly</option><option value="correct">Correct an existing assertion</option><option value="conflict">Record disagreement</option></select></label>{operation==='correct'&&<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose current assertion</option>{active.map(a=><option key={a.id} value={a.id}>{a.value}</option>)}</select>}</>}
 {changed&&<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> Target changed: I reviewed the current values above</label>}
 <button disabled={busy||type==='ai_inference'||(changed&&!ack)||(equal&&!provenance)||(!equal&&active.length>0&&(!operation||(operation==='correct'&&!target)))} onClick={()=>void submit(Object.keys(edits).length?'edit':'accept',{expectedRevision:revision,operation:equal?'confirm':active.length?operation:'add',...(target?{correctAssertionId:target}:{}),...(Object.keys(edits).length?{edits}:{}),acknowledgeTargetChange:ack,reviewedTargetIds:active.map(a=>a.id),acknowledgeProvenanceChange:provenance})}>{equal?'Replace with this source':'Accept reviewed value'}</button>
 <button disabled={busy} onClick={()=>void submit('reject',{expectedRevision:revision})}>Reject</button></>}
 </article>;
}
