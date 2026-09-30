import type {ExtractionAdapter} from './validate';
// Deterministic parser for the documented synthetic demo format, not a model.
export const proposalMock:ExtractionAdapter={async extract(source){
 // Demo safeguard: declines listed markers and requires a counterparty cue.
 // No text rule establishes whose amount this is. Legitimate offers containing
 // these markers are deliberately declined; manual entry remains available.
 const privateMarkers=/\b(minimum|floor|lowest|bottom line|reserv\w*|walk[ -]away|fallback|accept|below|do not share|confidential|private)\b/i;
 const firstPerson=/\b(i|me|my|mine)\b/i;
 const counterpartyCue=/\b(offer|offering|recruiter|hiring manager|employer|we|our|base salary)\b/i;
 const paragraphs=source.text.split(/\r?\n[ \t]*\r?\n/);
 const eligible=paragraphs.filter(paragraph=>counterpartyCue.test(paragraph)&&!firstPerson.test(paragraph)&&!privateMarkers.test(paragraph));
 const match=eligible.map(clause=>/(GBP|£)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s+(annually|annual|per year)/.exec(clause)).find(Boolean);
 return {source_id:source.id,base_revision:0,candidates:match?[{field:'base',value:match[2].replace(/,/g,''),currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Literal synthetic amount and period.',sensitivity:'private',evidence:[{source_id:source.id,quote:match[0]}]}]:[],unknowns:[],conflicts:[]};
}};
