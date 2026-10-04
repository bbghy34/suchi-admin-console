import { NextResponse } from 'next/server';
import { CLIENT } from '@/config/client';
import { luitAdminFromRequest } from '@/lib/luit-admin/session';
import { moduleRows, readWorkspace, updateWorkspace } from '@/lib/luit-admin/workspace';
import { systemStatus } from '@/lib/luit-admin/status';

export const dynamic = 'force-dynamic';

// Anyone but the Luit admin gets the same answer as a route that does not exist.
const notFound = () => NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
const noStore = { headers: { 'Cache-Control': 'private, no-store' } };

async function payload(workspace) {
  const { storageBucket, ...client } = CLIENT;
  return { client, modules: moduleRows(workspace), notice: workspace.notice, log: workspace.log, status: await systemStatus() };
}

export async function GET(request) {
  const admin = await luitAdminFromRequest(request);
  if (!admin) return notFound();
  return NextResponse.json({ success: true, admin, ...(await payload(await readWorkspace())) }, noStore);
}

export async function PATCH(request) {
  const admin = await luitAdminFromRequest(request);
  if (!admin) return notFound();
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return notFound();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Send the change as JSON.' }, { status: 400 });
  }
  try {
    const workspace = await updateWorkspace({ modules: body.modules, notice: body.notice }, admin);
    return NextResponse.json({ success: true, admin, ...(await payload(workspace)) }, noStore);
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
