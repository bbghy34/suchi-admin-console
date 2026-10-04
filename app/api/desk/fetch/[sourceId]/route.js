import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { canWorkFetch, fetchAssigneeFor, fetchDayStatus } from '@/lib/desk/fetch-day';
import { istDateKey } from '@/lib/desk/ist';
import { notifyMany, peopleWithRole } from '@/lib/desk/notify';
import { logActivity } from '@/lib/desk/activity';

/** Close a source row for today: No new tender, or Could not open the portal (with a reason). */
export const POST = handler(async (req, { params }) => {
  const person = await requirePerson();
  const dateKey = istDateKey();
  const day = await fetchAssigneeFor(dateKey);
  if (!canWorkFetch(person, day)) return fail(403, 'Only the assigned fetcher, the backup, a Tender Executive, or an Admin can close a source for the day.');
  const source = await prisma.source.findUnique({ where: { id: params.sourceId } });
  if (!source || !source.isDaily) return fail(404, 'That source is not a daily row.');
  const { fields } = await readBody(req);
  const outcome = str(fields.outcome);
  const reason = str(fields.reason);
  if (!['NO_NEW', 'COULD_NOT_OPEN'].includes(outcome)) return fail(400, 'Uploaded is recorded by saving a tender from this source. Otherwise choose No new tender or Could not open the portal.');
  if (outcome === 'COULD_NOT_OPEN' && !reason) return fail(400, 'Give a short reason: timeout, maintenance notice, certificate error.');

  await prisma.fetchLog.upsert({
    where: { sourceId_date: { sourceId: source.id, date: dateKey } },
    update: { outcome, reason: outcome === 'COULD_NOT_OPEN' ? reason : null, personId: person.id, at: new Date() },
    create: { sourceId: source.id, date: dateKey, outcome, reason: outcome === 'COULD_NOT_OPEN' ? reason : null, personId: person.id },
  });
  await logActivity({ personId: person.id, action: `fetch ${outcome === 'NO_NEW' ? source.noNewLabel.toLowerCase() : 'could not open'}`, detail: `${source.displayName}${reason ? `: ${reason}` : ''}` });

  if (outcome === 'COULD_NOT_OPEN') {
    const admins = await peopleWithRole('ADMIN');
    await notifyMany(admins, {
      kind: 'PORTAL_DOWN',
      title: `Could not open ${source.displayName}: ${reason}`,
      body: `${person.name} could not open ${source.url || 'the portal'} on ${dateKey}. Check the stored URL on the People screen.`,
      dedupeKey: `portaldown:${source.id}:${dateKey}`,
    });
  }

  const status = await fetchDayStatus(dateKey);
  return ok({ done: status.done, total: status.total, complete: status.complete });
});

/** Reopen a row that was closed by mistake today. */
export const DELETE = handler(async (req, { params }) => {
  const person = await requirePerson();
  const dateKey = istDateKey();
  const day = await fetchAssigneeFor(dateKey);
  if (!canWorkFetch(person, day)) return fail(403, 'Not allowed.');
  await prisma.fetchLog.deleteMany({ where: { sourceId: params.sourceId, date: dateKey, outcome: { not: 'UPLOADED' } } });
  return ok({});
});
