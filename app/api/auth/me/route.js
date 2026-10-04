import { NextResponse } from 'next/server';
import { getAuthToken, requireAuth, signToken, verifyToken } from '@/lib/auth';
import { bigintSafeSerialize } from '@/lib/api-response';
import { canUseTenderDesk, canViewBills, isLuitAdmin } from '@/lib/roles';
import { modulesFor, readWorkspace } from '@/lib/luit-admin/workspace';
import { SESSION_TTL_SECONDS } from '@/lib/session';

export const GET = requireAuth(async (request, { user }) => {
  const employee = bigintSafeSerialize(user);
  employee.canViewBills = canViewBills(employee.accountRole);
  employee.canUseTenderDesk = canUseTenderDesk(employee.accountRole);
  // Modules switched on in the Luit admin panel, and its workspace notice.
  const workspace = await readWorkspace();
  employee.enabledModules = modulesFor(workspace, { luitAdmin: isLuitAdmin(employee.accountRole) });
  employee.workspaceNotice = workspace.notice.active ? { text: workspace.notice.text, tone: workspace.notice.tone } : null;
  delete employee.accountRole;
  const response = NextResponse.json(
    {
      success: true,
      employee,
      data: { employee, user: employee },
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
  );

  // Sessions signed before a flag existed are re-signed so the middleware sees it.
  const current = verifyToken(getAuthToken(request) || '');
  const staleBills = employee.canViewBills && current?.bills !== true;
  const staleDesk = employee.canUseTenderDesk !== (current?.tenderDesk === true);
  if (current && (staleBills || staleDesk)) {
    const token = signToken({
      id: current.id,
      email: current.email,
      role: employee.role,
      name: current.name,
      bills: employee.canViewBills || current.bills === true,
      tenderDesk: employee.canUseTenderDesk,
      ...(current.cv ? { cv: current.cv } : {}),
      ...(current.ls ? { ls: current.ls } : {}),
    });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  return response;
});
