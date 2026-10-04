import { personDirectoryWhere } from '@/lib/luit-admin/privacy.mjs';
import { rolesForConsole, personRoles } from './auth';
import { isActiveAccount } from '@/lib/security';
import { prisma } from '@/lib/prisma';

/**
 * Persist one inbox item. The inbox is the source of truth; email, if ever
 * configured, is a copy. dedupeKey makes scheduled reminders idempotent.
 */
export async function notify({ personId, tenderId, kind, title, body, dedupeKey, scheduledFor }) {
  if (!personId) return null;
  if (dedupeKey) {
    const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
    if (existing) return existing;
  }
  try {
    return await prisma.notification.create({
      data: {
        personId,
        tenderId: tenderId || null,
        kind,
        title,
        body: body || null,
        dedupeKey: dedupeKey || null,
        scheduledFor: scheduledFor || new Date(),
      },
    });
  } catch (err) {
    if (err?.code === 'P2002') return null;
    throw err;
  }
}

export async function notifyMany(personIds, payload) {
  const ids = [...new Set(personIds.filter(Boolean))];
  const out = [];
  for (const personId of ids) {
    out.push(await notify({ ...payload, personId, dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${personId}` : null }));
  }
  return out;
}

/** People who selected a tender, optionally only those on a given frequency. */
export async function selectorIds(tenderId, { frequencies = ['FREQUENT'] } = {}) {
  const rows = await prisma.selection.findMany({
    where: { tenderId, person: { is: await personDirectoryWhere(prisma) }, ...(frequencies ? { frequency: { in: frequencies } } : {}) },
    select: { personId: true },
  });
  return rows.map((r) => r.personId);
}

/** Admins, executives, bidders, and accounts. One id each. */
export async function deskAudienceIds() {
  const lists = await Promise.all(['ADMIN', 'TENDER_EXECUTIVE', 'BIDDER', 'ACCOUNTS'].map((role) => peopleWithRole(role)));
  return [...new Set(lists.flat())];
}

export async function peopleWithRole(role) {
  const people = await prisma.person.findMany({ where: { employeeId: { not: null } }, select: { id: true, roles: true, employeeId: true } });
  const employees = await prisma.employee.findMany({ where: { id: { in: people.map((p) => p.employeeId) } } });
  const byId = new Map(employees.map((e) => [e.id, e]));
  return people.filter((p) => {
    const e = byId.get(p.employeeId);
    return e && isActiveAccount(e) && rolesForConsole(e.role).split(',').includes(role) && personRoles(p).includes(role);
  }).map((p) => p.id);
}

export async function unreadCount(personId) {
  return prisma.notification.count({ where: { personId, readAt: null, scheduledFor: { lte: new Date() } } });
}
