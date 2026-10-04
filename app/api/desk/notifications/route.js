import { prisma } from '@/lib/prisma';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok, readBody, str, bool } from '@/lib/desk/api';
import { unreadCount } from '@/lib/desk/notify';

/** Mark one item read, or everything. */
export const PATCH = handler(async (req) => {
  const person = await requirePerson();
  const { fields } = await readBody(req);
  if (bool(fields.all)) {
    await prisma.notification.updateMany({ where: { personId: person.id, readAt: null }, data: { readAt: new Date() } });
  } else {
    const id = str(fields.id);
    if (id) {
      await prisma.notification.updateMany({
        where: { id, personId: person.id },
        data: { readAt: bool(fields.unread) ? null : new Date() },
      });
    }
  }
  return ok({ unread: await unreadCount(person.id) });
});

/** Delete one message, or every message already marked read. */
export const DELETE = handler(async (req) => {
  const person = await requirePerson();
  const { fields } = await readBody(req);
  if (bool(fields.read)) {
    await prisma.notification.deleteMany({ where: { personId: person.id, readAt: { not: null } } });
  } else {
    const id = str(fields.id);
    if (id) await prisma.notification.deleteMany({ where: { id, personId: person.id } });
  }
  return ok({ unread: await unreadCount(person.id) });
});

export const GET = handler(async () => {
  const person = await requirePerson();
  const now = new Date();
  const [items, unread] = await Promise.all([prisma.notification.findMany({
    where: { personId: person.id, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'desc' },
    take: 200,
    include: { tender: { select: { id: true, title: true } } },
  }), unreadCount(person.id)]);
  return ok({ unread, items });
});
