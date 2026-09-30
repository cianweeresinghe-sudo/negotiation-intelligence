import {validateAdvice,type Advice,type Claim} from '../intelligence/contracts';
import {checkClaimCoverage} from '../intelligence/boundary';
import type {AdviceSnapshot} from './types';
export class AdviceValidationError extends Error{constructor(public code:string){super('Advice validation failed');}}
export const GENERIC_DRAFT='Thank you for the offer. Could we discuss the terms?';
const fail=(code:string):never=>{throw new AdviceValidationError(code);};
// Exact decimal matching removes currency decorations, thousands separators and
// trailing decimal zeros; k expands exactly. No rounding or range inference.
export function numberTokens(text:string):string[]{
 const tokens=text.match(/(?<![\p{L}\d])[+-]?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?[kKmM]?(?![\p{L}\d])/gu)??[];
 return tokens.map(raw=>{const negative=raw.startsWith('-'),suffix=/[km]$/i.exec(raw)?.[0].toLowerCase(),clean=raw.replace(/[ ,+km]/gi,'').replace(/^-/,'');const [whole,part='']=clean.split('.');const shift=suffix==='k'?3:suffix==='m'?6:0;let digits=whole+part+'0'.repeat(Math.max(0,shift-part.length));let decimals=Math.max(0,part.length-shift);digits=digits.replace(/^0+(?=\d)/,'');if(decimals){digits=digits.padStart(decimals+1,'0');digits=digits.slice(0,-decimals)+'.'+digits.slice(-decimals);digits=digits.replace(/0+$/,'').replace(/\.$/,'');}return (negative?'-':'')+digits;});
}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function dateTokens(text:string){const result:string[]=[];
 for(const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))result.push(`${match[1]}-${Number(match[2])}-${Number(match[3])}`);
 for(const match of text.matchAll(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?\b/gi))result.push(`${match[3]??''}-${months.indexOf(match[2].toLowerCase())+1}-${Number(match[1])}`);
 return result;
}
function controls(value:unknown):boolean{if(typeof value==='string')return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)||value.length>4000;if(Array.isArray(value))return value.some(controls);if(value&&typeof value==='object')return Object.values(value).some(controls);return false;}
export function checkDraft(draft:string|null,snapshot:AdviceSnapshot,claims:readonly Claim[]){
 if(draft===null)return;
 // No disclosure has been explicitly authorised in this slice. The permitted
 // reference set is empty even for a shareable row. Restrict to fixed public copy.
 if(claims.some(c=>c.output_path==='/draft'))fail('draft_reference_not_permitted');
 const privateRows=snapshot.assertions.filter(a=>a.sensitivity==='private'||!a.outbound_quote_allowed);
 const numbers=numberTokens(draft);if(privateRows.some(a=>numberTokens(a.value).some(n=>numbers.includes(n))))fail('private_value_in_draft');
 if(snapshot.evidence.some(e=>privateRows.some(a=>a.id===e.assertion_id)&&e.quote.length>=8&&draft.toLowerCase().includes(e.quote.toLowerCase())))fail('private_quote_in_draft');
 if(draft!==GENERIC_DRAFT)fail('draft_not_permitted');
}
export function validateAdviceOutput(raw:unknown,snapshot:AdviceSnapshot,privacySnapshot:AdviceSnapshot=snapshot){
 let serialized:string;try{serialized=typeof raw==='string'?raw:JSON.stringify(raw);}catch{return fail('invalid_response');}
 if(!serialized||Buffer.byteLength(serialized,'utf8')>131072)fail('invalid_response');
 let parsed:unknown;try{parsed=typeof raw==='string'?JSON.parse(raw):raw;validateAdvice(parsed);}catch{return fail('invalid_response');}
 const advice=parsed as Advice;
 if(controls(advice)||Object.entries(advice).some(([key,value])=>typeof value==='string'&&key!=='draft'&&!value.trim())||advice.claims.some(c=>!c.text.trim())||advice.claims.length>100||advice.assumptions.length>20)fail('invalid_response');
 const knownAssertions=new Map(snapshot.assertions.map(a=>[a.id,a])),knownEvidence=new Map(snapshot.evidence.map(e=>[e.id,e]));
 if(advice.unresolved_proposal_ids.some(id=>!snapshot.pendingProposalIds.includes(id)))fail('invalid_reference');
 for(const claim of advice.claims){
  if(!claim.assertion_ids.length&&!claim.evidence_ids.length)fail('unsupported_claim');
  if(claim.assertion_ids.some(id=>!knownAssertions.has(id))||claim.evidence_ids.some(id=>!knownEvidence.has(id)))fail('invalid_reference');
  const resolved=claim.output_path.match(/^\/assumptions\/(\d+)$/);const prose=resolved?advice.assumptions[Number(resolved[1])]:advice[claim.output_path.slice(1) as keyof Advice];
  if(typeof prose!=='string'||!prose.includes(claim.text))fail('invalid_claim_path');
  const cited=new Set([...claim.assertion_ids,...claim.evidence_ids.map(id=>knownEvidence.get(id)!.assertion_id)]);
  const support=[...claim.assertion_ids.map(id=>knownAssertions.get(id)!.value),...claim.evidence_ids.map(id=>knownEvidence.get(id)!.quote)].join('\n');
  const numbers=numberTokens(support),dates=dateTokens(support);
  if(/\d[\d,. ]*[kKmM]?\s*(?:to|or|[-–—])\s*(?:(?:GBP|EUR|USD|[£€$])\s*)?\d/i.test(claim.text)||/\b(around|about|approximately|at least|up to|between)\s+(?:(?:GBP|EUR|USD|[£€$])\s*)?\d/i.test(claim.text))fail('unsupported_value');
  if(numberTokens(claim.text).some(n=>!numbers.includes(n))||dateTokens(claim.text).some(d=>!dates.includes(d)))fail('unsupported_value');
  // Currency is part of a value, not an interchangeable display decoration.
  const currencies=[...claim.text.matchAll(/\b(GBP|EUR|USD)\b|[£€$]/g)].map(m=>m[1]??({'£':'GBP','€':'EUR','$':'USD'}[m[0]]));
  const supportedCurrencies=new Set([...claim.assertion_ids.map(id=>knownAssertions.get(id)!.currency),...claim.evidence_ids.map(id=>knownAssertions.get(knownEvidence.get(id)!.assertion_id)!.currency)]);
  if(currencies.some(c=>!supportedCurrencies.has(c??null)))fail('unsupported_value');
  for(const group of snapshot.conflicts){if(!group.assertionIds.some(id=>cited.has(id)))continue;
   if(group.assertionIds.some(id=>!cited.has(id)))fail('partial_conflict');
   // Deliberately conservative for the synthetic slice: clarify the dispute,
   // rather than repeat one disputed number/date as an established fact.
   if(!/\b(unresolved|disputed|conflicting|uncertain|clarify)\b/i.test(claim.text)||numberTokens(claim.text).length)fail('conflict_presented_as_fact');
  }
 }
 const factualClaims=advice.claims.filter(c=>!c.output_path.startsWith('/assumptions/')&&c.output_path!=='/draft');
 const coverage=checkClaimCoverage({...advice,draft:null,claims:factualClaims},{revision:snapshot.revision,materialVersion:snapshot.materialVersion,evidenceIds:[...knownEvidence.keys()],assertionIds:[...knownAssertions.keys()],unresolvedProposalIds:[...snapshot.pendingProposalIds]});
 if(coverage.length)fail('uncovered_statement');
 // Questions and assumptions are also covered; punctuation grants no exemption.
 for(const [path,value] of [['/decision_changing_question',advice.decision_changing_question],...advice.assumptions.map((s,i)=>[`/assumptions/${i}`,s])] as string[][]){
  for(const sentence of value.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean))if(!advice.claims.some(c=>c.output_path===path&&c.text===sentence))fail('uncovered_statement');
 }
 checkDraft(advice.draft,privacySnapshot,advice.claims);
 return {...advice,revision:snapshot.revision,material_version:snapshot.materialVersion,unresolved_proposal_ids:[...snapshot.pendingProposalIds],assertion_ids:[...new Set(advice.claims.flatMap(c=>c.assertion_ids))],evidence_ids:[...new Set(advice.claims.flatMap(c=>c.evidence_ids))]};
}
