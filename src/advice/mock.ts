import type {AdviceAdapter,AdviceSnapshot} from './types';
import type {Claim} from '../intelligence/contracts';
export const adviceMock:AdviceAdapter={version:'advice-mock-v1',async generate(snapshot:AdviceSnapshot){
 const claims:Claim[]=[],sentences:string[]=[],seen=new Set<string>();
 for(const a of snapshot.assertions){const group=snapshot.conflicts.find(g=>g.assertionIds.includes(a.id));if(group&&seen.has(group.id))continue;if(group)seen.add(group.id);
  const label=({base:'base salary',minimum_base:'minimum base salary'} as Record<string,string>)[a.field]??a.field;
  const value=a.currency?`${Number(a.value).toLocaleString('en-GB')} ${a.currency}`:a.value;
  const basis=a.period?({annual:'a year',monthly:'a month',one_time:'once'}[a.period]??a.period):'';
  const classification=({counterparty_claim:'a claim by the other side, not verified',documented_observation:'something you saw in a document',user_constraint:'your own limit or requirement',user_assumption:'your own assumption'} as Record<string,string>)[a.epistemic_type]??'a reviewed detail';
  const text=group?`There is an unresolved disagreement about ${a.field}.`:`The ${label} you reviewed is ${value}${basis?' '+basis:''} (${classification}).`;
  const ids=group?[...group.assertionIds]:[a.id];sentences.push(text);claims.push({text,output_path:'/situation',assertion_ids:ids,evidence_ids:snapshot.evidence.filter(e=>ids.includes(e.assertion_id)).map(e=>e.id)});
 }
 const group=snapshot.conflicts[0],ids=group?[...group.assertionIds]:[snapshot.assertions[0].id];
 const values={situation:sentences.join(' '),recommended_action:group?'Clarify the unresolved disagreement before deciding.':'Review the accepted evidence before deciding.',intended_effect:group?'Keep unresolved claims visible for review.':'Keep decisions tied to the reviewed evidence.',rationale:group?'The unresolved disagreement needs explicit user resolution.':'The accepted workbook preserves the source and its classification.',main_risk:group?'An unresolved disagreement can change the next move.':'The recorded claims may remain unverified.',alternative:group?'Seek clarification of the unresolved disagreement.':'Seek clarification before acting.',decision_changing_question:group?'Which unresolved claim should we clarify next?':'What evidence would change your next move?'};
 for(const [key,text] of Object.entries(values)){if(key==='situation')continue;claims.push({text,output_path:`/${key}`,assertion_ids:ids,evidence_ids:[]});}
 return {...values,revision:0,material_version:0,unresolved_proposal_ids:[...snapshot.pendingProposalIds],assumptions:[],draft:null,claims};
}};
