import { personDirectoryWhere, findDirectoryPerson } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { setSetting } from '@/lib/desk/settings';
import { SETTING_KEYS } from '@/lib/desk/constants';
import { logActivity } from '@/lib/desk/activity';

const VALID_ROLES = ['ADMIN', 'TENDER_EXECUTIVE', 'BIDDER', 'ACCOUNTS'];

export const GET = handler(async () => {
  await requireRole('ADMIN', 'TENDER_EXECUTIVE', 'BIDDER', 'ACCOUNTS');
  const people = await prisma.person.findMany({
    where: await personDirectoryWhere(prisma),
    orderBy: { name: 'asc' },
    select: { id: true, name: true, roles: true, createdAt: true },
  });
  return ok({ people });
});

/** Admin settings: fetcher, backup, firm name, work categories. */
export const PATCH = handler(async (req) => {
  const person = await requireRole('ADMIN');
  const { fields } = await readBody(req);
  const changes = [];
  if (fields.fetchAssigneeId !== undefined) {
    const id = str(fields.fetchAssigneeId);
    if (!id || !(await findDirectoryPerson(prisma, id))) return fail(400, 'Pick the person who fetches tenders daily.');
    await setSetting(SETTING_KEYS.FETCH_ASSIGNEE, id);
    changes.push('fetcher');
  }
  if (fields.fetchBackupId !== undefined) {
    const id = str(fields.fetchBackupId);
    if (id && !(await findDirectoryPerson(prisma, id))) return fail(400, 'That backup person does not exist.');
    await setSetting(SETTING_KEYS.FETCH_BACKUP, id || '');
    changes.push('backup');
  }
  if (fields.firmName !== undefined) {
    const name = str(fields.firmName);
    if (!name) return fail(400, 'The firm name cannot be blank.');
    await setSetting(SETTING_KEYS.FIRM_NAME, name);
    changes.push('firm name');
  }
  if (fields.workCategories !== undefined) {
    const list = String(fields.workCategories)
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) return fail(400, 'Keep at least one work category.');
    await setSetting(SETTING_KEYS.WORK_CATEGORIES, JSON.stringify([...new Set(list)]));
    changes.push('work categories');
  }
  await logActivity({ personId: person.id, action: 'settings changed', detail: changes.join(', ') || 'nothing' });
  return ok({ changed: changes });
});

/** Tender Desk uses console identities; local-only people cannot sign in. */
export const POST = handler(async () => {
  await requireRole('ADMIN');
  return fail(400, 'Add staff accounts in Luit, then ask them to open Tender Desk.');
});
