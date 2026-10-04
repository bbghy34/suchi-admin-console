import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/boq-items/[id]
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const item = await prisma.bOQItems.findUnique({
      where: { id },
      include: { boq: { select: { id: true, boqCode: true } } },
    });
    if (!item) return notFound('BOQ item not found.');
    return successResponse(item, 'BOQ item retrieved');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQ item');
  }
});

/**
 * PUT /api/boq-items/[id]
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const existing = await prisma.bOQItems.findUnique({ where: { id } });
    if (!existing) return errorResponse('BOQ item not found.', 404);

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request payload is required.', 400);

    const updateData = {};
    const stringFields = ['slNo', 'itemName', 'specification', 'unit', 'quantity', 'remarks', 'itemLeft', 'itemReceivedTotalQuantity', 'extraItem'];
    for (const f of stringFields) {
      if (body[f] !== undefined) updateData[f] = body[f] != null ? String(body[f]) : null;
    }
    if (body.rate !== undefined) updateData.rate = body.rate != null ? parseFloat(body.rate) : null;
    if (body.amount !== undefined) updateData.amount = body.amount != null ? parseFloat(body.amount) : null;
    if (body.itemReceivedImage !== undefined) {
      if (Array.isArray(body.itemReceivedImage)) {
        updateData.itemReceivedImage = body.itemReceivedImage;
      } else if (typeof body.itemReceivedImage === 'string') {
        try {
          const parsed = JSON.parse(body.itemReceivedImage);
          updateData.itemReceivedImage = Array.isArray(parsed) ? parsed : null;
        } catch {
          updateData.itemReceivedImage = null;
        }
      } else {
        updateData.itemReceivedImage = null;
      }
    }

    const updated = await prisma.bOQItems.update({ where: { id }, data: updateData });
    return successResponse(updated, 'BOQ item updated');
  } catch (error) {
    return handleApiError(error, 'Failed to update BOQ item');
  }
});

const boqItemActive = setActiveHandler(prisma.bOQItems, 'BOQ item');
export const PATCH = boqItemActive;
export const DELETE = boqItemActive;
