import {endpoint,parseBody} from '../../../../../src/workbook/runtime';
export async function POST(request:Request,ctx:{params:Promise<{caseId:string}>}){
 return endpoint(request,async({owner,jobs})=>jobs.importText(owner,(await ctx.params).caseId,await parseBody(request,1300000)));
}
export async function GET(request:Request,ctx:{params:Promise<{caseId:string}>}){
 return endpoint(request,async({owner,jobs})=>jobs.list(owner,(await ctx.params).caseId));
}
