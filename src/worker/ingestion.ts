import {postgresDatabase,appDatabase,migrate} from '../workbook/database';
import {requireCurrentOwner} from '../workbook/identity';
import {configuredJobs,runOne} from '../ingestion/jobs';
// One invocation resumes one persisted text-foundation job. It does no model
// extraction yet: completion here means the original text is ready for M2b.
const owner=requireCurrentOwner();const url=process.env.DATABASE_URL;
if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
const db=postgresDatabase(url);
try{await migrate(db);const jobs=configuredJobs(appDatabase(db));
 const completed=await runOne(jobs,owner,async()=>{},Number(process.env.INGESTION_TIMEOUT_MS??30000));
 console.log(JSON.stringify({synthetic:true,stage:'text-foundation',completed}));
}finally{await db.close();}
