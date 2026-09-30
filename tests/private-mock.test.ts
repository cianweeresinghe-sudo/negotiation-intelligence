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
 const s=source('My minimum is GBP 48,000 annually.\n\nOffer: GBP 52,000 annually.');const result=validateCandidates(await proposalMock.extract(s,new AbortController().signal),s);assert.deepEqual(result.candidates.map(c=>c.value),['52000']);assert.equal(result.candidates[0].evidence[0].quote,'GBP 52,000 annually');
});
test('mock never borrows a private amount from a mixed strategy sentence',async()=>{
 const s=source('Offer GBP 52,000 annually; my minimum GBP 48,000 annually.');assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates.length,0);
});
test('first-person bypasses and mixed offer-strategy sentences fail closed',async()=>{
 for(const text of ["I won't accept below GBP 45,000 annually.","I would walk at anything under £45,000 per year.","Please do not tell them I need at least GBP 47,000 annually.","Offer GBP 52,000 annually; I won't go below GBP 45,000 annually",'GBP 52,000 annually.']){const s=source(text);assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates.length,0,text);}
});
test('a clause needs an explicit offer cue and no first-person cue',async()=>{
 for(const cue of ['Offer','Offering','Recruiter','Hiring manager','Employer','Base salary','We offer','Our offer']){const s=source(`${cue}: GBP 52,000 annually.`);assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates[0]?.value,'52000',cue);}
 for(const pronoun of ['I',"I'd","I'll","I'm",'me','my','mine']){const s=source(`Offer ${pronoun}: GBP 52,000 annually.`);assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates.length,0,pronoun);}
});
test('private labels retain their following amount line and cannot borrow an offer cue',async()=>{
 for(const text of ['My minimum is:\nGBP 48,000 annually.','Private notes\nminimum base\nGBP 48,000 annually','The lowest I would accept is GBP 48,000 annually.','My minimum base salary is:\nGBP 48,000 annually.']){const s=source(text);assert.equal(validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates.length,0,text);}
});
test('reviewer probe table pins conservative losses and distinct supported offers',async()=>{
 const cases:[string,string|null][]=[
 ['Offer: GBP 52,000 annually.','52000'],['I cannot go below GBP 48,000 annually.',null],['I would not accept less than GBP 48,000 annually.',null],['I need GBP 48,000 annually to move.',null],['The lowest I will take is GBP 48,000 annually.',null],['Bottom line for me: GBP 48,000 annually.',null],['Reservation value GBP 48,000 annually.',null],['Confidential: GBP 48,000 annually is my limit.',null],['Offer for my role: GBP 52,000 annually.',null],['Minimum guaranteed base GBP 52,000 annually.',null],['Offer: GBP 52,000\nannually. My floor: GBP 48,000 annually.',null],['My minimum is:\nGBP 48,000 annually.',null],['Private notes\nminimum base\nGBP 48,000 annually',null],['The lowest I would accept is GBP 48,000 annually.',null],['Offer GBP 52,000 annually. I would walk away below GBP 48,000 annually.',null],['My employer offer is GBP 52,000 annually.',null],['Our base salary offer: GBP 52,000 annually.','52000']];
 for(const [text,expected] of cases){const s=source(text),rows=validateCandidates(await proposalMock.extract(s,new AbortController().signal),s).candidates;assert.deepEqual(rows.map(c=>c.value),expected?[expected]:[],text);}
});
