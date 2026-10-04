import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { credentialTag, getAuthenticatedUser, verifyToken } from '@/lib/auth';
import { isActiveAccount } from '@/lib/security';
import { isLuitAdmin } from './account.mjs';
import { sameSession, storedLuitAdminSession } from './single-session';

/** The signed-in Luit admin for a server page, or null. */
export async function currentLuitAdmin() {
  const store = await cookies();
  const decoded = verifyToken(store.get('auth_token')?.value);
  if (!decoded?.id) return null;
  const employee = await prisma.employee.findUnique({
    where: { id: decoded.id },
    select: { id: true, name: true, email: true, role: true, status: true, passwordHash: true },
  });
  if (!employee || !isActiveAccount(employee) || !isLuitAdmin(employee.role)) return null;
  if (!decoded.cv || decoded.cv !== credentialTag(employee.passwordHash)) return null;
  if (!sameSession(decoded.ls, await storedLuitAdminSession(prisma, employee.id))) return null;
  return { id: employee.id, name: employee.name, email: employee.email };
}

/** The signed-in Luit admin for a route handler, or null. */
export async function luitAdminFromRequest(request) {
  const user = await getAuthenticatedUser(request);
  return user && isLuitAdmin(user.accountRole) ? { id: user.id, name: user.name, email: user.email } : null;
}
