import { endpoint, parseBody } from '../../../../../../src/workbook/runtime';
export async function PATCH(r:Request,p:{params:Promise<{caseId:string;entryId:string}>}){return endpoint(r,async({owner,workbook})=>{const ids=await p.params;return workbook.correct(owner,ids.caseId,ids.entryId,await parseBody(r));});}
