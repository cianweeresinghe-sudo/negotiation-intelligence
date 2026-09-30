import { endpoint } from '../../../../../src/workbook/runtime';
export async function GET(r:Request,p:{params:Promise<{caseId:string}>}){return endpoint(r,async({owner,workbook})=>workbook.history(owner,(await p.params).caseId));}
