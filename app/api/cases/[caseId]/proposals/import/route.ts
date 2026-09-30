import {endpoint,parseBody} from '../../../../../../src/workbook/runtime';
import {runProposalJob} from '../../../../../../src/proposals/service';
import {proposalMock} from '../../../../../../src/proposals/mock';
export async function POST(request:Request,ctx:{params:Promise<{caseId:string}>}){
 return endpoint(request,async({owner,reviewJobs,proposals})=>{
  const caseId=(await ctx.params).caseId;
  const job=await reviewJobs.importText(owner,caseId,await parseBody(request,1300000));
  await runProposalJob(reviewJobs,proposals,owner,proposalMock,30000,caseId);
  return {job,jobs:await reviewJobs.list(owner,caseId)};
 });
}
