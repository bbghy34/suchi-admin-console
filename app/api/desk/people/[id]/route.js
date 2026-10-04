import { findDirectoryPerson } from '@/lib/luit-admin/privacy.mjs';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody } from '@/lib/desk/api';
import { logActivity } from '@/lib/desk/activity';

const VALID_ROLES = ['ADMIN', 'TENDER_EXECUTIVE', 'BIDDER', 'ACCOUNTS'];

/** Set desk roles within the employee's console permissions. */
export const PATCH = handler(async (req, { params }) => {
  const admin = await requireRole('ADMIN');
  const { id } = await params;
  const person = await findDirectoryPerson(prisma, id);
  if (!person) return fail(404, 'Person not found.');
  const { fields } = await readBody(req);
  const data = {};
  if (fields.roles !== undefined) {
    const roles = [].concat(fields.roles || []).map(String).filter((r) => VALID_ROLES.includes(r));
    if (!roles.length) return fail(400, 'Keep at least one role.');
    if (person.id === admin.id && !roles.includes('ADMIN')) return fail(400, 'You cannot remove your own Admin role.');
    data.roles = roles.join(',');
  }
  if (fields.password !== undefined || fields.name !== undefined) return fail(400, 'Change employee names and passwords in Luit.');
  await prisma.person.update({ where: { id: person.id }, data });
  await logActivity({ personId: admin.id, action: 'person edited', detail: `${person.name}: ${Object.keys(data).join(', ')}` });
  return ok({});
});
