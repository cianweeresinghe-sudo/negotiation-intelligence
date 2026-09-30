import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {postgresDatabase} from '../src/workbook/database';
export async function reviewBrowser(origin:string,database:string){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/workbook');
  const title=`Browser synthetic ${randomUUID()}`;await page.getByLabel('Case title').fill(title);
  const created=page.waitForResponse(r=>r.url()===origin+'/api/cases'&&r.request().method()==='POST');await page.getByRole('button',{name:'Create',exact:true}).click();const caseId=(await (await created).json()).id;
  await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.getByLabel('Paste original source').fill('£52,000 annually');await page.getByRole('button',{name:'Import and extract',exact:true}).click();
  await page.getByRole('heading',{name:'base: 52000 · pending',exact:true}).waitFor();
  // Use the persisted column names to verify the real job-to-screen path.
  const db=postgresDatabase(database);try{await db.query('UPDATE ingestion_jobs SET advisory_unknowns=$2::jsonb,advisory_conflicts=$3::jsonb WHERE case_id=$1',[caseId,JSON.stringify(['Unknown <img src=x onerror=alert(1)>']),JSON.stringify(['Conflict [details](https://example.com)'])]);}finally{await db.close();}
  await page.reload();await page.getByRole('button',{name:title,exact:true}).click();await page.getByText('Unknown <img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('img').count(),0);assert.equal(await page.getByRole('link',{name:'details',exact:true}).count(),0);
  mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/m2c-review.png',fullPage:true});
  await page.getByRole('button',{name:'Accept reviewed value',exact:true}).click();await page.getByRole('heading',{name:'base: 52000 · accepted',exact:true}).waitFor();await page.screenshot({path:'artifacts/m2c-accepted.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: Chromium import → quoted pending review → literal advisories → accept → accepted workbook; screenshots saved.');
 }finally{await browser.close();}
}
