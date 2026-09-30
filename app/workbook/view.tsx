'use client';
import { useEffect,useState } from 'react';
type Case={id:string;title:string;revision:number};
type Assertion={id:string;field:string;value:string;status:string;source_id:string;supersedes_id:string|null;conflict_group_id:string|null};
type Detail={negotiation:Case;assertions:Assertion[];sources:{id:string;original_text:string}[];conflicts:{id:string;status:string}[]};
export default function WorkbookView(){
 const [cases,setCases]=useState<Case[]>([]),[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function api(path:string,method='GET',body?:unknown){const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
 async function load(){setCases(await api('/api/cases'));}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function act(run:()=>Promise<void>){setBusy(true);setError('');try{await run();}catch(e){setError(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}}
 async function open(id:string){setDetail(await api(`/api/cases/${id}`));}
 return <main><header><p className="eyebrow">Synthetic local workbook</p><h1>Your negotiation cases</h1><p>Manual entries and corrections. Use invented details only.</p></header>
 {error&&<p role="alert">{error}. Configure local Postgres and DEMO_USER; production synthetic identity is disabled.</p>}
 <section><h2>Create a case</h2><form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const title=new FormData(f).get('title');void act(async()=>{const c=await api('/api/cases','POST',{title});await load();await open(c.id);f.reset();});}}><label>Case title <input name="title" required maxLength={120}/></label><button disabled={busy}>Create</button></form>
 {cases.map(c=><button disabled={busy} key={c.id} onClick={()=>void act(()=>open(c.id))}>{c.title}</button>)}</section>
 {detail&&<><section><h2>{detail.negotiation.title}</h2><p>Revision {detail.negotiation.revision}</p><h3>Add a manual entry</h3>
 <form onSubmit={e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f);void act(async()=>{await api(`/api/cases/${detail.negotiation.id}/entries`,'POST',{field:v.get('field'),value:v.get('value'),currency:v.get('currency')||null,period:v.get('period')||null,epistemicType:v.get('type'),sensitivity:'private',recordConflict:v.get('conflict')==='on',expectedRevision:detail.negotiation.revision});await open(detail.negotiation.id);f.reset();});}}>
 <label>Field <select name="field"><option>base</option><option>minimum_base</option><option>deadline</option><option>objective</option><option>alternative</option><option>note</option></select></label>
 <label>Value <input name="value" required maxLength={2000}/></label><label>Currency <input name="currency" maxLength={3} defaultValue="GBP"/></label>
 <label>Time basis <select name="period"><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="one_time">One time</option><option value="">Not applicable</option></select></label>
 <label>Classification <select name="type"><option value="counterparty_claim">Counterparty claim</option><option value="user_constraint">User constraint</option><option value="documented_observation">Documented observation</option><option value="user_assumption">User assumption</option></select></label>
 <label><input type="checkbox" name="conflict"/> Record disagreement with existing value</label><button disabled={busy}>Save manual entry</button></form></section>
 <section><h2>Workbook and corrections</h2>{detail.assertions.map(a=><article key={a.id}><h3>{a.field}: {a.value}</h3><p>{a.status}{detail.conflicts.some(c=>c.id===a.conflict_group_id&&c.status==='open')?' · disputed':''}</p><p>{a.supersedes_id?'Correction of an earlier entry':'Original manual entry'}</p>
 <details><summary>Original evidence</summary><pre>{detail.sources.find(s=>s.id===a.source_id)?.original_text}</pre></details>
 {a.status==='active'&&<form onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get('value');void act(async()=>{const current=detail.assertions.find(x=>x.id===a.id) as Assertion & {currency:string|null;period:string|null;epistemic_type:string;sensitivity:string};await api(`/api/cases/${detail.negotiation.id}/entries/${a.id}`,'PATCH',{field:a.field,value,currency:current.currency,period:current.period,epistemicType:current.epistemic_type,sensitivity:current.sensitivity,expectedRevision:detail.negotiation.revision});await open(detail.negotiation.id);});}}><label>Correct value <input name="value" required maxLength={2000}/></label><button disabled={busy}>Save correction</button></form>}
 {a.status==='active'&&a.conflict_group_id&&detail.conflicts.some(c=>c.id===a.conflict_group_id&&c.status==='open')&&<button disabled={busy} onClick={()=>void act(async()=>{await api(`/api/cases/${detail.negotiation.id}/conflicts/${a.conflict_group_id}`,'POST',{keepAssertionId:a.id,expectedRevision:detail.negotiation.revision});await open(detail.negotiation.id);})}>Resolve disagreement: keep this entry</button>}
 </article>)}</section></>}
 <footer>Inferred updates require a later proposal review flow. Managed login and live use are not enabled.</footer></main>;
}
