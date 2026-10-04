import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { selectTender } from '@/lib/desk/tender-service';
import { logActivity } from '@/lib/desk/activity';

/** Select this tender: My tenders, frequent notifications, summary, checklist. */
export const POST = handler(async (req, { params }) => {
  const person = await requirePerson();
  const result = await selectTender(params.id, person);
  return ok({ already: result.already });
});

/** Change notification frequency for this person on this tender. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requirePerson();
  const { fields } = await readBody(req);
  const frequency = str(fields.frequency);
  if (!['FREQUENT', 'QUIET', 'OFF'].includes(frequency)) return fail(400, 'Frequency must be Frequent, Quiet, or Off.');
  const sel = await prisma.selection.findUnique({ where: { tenderId_personId: { tenderId: params.id, personId: person.id } } });
  if (!sel) return fail(404, 'You have not selected this tender.');
  await prisma.selection.update({ where: { id: sel.id }, data: { frequency } });
  return ok({ frequency });
});

/** Take the tender off this person's desk. Existing inbox items stay. */
export const DELETE = handler(async (req, { params }) => {
  const person = await requirePerson();
  const sel = await prisma.selection.findUnique({ where: { tenderId_personId: { tenderId: params.id, personId: person.id } } });
  if (!sel) return ok({});
  await prisma.selection.delete({ where: { id: sel.id } });
  await logActivity({ tenderId: params.id, personId: person.id, action: 'unselected', detail: `${person.name} removed this tender from their desk` });
  return ok({});
});
