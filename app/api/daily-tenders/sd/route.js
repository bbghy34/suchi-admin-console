import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { presentTender } from '@/lib/daily-tenders';

/**
 * GET /api/daily-tenders/sd
 * Saved tenders whose result is win, with the SD fields used for tracking.
 */
export const GET = requireRoles(['A', 'M', 'T'])(async () => {
  try {
    const rows = await prisma.savedTender.findMany({
      where: { isWin: 'win' },
      orderBy: { id: 'desc' },
    });
    return successResponse(rows.map(presentTender), 'SD tracking loaded.');
  } catch (error) {
    return handleApiError(error, 'Failed to load SD tracking.');
  }
});
