import { prisma } from '@/lib/prisma';
import { istDateKey } from './ist';

/** Uploading from a source closes its row for the day as Uploaded. */
export async function markSourceUploaded(sourceId, personId, dateKey = istDateKey()) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source || !source.isDaily) return null;
  return prisma.fetchLog.upsert({
    where: { sourceId_date: { sourceId, date: dateKey } },
    update: { outcome: 'UPLOADED', reason: null, personId, at: new Date() },
    create: { sourceId, date: dateKey, outcome: 'UPLOADED', personId },
  });
}
