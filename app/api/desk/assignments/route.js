import { findDirectoryPerson } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { logActivity } from '@/lib/desk/activity';

/** Admin reassigns the fetcher for a date range. */
export const POST = handler(async (req) => {
  const admin = await requireRole('ADMIN');
  const { fields } = await readBody(req);
  const personId = str(fields.personId);
  const fromDate = str(fields.fromDate);
  const toDate = str(fields.toDate);
  if (!personId) return fail(400, 'Pick the person who will fetch for those dates.');
  if (!fromDate || !toDate) return fail(400, 'Give a from date and a to date.');
  if (toDate < fromDate) return fail(400, 'The to date cannot be before the from date.');
  const person = await findDirectoryPerson(prisma, personId);
  if (!person) return fail(400, 'That person does not exist.');
  await prisma.fetchAssignment.create({
    data: { personId, fromDate, toDate, note: str(fields.note) },
  });
  await logActivity({
    personId: admin.id,
    action: 'fetcher reassigned',
    detail: `${person.name} from ${fromDate} to ${toDate}`,
  });
  return ok({});
});
