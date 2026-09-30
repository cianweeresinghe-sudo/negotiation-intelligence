import {postgresDatabase,appDatabase} from '../src/workbook/database';
import {IngestionJobs} from '../src/ingestion/jobs';
import {requireCurrentOwner} from '../src/workbook/identity';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!=='/workbook_test')throw new Error('Synthetic test database required');
const db=postgresDatabase(url);const job=await new IngestionJobs(appDatabase(db)).claim(requireCurrentOwner());
process.send?.({job});
// Deliberately keep the test process alive until the smoke test kills it.
await new Promise(()=>{});
