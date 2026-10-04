import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { presentTender } from '@/lib/daily-tenders';

/**
 * GET /api/daily-tenders/emd
 * Saved tenders whose result is loss or cancelled, with the EMD fields used for tracking.
 */
export const GET = requireRoles(['A', 'M', 'T'])(async () => {
  try {
    const rows = await prisma.savedTender.findMany({
      where: { isWin: { in: ['loss', 'cancelled'] } },
      orderBy: { id: 'desc' },
    });
    return successResponse(rows.map(presentTender), 'EMD tracking loaded.');
  } catch (error) {
    return handleApiError(error, 'Failed to load EMD tracking.');
  }
});
