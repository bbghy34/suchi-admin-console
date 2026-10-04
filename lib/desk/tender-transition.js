import { prisma } from '@/lib/prisma';

/** Commit a workflow change, its evidence and history against the version read. */
export async function saveTenderTransition(tender, personId, data, activity, document = null) {
  return prisma.tender.update({
    where: { id: tender.id, stage: tender.stage, updatedAt: tender.updatedAt },
    data: {
      ...data,
      ...(document ? { documents: { create: document } } : {}),
      activities: { create: { personId, ...activity } },
    },
  });
}
