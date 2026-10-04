import { prisma } from '@/lib/prisma';
import { requirePerson, HttpError } from '@/lib/desk/auth';
import { readOwnedArtifact } from '@/lib/desk/portal-import/artifacts.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request,{params}){
 try{
  const person=await requirePerson();
  const {id}=await params;
  const artifact=await readOwnedArtifact(prisma,person.id,id);
  if(!artifact)return Response.json({ok:false,error:'File not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
  const filename=artifact.name.replace(/[^A-Za-z0-9_.-]/g,'_')||'official-file';
  return new Response(new Uint8Array(artifact.bytes),{headers:{'Content-Type':artifact.mime,'Content-Length':String(artifact.bytes.length),'Content-Disposition':`attachment; filename="${filename}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }catch(error){
  return Response.json({ok:false,error:error instanceof HttpError?error.message:'Could not retrieve the saved file.'},{status:error instanceof HttpError?error.status:500,headers:{'Cache-Control':'no-store'}});
 }
}
