import { endpoint, parseBody } from '../../../src/workbook/runtime';
export const dynamic='force-dynamic';
export async function GET(request:Request){return endpoint(request,async({owner,workbook})=>workbook.list(owner));}
export async function POST(request:Request){return endpoint(request,async({owner,workbook})=>workbook.create(owner,await parseBody(request)));}
