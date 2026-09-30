import {endpoint,parseBody} from '../../../../../../../src/workbook/runtime';
export async function POST(r:Request,p:{params:Promise<{caseId:string;proposalId:string}>}){return endpoint(r,async({owner,workbook})=>{const ids=await p.params;return workbook.rejectProposal(owner,ids.caseId,ids.proposalId,await parseBody(r));});}
