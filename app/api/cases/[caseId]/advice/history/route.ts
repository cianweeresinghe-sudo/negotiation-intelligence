import {endpoint} from '../../../../../../src/workbook/runtime';
export async function GET(request:Request,ctx:{params:Promise<{caseId:string}>}){return endpoint(request,async({owner,advice})=>advice.history(owner,(await ctx.params).caseId));}
