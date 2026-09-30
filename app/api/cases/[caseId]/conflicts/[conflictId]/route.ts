import { endpoint,parseBody } from '../../../../../../src/workbook/runtime';
export async function POST(r:Request,p:{params:Promise<{caseId:string;conflictId:string}>}){return endpoint(r,async({owner,workbook})=>{const ids=await p.params;return workbook.resolve(owner,ids.caseId,ids.conflictId,await parseBody(r));});}
