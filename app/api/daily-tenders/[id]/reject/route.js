import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { parseTenderId, presentTender } from '@/lib/daily-tenders';

/**
 * POST /api/daily-tenders/[id]/reject
 * Marks a pending daily tender as rejected.
 */
export const POST = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id: rawId } = await params;
    const id = parseTenderId(rawId);
    if (id == null) return errorResponse('Tender id is invalid.', 400);

    const daily = await prisma.dailyTender.findUnique({ where: { id } });
    if (!daily) return notFound('Daily tender not found.');
    if (daily.status && daily.status !== 'pending') {
      return errorResponse('Only a pending tender can be rejected.', 400);
    }

    const row = await prisma.dailyTender.update({ where: { id }, data: { status: 'reject' } });
    return successResponse(presentTender(row), 'Tender rejected.');
  } catch (error) {
    return handleApiError(error, 'Failed to reject tender.');
  }
});
