import { getCurrentPerson } from '@/lib/desk/auth';
import { prisma } from '@/lib/prisma';
import { asJson } from '@/lib/desk/json';
import { istDateKey } from '@/lib/desk/ist';
import { InboxView } from './InboxView';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const person = await getCurrentPerson();
  const now = new Date();
  const items = await prisma.notification.findMany({
    where: { personId: person.id, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'desc' },
    take: 200,
    include: { tender: { select: { id: true, title: true } } },
  });
  return <InboxView items={asJson(items)} todayKey={istDateKey(now)} />;
}
