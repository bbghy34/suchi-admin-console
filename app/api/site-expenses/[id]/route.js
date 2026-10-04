import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { parseItemName, parsePrice, parseRemarks, expenseInclude } from '@/lib/site-expense';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * PUT /api/site-expenses/[id]
 * Updates item name, price, remarks, and site. There is no delete.
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const existing = await prisma.siteExpense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound('Site expense not found.');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('Request body is required.', 400);

    const data = { updatedBy: user?.id || null };

    if (body.itemName !== undefined) {
      const itemName = parseItemName(body.itemName);
      if (!itemName.ok) return errorResponse(itemName.message, 400);
      data.itemName = itemName.value;
    }

    if (body.price !== undefined) {
      const price = parsePrice(body.price);
      if (!price.ok) return errorResponse(price.message, 400);
      data.price = price.value;
    }

    if (body.remarks !== undefined) {
      const remarks = parseRemarks(body.remarks);
      if (!remarks.ok) return errorResponse(remarks.message, 400);
      data.remarks = remarks.value;
    }

    if (body.siteId !== undefined) {
      const siteId = String(body.siteId || '').trim();
      if (!siteId) return errorResponse('Site is required.', 400);
      const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
      if (!site) return errorResponse('Site not found.', 400);
      data.siteId = siteId;
    }

    if (Object.keys(data).length === 1) {
      return errorResponse('Nothing to update.', 400);
    }

    const record = await prisma.siteExpense.update({
      where: { id },
      data,
      include: expenseInclude,
    });

    return successResponse(record, 'Site expense updated.');
  } catch (error) {
    return handleApiError(error, 'Failed to update site expense.');
  }
});
