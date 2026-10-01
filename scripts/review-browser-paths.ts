import {chromium,type Page} from 'playwright';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
// Browser paths not covered by review-browser.ts: reject, equal-value duplicate dismissal,
// and the changed-target acknowledgement. Invented text only. Runs as the dev user alice.
async function newCase(page:Page,origin:string,label:string){
 const title=`${label} ${randomUUID()}`;await page.getByLabel('Case title').fill(title);
 const created=page.waitForResponse(r=>r.url()===origin+'/api/cases'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create',exact:true}).click();const id=(await (await created).json()).id as string;
 await page.getByRole('heading',{name:title,exact:true}).waitFor();return {title,id};
}
async function importText(page:Page,text:string){
 await page.getByLabel('Paste original source').fill(text);await page.getByRole('button',{name:'Import and extract',exact:true}).click();
}
async function addManual(page:Page,value:string){
 await page.getByLabel('Value',{exact:true}).fill(value);await page.getByRole('button',{name:'Save manual entry',exact:true}).click();
}
export async function reviewPaths(origin:string){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/workbook');
  mkdirSync('artifacts',{recursive:true});

  // 1. Reject: the proposal is decided and the workbook and revision are unchanged.
  await newCase(page,origin,'Browser reject');await importText(page,'Offer: £52,000 annually');
  await page.getByRole('heading',{name:'base: 52000 · pending',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.getByRole('heading',{name:'base: 52000 · rejected',exact:true}).waitFor();
  await page.getByText('Revision 0',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Accept reviewed value',exact:true}).count(),0);
  assert.equal(await page.getByText('Accepted from reviewed paste',{exact:true}).count(),0);
  await page.screenshot({path:'artifacts/m2c-rejected.png',fullPage:true});

  // 2. Equal value: default is to dismiss as a duplicate, leaving the manual entry untouched.
  await newCase(page,origin,'Browser duplicate');await addManual(page,'52000');
  await page.getByText('Revision 1',{exact:true}).waitFor();await page.getByText('Original manual entry',{exact:true}).waitFor();
  await importText(page,'Offer: £52,000 annually');
  await page.getByRole('heading',{name:'base: 52000 · pending',exact:true}).waitFor();
  await page.getByText('Same value: dismiss as duplicate to preserve the accepted source.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Replace with this source',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Dismiss duplicate',exact:true}).click();
  await page.getByRole('heading',{name:'base: 52000 · rejected',exact:true}).waitFor();
  await page.getByText('Revision 1',{exact:true}).waitFor();await page.getByText('Original manual entry',{exact:true}).waitFor();
  assert.equal(await page.getByText('Accepted from reviewed paste',{exact:true}).count(),0);
  await page.screenshot({path:'artifacts/m2c-duplicate.png',fullPage:true});

  // 3. Changed target: a different active value forces an explicit decision and acknowledgement.
  const target=await newCase(page,origin,'Browser changed target');await importText(page,'Offer: £52,000 annually');
  await page.getByRole('heading',{name:'base: 52000 · pending',exact:true}).waitFor();
  const pid=((await (await page.request.get(`${origin}/api/cases/${target.id}/proposals`)).json()).proposals[0].id) as string;
  await addManual(page,'50000');await page.getByText('Revision 1',{exact:true}).waitFor();
  await page.getByText('Current: 50000 · counterparty_claim',{exact:true}).waitFor();
  const accept=page.getByRole('button',{name:'Accept reviewed value',exact:true});
  assert.equal(await accept.isDisabled(),true);
  // The server refuses an unacknowledged accept against the changed target with re_review.
  const refused=await page.request.post(`${origin}/api/cases/${target.id}/proposals/${pid}/accept`,{headers:{origin,'content-type':'application/json'},data:{expectedRevision:1,operation:'conflict'}});
  assert.equal(refused.status(),409);assert.equal((await refused.json()).code,'re_review');
  await page.getByLabel('Decision').selectOption('conflict');assert.equal(await accept.isDisabled(),true);
  await page.getByLabel(/Target changed/).check();assert.equal(await accept.isDisabled(),false);
  await page.screenshot({path:'artifacts/m2c-changed-target.png',fullPage:true});
  await accept.click();
  await page.getByRole('heading',{name:'base: 52000 · accepted',exact:true}).waitFor();
  await page.getByText('active · disputed').first().waitFor();await page.getByText('Revision 2',{exact:true}).waitFor();
  assert.equal(await page.locator('article h3',{hasText:'base: 50000'}).count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: Chromium reject, duplicate dismissal and changed-target acknowledgement paths; screenshots saved.');
 }finally{await browser.close();}
}
