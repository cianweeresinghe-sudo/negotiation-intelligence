import { postgresDatabase, migrate, appDatabase } from './database';
import { requireCurrentOwner } from './identity';
import { Workbook, WorkbookError } from './service';
import { ZodError } from 'zod';
const globalDb = globalThis as typeof globalThis & { workbookPromise?: Promise<Workbook> };
export async function currentWorkbook() {
 const owner=requireCurrentOwner();
 const url=process.env.DATABASE_URL;
 if(!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new WorkbookError(503,'Local synthetic database is not configured');
 globalDb.workbookPromise ??= (async()=>{const db=postgresDatabase(url);await migrate(db);return new Workbook(appDatabase(db));})();
 return { owner, workbook:await globalDb.workbookPromise };
}
export function guardRequest(request: Request) {
 const url=new URL(request.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new WorkbookError(403,'Local requests only');
 if(!['GET','HEAD'].includes(request.method) && request.headers.get('origin')!==url.origin)throw new WorkbookError(403,'Origin not allowed');
}
export async function parseBody(request: Request):Promise<unknown> {
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new WorkbookError(422,'JSON input required');
 const reader=request.body?.getReader();if(!reader)throw new WorkbookError(422,'Input required');
 let total=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>10000){await reader.cancel();throw new WorkbookError(413,'Input too large');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new WorkbookError(422,'Invalid JSON');}
}
export async function endpoint(request: Request, run:(ctx:Awaited<ReturnType<typeof currentWorkbook>>)=>Promise<unknown>) {
 try {guardRequest(request);return Response.json(await run(await currentWorkbook()),{headers:{'Cache-Control':'no-store'}});}
 catch(error){
  if(error instanceof WorkbookError)return Response.json({error:error.message},{status:error.status});
  if(error instanceof ZodError)return Response.json({error:'Invalid input'},{status:422});
  // Never expose SQL messages, credentials, values or source text.
  return Response.json({error:'Workbook unavailable'},{status:503});
 }
}
