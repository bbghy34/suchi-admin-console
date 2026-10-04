import { prisma } from '@/lib/prisma';

/**
 * Short activity log on a tender. Actions are the words from the product:
 * uploaded, document added, corrigendum, selected, bid submitted, got the bid,
 * money entered, certificate added, security money applied, and so on.
 */
export async function logActivity({ tenderId, personId, action, detail }) {
  return prisma.activity.create({
    data: { tenderId: tenderId || null, personId: personId || null, action, detail: detail || null },
  });
}
