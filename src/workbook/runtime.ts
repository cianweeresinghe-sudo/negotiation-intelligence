import { postgresDatabase, migrate, appDatabase } from './database';
import { requireCurrentOwner } from './identity';
import { Workbook, WorkbookError } from './service';
import { Proposals } from '../proposals/service';
import { IngestionJobs,configuredJobs } from '../ingestion/jobs';
import { ZodError } from 'zod';
const globalDb = globalThis as typeof globalThis & { workbookPromise?: Promise<{workbook:Workbook;jobs:IngestionJobs;proposals:Proposals;reviewJobs:IngestionJobs}> };
export async function currentWorkbook() {
 const owner=requireCurrentOwner();
 const url=process.env.DATABASE_URL;
 if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new WorkbookError(503,'Local synthetic database is not configured');
 globalDb.workbookPromise ??= (async()=>{const db=postgresDatabase(url);try{await migrate(db);const app=appDatabase(db);return {workbook:new Workbook(app),jobs:configuredJobs(app),proposals:new Proposals(app),reviewJobs:new IngestionJobs(app,'proposals-mock-v1')};}catch(error){await db.close();throw error;}})().catch(error=>{globalDb.workbookPromise=undefined;throw error;});
 return {owner,...await globalDb.workbookPromise};
}
export function guardRequest(request: Request) {
 const url=new URL(request.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new WorkbookError(403,'Local requests only');
 // Next may normalize request.url to localhost even when the browser used
 // 127.0.0.1. Verify the actual local Host, then compare Origin to that host.
 const host=request.headers.get('host')??url.host;
 const incoming=new URL(`${url.protocol}//${host}`);
 if(incoming.host!==host || !['localhost','127.0.0.1','[::1]'].includes(incoming.hostname))throw new WorkbookError(403,'Local requests only');
 if(!['GET','HEAD'].includes(request.method) && request.headers.get('origin')!==incoming.origin)throw new WorkbookError(403,'Origin not allowed');
}
export async function parseBody(request: Request, maxBytes=10000):Promise<unknown> {
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new WorkbookError(422,'JSON input required');
 const reader=request.body?.getReader();if(!reader)throw new WorkbookError(422,'Input required');
 let total=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new WorkbookError(413,'Input too large');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new WorkbookError(422,'Invalid JSON');}
}
export async function endpoint(request: Request, run:(ctx:Awaited<ReturnType<typeof currentWorkbook>>)=>Promise<unknown>) {
 try {guardRequest(request);return Response.json(await run(await currentWorkbook()),{headers:{'Cache-Control':'no-store'}});}
 catch(error){
  if(error instanceof WorkbookError)return Response.json({error:error.message,code:error.code},{status:error.status});
  if(error instanceof ZodError)return Response.json({error:'Invalid input'},{status:422});
  // Record only classifications, never SQL messages, credentials or values.
  const code=(error as {code?:string}).code;
  console.error('workbook_request_failed',{operation:request.method,errorClass:error instanceof Error?error.name:'UnknownError',sqlState:code&&/^[0-9A-Z]{5}$/.test(code)?code:undefined});
  return Response.json({error:'Workbook unavailable'},{status:503});
 }
}
