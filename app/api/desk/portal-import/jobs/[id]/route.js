import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePerson, HttpError } from '@/lib/desk/auth';
import { getJob } from '@/lib/desk/portal-import/jobs.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request,{params}) {
  try {
    const person = await requirePerson(),{id}=await params;
    const job=await getJob(prisma,id,person.id);
    return NextResponse.json(job?{ok:true,job}:{ok:false,error:'Download job not found.'},{status:job?200:404,headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return NextResponse.json({ok:false,error:error instanceof HttpError?error.message:'Could not read this download job.'},{status:error instanceof HttpError?error.status:500});}
}
