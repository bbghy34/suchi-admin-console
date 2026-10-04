import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { parseTenderBody, parseTenderId, presentTender } from '@/lib/daily-tenders';

/**
 * PUT /api/daily-tenders/[id]
 */
export const PUT = requireRoles(['T'])(async (request, { params }) => {
  try {
    const { id: rawId } = await params;
    const id = parseTenderId(rawId);
    if (id == null) return errorResponse('Tender id is invalid.', 400);

    const existing = await prisma.dailyTender.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) return notFound('Daily tender not found.');
    if (existing.status === 'saved') return errorResponse('A saved tender cannot be edited.', 400);

    const body = await request.json().catch(() => null);
    const parsed = parseTenderBody(body);
    if (!parsed.ok) return errorResponse(parsed.message, 400);

    const row = await prisma.dailyTender.update({ where: { id }, data: parsed.data });
    return successResponse(presentTender(row), 'Daily tender updated.');
  } catch (error) {
    return handleApiError(error, 'Failed to update daily tender.');
  }
});

/**
 * DELETE /api/daily-tenders/[id]
 */
export const DELETE = requireRoles(['T'])(async (request, { params }) => {
  try {
    const { id: rawId } = await params;
    const id = parseTenderId(rawId);
    if (id == null) return errorResponse('Tender id is invalid.', 400);

    const existing = await prisma.dailyTender.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound('Daily tender not found.');

    await prisma.dailyTender.delete({ where: { id } });
    return successResponse({ id: rawId }, 'Daily tender deleted.');
  } catch (error) {
    return handleApiError(error, 'Failed to delete daily tender.');
  }
});
