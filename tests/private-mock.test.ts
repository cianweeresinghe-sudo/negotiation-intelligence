import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalMock} from '../src/proposals/mock';
import {validateCandidates} from '../src/proposals/validate';
const source=(text:string)=>({id:'synthetic',text,sensitivity:'private' as const});
test('private markers never become offer-base proposals in the synthetic mock',async()=>{
 for(const marker of ['My','minimum','floor','walk-away','walk away','fallback','do not share']){
  const s=source(`${marker}: GBP 48,000 annually.`);const raw=await proposalMock.extract(s,new AbortController().signal);assert.equal(validateCandidates(raw,s).candidates.length,0,marker);
 }
});
test('mock retains a distinct offer sentence after declining a private strategy sentence',async()=>{
 const s=source('My minimum is GBP 48,000 annually. Offer: GBP 52,000 annually.');const result=validateCandidates(await proposalMock.extract(s,new AbortController().signal),s);assert.deepEqual(result.candidates.map(c=>c.value),['52000']);assert.equal(result.candidates[0].evidence[0].quote,'GBP 52,000 annually');
});
test('mock never borrows a private amount from a mixed strategy sentence',async()=>{
 const s=source('Offer GBP 52,000 annually; my minimum GBP 48,000 annually.');assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates.length,0);
});
