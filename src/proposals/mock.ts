import type {ExtractionAdapter} from './validate';
// Deterministic parser for the documented synthetic demo format, not a model.
export const proposalMock:ExtractionAdapter={async extract(source){
 // Demo safeguard: declines listed markers and requires a counterparty cue.
 // No text rule establishes whose amount this is. Legitimate offers containing
 // these markers are deliberately declined; manual entry remains available.
 const privateMarkers=/\b(minimum|floor|lowest|bottom line|reserv\w*|walk[ -]away|fallback|accept|below|do not share|confidential|private)\b/i;
 const firstPerson=/\b(i|me|my|mine)\b/i;
 const counterpartyCue=/\b(offer|offering|recruiter|hiring manager|employer|we|our|base salary)\b/i;
 // Hedge cues bind to an amount; 'asked about salary' is a known authority gap.
 const hedges=/\b(to|between|from|up to|at least|around|about|approximately)\s+(?:(?:GBP|£)\s*)?\d/i;
 const amountRange=/\d[\d,. ]*[kKmM]?\s*[-–—]\s*(?:(?:GBP|£)\s*)?\d/;
 const maskDates=(text:string)=>text.replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?(?!\d)/g,'').replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?\b/gi,'');
 const paragraphs=source.text.split(/\r?\n[ \t]*\r?\n/);
 const eligible=paragraphs.filter(paragraph=>paragraph.length<=4000&&counterpartyCue.test(paragraph)&&!firstPerson.test(paragraph)&&!privateMarkers.test(paragraph)&&!hedges.test(maskDates(paragraph))&&!amountRange.test(maskDates(paragraph)));
 const candidates=[];
 const match=eligible.map(clause=>/(GBP|£)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s+(annually|annual|per year)/.exec(clause)).find(Boolean);
 if(match)candidates.push({field:'base',value:match[2].replace(/,/g,''),currency:'GBP',period:'annual',epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Literal synthetic amount and period.',sensitivity:'private',evidence:[{source_id:source.id,quote:match[0]}]});
 // Literal dates only: no inferred year, authority or automatic conflict resolution.
 const datePattern=/\b(?:deadline|reply by|confirms?)\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?)\b/gi;
 for(const paragraph of eligible){
  if(/\b(?:around|about|approximately|between|up to|from)\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+/i.test(paragraph))continue;
  if(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:to|or|[-–—])\s+\d/i.test(paragraph))continue;
  for(const date of paragraph.matchAll(datePattern)){
   if(candidates.length>=30)break;
   candidates.push({field:'deadline',value:date[1],currency:null,period:null,epistemic_type:'counterparty_claim',confidence:'high',confidence_rationale:'Literal synthetic deadline.',sensitivity:'private',evidence:[{source_id:source.id,quote:date[0]}]});
  }
 }
 return {source_id:source.id,base_revision:0,candidates,unknowns:[],conflicts:[]};
}};
