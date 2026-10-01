import {endpoint} from '../../../../../../../src/workbook/runtime';
export async function GET(request:Request,ctx:{params:Promise<{caseId:string;adviceId:string}>}){return endpoint(request,async({owner,advice})=>{const p=await ctx.params;return advice.changes(owner,p.caseId,p.adviceId);});}
