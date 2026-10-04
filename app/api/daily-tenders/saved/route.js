import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { parseTenderBody, presentTender } from '@/lib/daily-tenders';

/**
 * POST /api/daily-tenders/saved
 * Adds a tender found outside the daily list (another portal, a newspaper,
 * a department letter) straight to Saved tenders. Rows created here carry
 * status 'manual' so the list can label them as manually added; rows copied
 * from Daily Tenders carry 'saved'.
 */
export const POST = requireRoles(['A', 'M'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseTenderBody(body);
    if (!parsed.ok) return errorResponse(parsed.message, 400);

    const row = await prisma.savedTender.create({ data: { ...parsed.data, status: 'manual' } });
    return successResponse(presentTender(row), 'Tender added to saved tenders.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to add the saved tender.');
  }
});
