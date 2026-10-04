import { after, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HttpError } from '@/lib/desk/auth';
import { importer } from '@/lib/desk/portal-import/service';
import { getJob, getOwnedJobInput, enqueueJob } from '@/lib/desk/portal-import/jobs.mjs';
import { executeImportJob } from '@/lib/desk/portal-import/job-worker';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request,{params}) {
 try {
  const person=await importer(),{id}=await params;
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({ok:false,error:'Retry this job from Tender Desk.'},403);
  const job=await getJob(prisma,id,person.id);
  if(!job)return reply({ok:false,error:'Download job not found.'},404);
  if(!job.canRetry)return reply({ok:false,error:'This job does not need a retry. Open its current result.'},409);
  if(job.retryAt&&new Date(job.retryAt).getTime()>Date.now())return reply({ok:false,error:'The official portal is still cooling down. Try after the displayed time.',retryAt:job.retryAt},429);
  const payload=await getOwnedJobInput(prisma,id,person.id);
  if(!payload)return reply({ok:false,error:'Return to the search result to start a new download.'},410);
  const result=await enqueueJob(prisma,person.id,payload);
  if(!result.existing)after(()=>executeImportJob(result.job.id));
  return reply({ok:true,...result},202);
 } catch(error){const status=error instanceof HttpError||[400,401,403,413,429].includes(error.status)?error.status:500;return reply({ok:false,error:status===500?'Could not retry this download job.':error.message},status);}
}
