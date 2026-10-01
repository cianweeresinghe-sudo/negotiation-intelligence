// Compare persisted state, never ask the adapter for a causal explanation.
export type ReviewState={id:string;status:string};
export type ChangeSummary={acceptedChanges:number;pending:number;rejectedSince:number;newJobs:number;modelVisibilityChanged:boolean;acceptedDetailsUnchanged:boolean};
export function summarizeChanges(before:{revision:number;includePrivateConstraints:boolean;proposalStates:readonly ReviewState[];jobStates:readonly ReviewState[]},now:{revision:number;includePrivateConstraints:boolean;proposalStates:readonly ReviewState[];jobStates:readonly ReviewState[]}):ChangeSummary{
 const previous=new Map(before.proposalStates.map(p=>[p.id,p.status]));
 const jobs=new Set(before.jobStates.map(j=>j.id));
 return {acceptedChanges:Math.max(0,now.revision-before.revision),pending:now.proposalStates.filter(p=>p.status==='pending').length,rejectedSince:now.proposalStates.filter(p=>p.status==='rejected'&&previous.get(p.id)!=='rejected').length,newJobs:now.jobStates.filter(j=>!jobs.has(j.id)).length,modelVisibilityChanged:before.includePrivateConstraints!==now.includePrivateConstraints,acceptedDetailsUnchanged:before.revision===now.revision};
}
