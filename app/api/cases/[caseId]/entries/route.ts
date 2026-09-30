import { endpoint, parseBody } from '../../../../../src/workbook/runtime';
export async function POST(r:Request,p:{params:Promise<{caseId:string}>}){return endpoint(r,async({owner,workbook})=>workbook.add(owner,(await p.params).caseId,await parseBody(r)));}
