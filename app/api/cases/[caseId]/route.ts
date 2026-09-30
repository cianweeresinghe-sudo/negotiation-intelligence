import { endpoint, parseBody } from '../../../../src/workbook/runtime';
import { deleteInput } from '../../../../src/workbook/input';
type Params={params:Promise<{caseId:string}>};
export async function GET(r:Request,p:Params){return endpoint(r,async({owner,workbook})=>workbook.read(owner,(await p.params).caseId));}
export async function PATCH(r:Request,p:Params){return endpoint(r,async({owner,workbook})=>workbook.update(owner,(await p.params).caseId,await parseBody(r)));}
export async function DELETE(r:Request,p:Params){return endpoint(r,async({owner,workbook})=>{const input=deleteInput.parse(await parseBody(r));await workbook.remove(owner,(await p.params).caseId,input.expectedRevision);return {deleted:true};});}
