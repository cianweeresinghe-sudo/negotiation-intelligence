import {endpoint,parseBody} from '../../../../../../src/workbook/runtime';
export async function POST(request:Request,ctx:{params:Promise<{caseId:string}>}){return endpoint(request,async({owner,advice})=>advice.settings(owner,(await ctx.params).caseId,await parseBody(request)));}
