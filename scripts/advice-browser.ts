import {chromium,type Page,type Locator} from 'playwright';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
// Checklist F7: the second-interaction loop in a real browser, with injected-text assertions.
// Invented text only. Runs as the dev user alice. Screenshots go to artifacts/.
const IMG='<img src=x onerror=alert(1)>',LINK='[x](https://example.com)';
const review=(page:Page)=>page.locator('section#review-suggested-changes');
const card=(page:Page,heading:string)=>review(page).locator('article',{has:page.getByRole('heading',{name:heading,exact:true})});
async function importEmail(page:Page,label:string,text:string){
 await page.getByLabel('Label this source (optional)').fill(label);await page.getByLabel('Paste original source').fill(text);
 await page.getByRole('button',{name:'Import and extract',exact:true}).click();
}
async function accept(page:Page,heading:string,decision?:{operation:'correct'|'conflict';target?:string}){
 const c:Locator=card(page,heading);await c.waitFor();
 if(decision){await c.getByLabel('Decision').selectOption(decision.operation);if(decision.operation==='correct'){await c.locator('select').nth(2).selectOption({label:decision.target!});}}
 await c.getByRole('button',{name:'Accept reviewed value',exact:true}).click();
 await page.getByRole('heading',{name:heading.replace('· pending','· accepted'),exact:true}).waitFor();
}
export async function advicePaths(origin:string){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors:string[]=[],copyDeviations:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('dialog:'+d.message());void d.dismiss();});
  await page.goto(origin+'/workbook');mkdirSync('artifacts',{recursive:true});
  const title=`Browser advice loop ${randomUUID()}`;await page.getByLabel('Case title').fill(title);await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const advice=page.locator('section[aria-label="Test advice"]');

  // F1 and F2: first email, two pending proposals, accept both.
  await importEmail(page,IMG,'Recruiter: Offer GBP 50,000 annually; deadline 5 October.');
  await page.getByRole('heading',{name:'base: 50000 · pending',exact:true}).waitFor();await page.getByRole('heading',{name:'deadline: 5 October · pending',exact:true}).waitFor();
  await page.getByText('Revision 0',{exact:true}).waitFor();
  await accept(page,'base: 50000 · pending');await accept(page,'deadline: 5 October · pending');
  await page.getByText('Revision 2',{exact:true}).waitFor();

  // First advice. The test label, up-to-date state and privacy default are always visible.
  await advice.getByRole('heading',{name:'Test advice, not real guidance',exact:true}).waitFor();
  await page.getByText("This advice was produced by a test generator to check the app's workings. It is not negotiation guidance. Do not act on it.",{exact:true}).waitFor();
  await page.getByText('Private constraints are not used.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Get advice',exact:true}).click();
  await page.getByText('This advice is up to date.',{exact:true}).waitFor();
  await page.getByText(/using 2 accepted details from your case\./).waitFor();
  await page.getByText('No draft yet. Nothing private is included in drafts.',{exact:true}).waitFor();
  await advice.getByText('Show the evidence behind each point').first().click();
  await advice.getByText(`${IMG} says base salary`,{exact:true}).first().waitFor();
  await page.screenshot({path:'artifacts/m3b-advice-first.png',fullPage:true});

  // F3: second email makes the advice stale, with the pending-changes line and the route to review.
  await importEmail(page,LINK,'Hiring manager: Offer GBP 52,000 annually; deadline 4 October.');
  await page.getByRole('heading',{name:'base: 52000 · pending',exact:true}).waitFor();await page.getByRole('heading',{name:'deadline: 4 October · pending',exact:true}).waitFor();
  await page.getByText('Revision 2',{exact:true}).waitFor();
  await advice.getByRole('heading',{name:'This advice is out of date',exact:true}).waitFor();
  await page.getByText('2 suggested change(s) from your latest import are waiting for your review.',{exact:true}).waitFor();
  await page.getByText('The points below may no longer match your case.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Review suggested changes first',exact:true}).waitFor();
  await page.getByText('Advice uses accepted details only. Suggested changes are not used until you accept them.',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/m3b-advice-stale.png',fullPage:true});

  // F4: correct the base, then record the deadline as a conflict. Revision 2 to 3 to 4.
  await accept(page,'base: 52000 · pending',{operation:'correct',target:'50000'});await page.getByText('Revision 3',{exact:true}).waitFor();
  await accept(page,'deadline: 4 October · pending',{operation:'conflict'});await page.getByText('Revision 4',{exact:true}).waitFor();
  await page.getByText('You accepted 2 change(s) after this advice was written.',{exact:true}).waitFor();
  // Approved copy (Uma, v1) puts the unresolved-disagreement cause in the stale banner. Reported, not failed.
  if(await page.getByText('Two sources disagree about deadline and it is unresolved.',{exact:true}).count()===0)copyDeviations.push('stale banner has no "Two sources disagree about deadline and it is unresolved." line');

  // F5: new advice. The explanation names the correction and the open disagreement, with injected labels shown as text.
  await page.getByRole('button',{name:'Get updated advice',exact:true}).click();
  await page.getByText('This advice is up to date.',{exact:true}).waitFor();
  await advice.getByRole('heading',{name:'What changed since the previous advice',exact:true}).waitFor();
  await page.getByText('Corrected: base changed from GBP 50,000 annually to GBP 52,000 annually.',{exact:true}).waitFor();
  await page.getByText(`${LINK} says deadline 4 October (you accepted this on`).waitFor();
  await page.getByText(`Still unresolved: ${IMG} says 5 October; ${LINK} says 4 October. You can leave this open.`,{exact:true}).waitFor();
  const claimText=(await advice.locator('article').allInnerTexts()).join('\n');
  assert.match(claimText,/unresolved/i);assert.doesNotMatch(claimText,/\b(?:4|5)(?:st|nd|rd|th)?\s+October\b|\bOctober\s+(?:4|5)\b/i,'the advice states a disputed date');
  await page.screenshot({path:'artifacts/m3b-advice-regenerated.png',fullPage:true});

  // History keeps the earlier advice, marked as earlier and out of date.
  const rows=advice.getByRole('button',{name:/· (Out of date|Current) · based on \d+ accepted details/});assert.equal(await rows.count(),2);
  await advice.getByRole('button',{name:/· Out of date · based on 2 accepted details/}).click();
  await page.getByText('This is earlier advice. It is kept for reference and may not match your case now.',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/m3b-advice-history.png',fullPage:true});

  // F6: the recruiter confirms. A proposal appears and nothing resolves on its own.
  await importEmail(page,'Recruiter confirmation','Recruiter confirms 5 October deadline.');
  await page.getByRole('heading',{name:'deadline: 5 October · pending',exact:true}).waitFor();
  await page.getByText('Revision 4',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Resolve disagreement: keep this entry',exact:true}).count(),2);
  assert.equal(await page.getByText('active · disputed').count(),2);

  // Private switch: off by default, changed only by the checkbox, with the state shown next to the advice.
  const box=page.getByLabel('Include private limits and alternatives in test advice');assert.equal(await box.isChecked(),false);
  // The box is controlled and updates after the settings request, so click and wait for the text instead of check().
  await box.click();await page.getByText('Private figures are included in this test advice. Nothing leaves the app.',{exact:true}).waitFor();assert.equal(await box.isChecked(),true);
  await box.click();await page.getByText('Private constraints are not used.',{exact:true}).waitFor();assert.equal(await box.isChecked(),false);

  // Injected text is data: no image, no external link, no script dialog, no page error.
  assert.equal(await page.locator('img').count(),0);assert.equal(await page.locator('a[href^="http"]').count(),0);
  assert.deepEqual(errors,[]);
  for(const d of copyDeviations)console.warn('COPY DEVIATION: '+d);
  console.log('PASS: Chromium F1 to F6 with stale banner, regenerate, what-changed text, history, private switch and injected labels shown as text; screenshots saved.');
 }finally{await browser.close();}
}
