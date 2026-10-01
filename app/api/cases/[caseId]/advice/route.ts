import {endpoint,parseBody} from '../../../../../src/workbook/runtime';
import {adviceMock} from '../../../../../src/advice/mock';
export async function GET(request:Request,ctx:{params:Promise<{caseId:string}>}){return endpoint(request,async({owner,advice})=>advice.latest(owner,(await ctx.params).caseId));}
export async function POST(request:Request,ctx:{params:Promise<{caseId:string}>}){return endpoint(request,async({owner,advice})=>advice.generate(owner,(await ctx.params).caseId,await parseBody(request),adviceMock));}
