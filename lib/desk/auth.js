import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyToken, credentialTag } from '@/lib/auth';
import { isActiveAccount } from '@/lib/security';
import { canUseTenderDesk, isLuitAdmin } from '@/lib/roles';
import { sameSession, storedLuitAdminSession } from '@/lib/luit-admin/single-session';
import { hashPassword as hashDeskPassword, verifyPassword } from './password';
import { SETTING_KEYS, SOURCE_REGISTER } from './constants';
import { setSetting } from './settings';

export { verifyPassword };
export const hashPassword = hashDeskPassword;

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function personRoles(person) {
  return person ? String(person.roles || '').split(',').map((r) => r.trim()).filter(Boolean) : [];
}

export function decoratePerson(person) {
  if (!person) return null;
  const roles = personRoles(person);
  return {
    id: person.id,
    employeeId: person.employeeId || null,
    name: person.name,
    roles,
    isAdmin: roles.includes('ADMIN'),
    isExecutive: roles.includes('TENDER_EXECUTIVE'),
    isBidder: roles.includes('BIDDER'),
    isAccounts: roles.includes('ACCOUNTS'),
  };
}

/** Only the Luit admin can use Tender Desk. It runs the whole desk and is not listed. */
export function rolesForConsole(role) {
  if (canUseTenderDesk(role)) return 'ADMIN,TENDER_EXECUTIVE,BIDDER,ACCOUNTS';
  return '';
}

/** True when the request carries a valid console session that Tender Desk does not admit. */
async function signedInWithoutDesk() {
  const store = await cookies();
  const decoded = verifyToken(store.get('auth_token')?.value);
  if (!decoded?.id) return false;
  const employee = await prisma.employee.findUnique({ where: { id: decoded.id }, select: { role: true, status: true, passwordHash: true } });
  if (!employee || !isActiveAccount(employee)) return false;
  if (!decoded.cv || decoded.cv !== credentialTag(employee.passwordHash)) return false;
  return !rolesForConsole(employee.role);
}

async function ensureSources() {
  const existing = await prisma.source.findMany({ select: { id: true } });
  const have = new Set(existing.map((row) => row.id));
  if (SOURCE_REGISTER.every((s) => have.has(s.id))) return;
  let order = 0;
  for (const s of SOURCE_REGISTER) {
    const data = {
      order: order++,
      displayName: s.displayName,
      officialName: s.officialName,
      url: s.url || '',
      extraUrls: s.extraUrls || null,
      mark: s.mark,
      markNote: s.markNote || null,
      intakeRule: s.intakeRule,
      allIndia: !!s.allIndia,
      isDaily: s.isDaily !== false,
      groupKey: s.groupKey || null,
      pinned: !!s.pinned,
      state: s.state || null,
      kind: s.kind || 'GEPNIC',
      noNewLabel: s.noNewLabel || 'No new tender',
      config: s.config || null,
    };
    if (have.has(s.id)) continue;
    await prisma.source.upsert({ where: { id: s.id }, update: { id: s.id }, create: { id: s.id, ...data } });
  }
}

/**
 * The signed-in operations-console employee is the desk user.
 * There is no second sign-in.
 */
export async function getCurrentPerson() {
  const store = await cookies();
  const token = store.get('auth_token')?.value;
  const decoded = verifyToken(token);
  if (!decoded?.id) return null;
  const employee = await prisma.employee.findUnique({ where: { id: decoded.id } });
  if (!employee || !isActiveAccount(employee)) return null;
  if (!decoded.cv || decoded.cv !== credentialTag(employee.passwordHash)) return null;
  if (isLuitAdmin(employee.role) && !sameSession(decoded.ls, await storedLuitAdminSession(prisma, employee.id))) return null;
  const roles = rolesForConsole(employee.role);
  if (!roles) return null;

  // Current account/roles are still read on every request. Independent bootstrap
  // and profile/settings reads can share one database wait.
  const [, storedPerson, settings] = await Promise.all([
    ensureSources(),
    prisma.person.findUnique({ where: { employeeId: employee.id } }),
    prisma.setting.findMany({ where: { key: { in: [SETTING_KEYS.FIRM_NAME, SETTING_KEYS.FETCH_ASSIGNEE] } }, select: { key: true } }),
  ]);
  let person = storedPerson;
  if (!person) {
    person = await prisma.person.upsert({
      where: { employeeId: employee.id }, update: { name: employee.name },
      create: { employeeId: employee.id, name: employee.name, roles, passwordHash: 'console' },
    });
  } else if (person.name !== employee.name) {
    person = await prisma.person.update({ where: { id: person.id }, data: { name: employee.name } });
  }

  const firm = settings.find(row => row.key === SETTING_KEYS.FIRM_NAME);
  if (!firm) await setSetting(SETTING_KEYS.FIRM_NAME, 'Northeast Works');
  const assignee = settings.find(row => row.key === SETTING_KEYS.FETCH_ASSIGNEE);
  if (!assignee && roles.includes('ADMIN') && !isLuitAdmin(employee.role)) {
    await setSetting(SETTING_KEYS.FETCH_ASSIGNEE, person.id);
  }

  // Console permissions are a ceiling for explicitly assigned desk roles.
  return decoratePerson({ ...person, roles: personRoles(person).filter((r) => roles.split(',').includes(r)).join(',') });
}

export async function requirePerson() {
  const person = await getCurrentPerson();
  if (person) return person;
  if (await signedInWithoutDesk()) throw new HttpError(403, 'Tender Desk is not available for this account.');
  throw new HttpError(401, 'Sign in to Luit first.');
}

export async function requireRole(...roles) {
  const person = await requirePerson();
  if (!roles.some((r) => person.roles.includes(r))) {
    throw new HttpError(403, 'Your console role cannot do that on Tender Desk.');
  }
  return person;
}
