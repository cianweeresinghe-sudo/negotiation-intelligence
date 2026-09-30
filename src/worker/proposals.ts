import {postgresDatabase,appDatabase,migrate} from '../workbook/database';
import {requireCurrentOwner} from '../workbook/identity';
import {IngestionJobs} from '../ingestion/jobs';
import {Proposals,runProposalJob} from '../proposals/service';
import {proposalMock} from '../proposals/mock';
const owner=requireCurrentOwner(),url=process.env.DATABASE_URL;
if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
const db=postgresDatabase(url);
try{await migrate(db);const app=appDatabase(db);const jobs=new IngestionJobs(app,'proposals-mock-v1',Number(process.env.INGESTION_MAX_ATTEMPTS??3),Number(process.env.INGESTION_LEASE_MS??60000));
 const completed=await runProposalJob(jobs,new Proposals(app),owner,proposalMock,Number(process.env.INGESTION_TIMEOUT_MS??30000),process.env.INGESTION_CASE_ID);
 console.log(JSON.stringify({synthetic:true,stage:'proposals',completed}));
}finally{await db.close();}
