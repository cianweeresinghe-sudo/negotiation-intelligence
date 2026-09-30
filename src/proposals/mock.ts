import type {ExtractionAdapter} from './validate';
// Deterministic parser for the documented synthetic demo format, not a model.
export const proposalMock:ExtractionAdapter={async extract(source){
 const match=/(GBP|£)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s+(annually|annual|per year)/.exec(source.text);
 return {source_id:source.id,base_revision:0,candidates:match?[{field:'base',value:match[2].replace(/,/g,''),currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Literal synthetic amount and period.',sensitivity:'private',evidence:[{source_id:source.id,quote:match[0]}]}]:[],unknowns:[],conflicts:[]};
}};
