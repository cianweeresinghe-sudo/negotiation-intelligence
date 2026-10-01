import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeChanges} from '../src/advice/changes';
const before={revision:2,includePrivateConstraints:false,proposalStates:[{id:'accepted',status:'accepted'},{id:'rejected',status:'rejected'}],jobStates:[{id:'old-job',status:'complete'}]};
test('counter-only changes report pending and newly rejected records without claiming accepted changes',()=>{
 const result=summarizeChanges(before,{...before,proposalStates:[...before.proposalStates,{id:'new-reject',status:'rejected'},{id:'pending-1',status:'pending'},{id:'pending-2',status:'pending'}],jobStates:[...before.jobStates,{id:'new-job',status:'complete'}]});
 assert.deepEqual(result,{acceptedChanges:0,pending:2,rejectedSince:1,newJobs:1,modelVisibilityChanged:false,acceptedDetailsUnchanged:true});
});
test('accepted correction and conflict count each committed revision',()=>{
 const result=summarizeChanges(before,{...before,revision:4});assert.equal(result.acceptedChanges,2);assert.equal(result.acceptedDetailsUnchanged,false);
});
test('model visibility changes are distinct from accepted detail changes',()=>{
 const result=summarizeChanges(before,{...before,includePrivateConstraints:true});assert.equal(result.modelVisibilityChanged,true);assert.equal(result.acceptedDetailsUnchanged,true);
});
