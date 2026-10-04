import { after, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePerson, HttpError } from '@/lib/desk/auth';
import { importer } from '@/lib/desk/portal-import/service';
import { enqueueJob, listJobs } from '@/lib/desk/portal-import/jobs.mjs';
import { executeImportJob } from '@/lib/desk/portal-import/job-worker';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(error) {
  const status = error instanceof HttpError || [400,401,403,413,429].includes(error.status) ? error.status : 500;
  return reply({ ok: false, error: status === 500 ? 'Could not update the download job. Please try again.' : error.message }, status);
}
export async function GET() {
  try { const person = await requirePerson(); return reply({ ok: true, jobs: await listJobs(prisma, person.id) }); }
  catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const person = await importer();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ ok: false, error: 'Start this job from Tender Desk.' },403);
    if (!request.headers.get('content-type')?.includes('application/json')) return reply({ok:false,error:'Expected a JSON request.'},415);
    const raw = await request.text();
    if (Buffer.byteLength(raw,'utf8') > 20000) return reply({ok:false,error:'Official retrieval request is too large.'},413);
    let input; try { input = JSON.parse(raw); } catch { return reply({ok:false,error:'Choose a tender search result.'},400); }
    const result = await enqueueJob(prisma,person.id,input);
    if (!result.existing) after(() => executeImportJob(result.job.id));
    return reply({ok:true,...result},202);
  } catch (error) { return failure(error); }
}
