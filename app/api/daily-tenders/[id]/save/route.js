import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { parseTenderId, presentTender, tenderCopyData } from '@/lib/daily-tenders';

/**
 * POST /api/daily-tenders/[id]/save
 * Copies every field from the daily tender into a new saved tender row.
 */
export const POST = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id: rawId } = await params;
    const id = parseTenderId(rawId);
    if (id == null) return errorResponse('Tender id is invalid.', 400);

    const daily = await prisma.dailyTender.findUnique({ where: { id } });
    if (!daily) return notFound('Daily tender not found.');
    if (daily.status && daily.status !== 'pending') {
      return errorResponse('Only a pending tender can be saved.', 400);
    }

    const saved = await prisma.savedTender.create({ data: { ...tenderCopyData(daily), status: 'saved' } });
    await prisma.dailyTender.update({ where: { id }, data: { status: 'saved' } });
    return successResponse(presentTender(saved), 'Tender saved.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to save tender.');
  }
});
