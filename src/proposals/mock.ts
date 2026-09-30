import type {ExtractionAdapter} from './validate';
// Deterministic parser for the documented synthetic demo format, not a model.
export const proposalMock:ExtractionAdapter={async extract(source){
 // Fail closed for first-person strategy: this synthetic parser cannot establish
 // whose amount it is. Do not convert a private position into an offer claim.
 const privateMarkers=/\b(my|minimum|floor|walk[ -]away|fallback|do not share)\b/i;
 const clauses=source.text.split(/(?<=[.!?])\s+|[\r\n]+/);
 const eligible=clauses.filter(clause=>!privateMarkers.test(clause));
 const match=eligible.map(clause=>/(GBP|£)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s+(annually|annual|per year)/.exec(clause)).find(Boolean);
 return {source_id:source.id,base_revision:0,candidates:match?[{field:'base',value:match[2].replace(/,/g,''),currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Literal synthetic amount and period.',sensitivity:'private',evidence:[{source_id:source.id,quote:match[0]}]}]:[],unknowns:[],conflicts:[]};
}};
