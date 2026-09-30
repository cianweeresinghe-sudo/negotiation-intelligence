import {z} from 'zod';
import {entryInput} from '../workbook/input';
export type ExtractionSource=Readonly<{id:string;text:string;sensitivity:'private'|'shareable'}>;
export interface ExtractionAdapter { extract(source:ExtractionSource,signal:AbortSignal):Promise<unknown> }
const clean=z.string().max(4000).refine(s=>!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s),'Control characters are unsupported');
const evidence=z.object({source_id:clean.min(1),quote:clean.min(1).max(2000)}).strict();
const candidate=z.object({field:clean.min(1),value:z.unknown(),currency:clean.nullable(),period:clean.nullable(),epistemic_type:z.enum(['documented_observation','counterparty_claim','user_assumption','user_constraint','ai_inference']),confidence:z.enum(['low','medium','high']),confidence_rationale:clean.min(1),sensitivity:z.enum(['private','shareable']),evidence:z.array(evidence).min(1).max(5)}).strict();
const batch=z.object({source_id:clean.min(1),base_revision:z.number().int().min(0),candidates:z.array(candidate).max(30),unknowns:z.array(clean.min(1).max(200)).max(30),conflicts:z.array(clean.min(1).max(200)).max(30)}).strict();
export class ExtractionError extends Error {constructor(public code:'invalid_response'|'wrong_source'){super(code);}}
export type DropCode='unsupported_field'|'invalid_field_or_value'|'missing_quote'|'ambiguous_quote'|'unsupported_value'|'constraint_requires_user'|'duplicate_candidate';
export type ValidCandidate={index:number;field:string;value:string;currency:string|null;period:string|null;epistemic_type:string;confidence:string;confidence_rationale:string;sensitivity:'private'|'shareable';outbound_quote_allowed:false;evidence:{quote:string;start:number;end:number}[]};
export type ValidatedBatch={candidates:ValidCandidate[];drops:Partial<Record<DropCode,number>>;unknowns:string[];advisoryConflicts:string[]};
const normalizeMoney=(s:string)=>s.replace(/,/g,'').replace(/^0+(?=\d)/,'').replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1');
function moneySupported(value:string,currency:string,period:string,quotes:string[]){
 const currencies:Record<string,string>={'£':'GBP','€':'EUR','$':'USD',GBP:'GBP',EUR:'EUR',USD:'USD'};
 const periods:Record<string,RegExp>={annual:/\b(annual(?:ly)?|per year|yearly|a year)\b/i,monthly:/\b(monthly|per month|a month)\b/i,one_time:/\b(one[- ]time|sign[- ]on|signing bonus)\b/i};
 return quotes.some(q=>Array.from(q.matchAll(/(GBP|USD|EUR|£|€|\$)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,.])/g)).some(m=>{
  if(currencies[m[1]]!==currency||normalizeMoney(m[2])!==normalizeMoney(value))return false;
  // The period must follow this amount in its own clause, before another
  // amount. A sign-on amount cannot borrow an annual base clause's period.
  const tail=q.slice(m.index!+m[0].length).split(/[;.!?]/)[0].slice(0,40);
  const next=tail.search(/(?:GBP|USD|EUR|£|€|\$)\s*\d/);const own=next<0?tail:tail.slice(0,next);
  return periods[period]?.test(own)??false;
 }));
}
function deadlineSupported(value:string,quotes:string[]){
 const literal=/^(?:[1-9]|[12]\d|3[01]) (?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?(?: (?:at )?\d{2}:\d{2})?$/i;
 if(literal.test(value)&&quotes.some(q=>q.toLowerCase().includes(value.toLowerCase())))return true;
 const iso=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::00)?)?$/.exec(value);if(!iso)return false;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const date=`${Number(iso[3])} ${months[Number(iso[2])-1]} ${iso[1]}`;
 return quotes.some(q=>q.toLowerCase().includes(date.toLowerCase())&&(!iso[4]||q.includes(`${iso[4]}:${iso[5]}`)));
}
// Directly callable by fixture runners. Raw output is never persisted/displayed.
export function validateCandidates(raw:unknown,source:ExtractionSource):ValidatedBatch{
 let encoded:string|undefined;try{encoded=JSON.stringify(raw);}catch{throw new ExtractionError('invalid_response');}
 if(!encoded||Buffer.byteLength(encoded)>131072)throw new ExtractionError('invalid_response');
 const safe=JSON.parse(encoded) as unknown;
 function controls(value:unknown):boolean {return typeof value==='string'?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value):value!==null&&typeof value==='object'?Object.values(value).some(controls):false;}
 try{if(controls(safe))throw new ExtractionError('invalid_response');}catch{throw new ExtractionError('invalid_response');}
 const parsed=batch.safeParse(safe);if(!parsed.success)throw new ExtractionError('invalid_response');
 const output=parsed.data;
 if(output.source_id!==source.id||output.candidates.some(c=>c.evidence.some(e=>e.source_id!==source.id)))throw new ExtractionError('wrong_source');
 const result:ValidatedBatch={candidates:[],drops:{},unknowns:output.unknowns,advisoryConflicts:output.conflicts};
 const seen=new Set<string>();
 const drop=(code:DropCode)=>{result.drops[code]=(result.drops[code]??0)+1;};
 output.candidates.forEach((c,index)=>{
  if(!['base','minimum_base','deadline','objective','alternative','note'].includes(c.field)){drop('unsupported_field');return;}
  if(c.field==='minimum_base'){drop('constraint_requires_user');return;}
  const domain=entryInput.safeParse({field:c.field,value:c.value,currency:c.currency,period:c.period,epistemicType:c.epistemic_type==='ai_inference'?'user_assumption':c.epistemic_type,sensitivity:source.sensitivity==='private'?'private':c.sensitivity,expectedRevision:0});
  if(!domain.success){drop('invalid_field_or_value');return;}
  const spans:ValidCandidate['evidence']=[];
  for(const e of c.evidence){const start=source.text.indexOf(e.quote);if(start<0){drop('missing_quote');return;}if(source.text.indexOf(e.quote,start+1)>=0){drop('ambiguous_quote');return;}
   const from=Array.from(source.text.slice(0,start)).length;spans.push({quote:e.quote,start:from,end:from+Array.from(e.quote).length});
  }
  const quotes=spans.map(s=>s.quote);
  if((['objective','alternative','note'].includes(c.field)&&!quotes.some(q=>q.includes(domain.data.value)))||(c.field==='base'&&!moneySupported(domain.data.value,domain.data.currency!,domain.data.period!,quotes))||(c.field==='deadline'&&!deadlineSupported(domain.data.value,quotes))){drop('unsupported_value');return;}
  const key=JSON.stringify([domain.data.field,domain.data.value,domain.data.currency,domain.data.period,c.epistemic_type,spans]);if(seen.has(key)){drop('duplicate_candidate');return;}seen.add(key);
  result.candidates.push({index,field:domain.data.field,value:domain.data.value,currency:domain.data.currency,period:domain.data.period,epistemic_type:c.epistemic_type,confidence:c.confidence,confidence_rationale:c.confidence_rationale,sensitivity:domain.data.sensitivity,outbound_quote_allowed:false,evidence:spans});
 });
 return result;
}
