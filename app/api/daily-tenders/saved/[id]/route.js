import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { parseTenderBody, parseTenderId, presentTender } from '@/lib/daily-tenders';

const RESULTS = ['win', 'loss', 'cancelled'];

/**
 * PUT /api/daily-tenders/saved/[id]
 * Updates the result on a saved tender, plus SD fields for a win or EMD fields for a loss or cancellation.
 */
export const PUT = requireRoles(['A', 'M', 'T'])(async (request, { params }) => {
  try {
    const { id: rawId } = await params;
    const id = parseTenderId(rawId);
    if (id == null) return errorResponse('Tender id is invalid.', 400);

    const existing = await prisma.savedTender.findUnique({ where: { id } });
    if (!existing) return notFound('Saved tender not found.');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('Request body is required.', 400);

    const stored = RESULTS.includes(existing.isWin) ? existing.isWin : '';
    const requested = RESULTS.includes(body.isWin) ? body.isWin : '';
    const result = requested || stored;
    const next = presentTender(existing);
    next.isWin = result;
    const apply = (keys) => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) next[key] = body[key];
      }
    };
    if (result === 'win') {
      apply(['sdMoney', 'sdDocs', 'sdIssueDate', 'sdExpireDate', 'sdMoneyOffice', 'sdThrough', 'sdMode']);
    }
    if (result === 'loss' || result === 'cancelled') {
      apply(['emdAmount', 'emdDoc', 'emdDate', 'emdMoneyOffice', 'emdThrough', 'emdMode']);
    }

    const parsed = parseTenderBody(next);
    if (!parsed.ok) return errorResponse(parsed.message, 400);

    const data = { ...parsed.data };
    // Record the day the result was set; EMD tracking counts from it.
    if (requested && requested !== stored) {
      const istToday = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      data.resultDate = new Date(`${istToday}T00:00:00Z`);
    }
    const row = await prisma.savedTender.update({ where: { id }, data });
    return successResponse(presentTender(row), 'Saved tender updated.');
  } catch (error) {
    return handleApiError(error, 'Failed to update saved tender.');
  }
});
