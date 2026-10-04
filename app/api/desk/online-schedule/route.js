import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, fail } from '@/lib/desk/api';
import { onlineScheduleStatus, refreshOnlineLibrary, saveOnlineSchedule } from '@/lib/desk/online-store';

export const GET = handler(async () => {
  const person = await requirePerson();
  const status = await onlineScheduleStatus();
  return ok({ ...status, canEdit: person.isAdmin });
});

export const POST = handler(async (req) => {
  const person = await requirePerson();
  if (!person.isAdmin) return fail(403, 'An admin sets the public-page schedule.');
  const body = await req.json().catch(() => ({}));
  if (body.action === 'run') {
    const result = await refreshOnlineLibrary(new Date());
    const status = await onlineScheduleStatus();
    return ok({ ...status, canEdit: true, ran: result });
  }
  const status = await saveOnlineSchedule({ schedule: body.schedule, hour: body.hour });
  return ok({ ...status, canEdit: true });
});
