import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { onlyActive } from '@/lib/visibility';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/extra-boq-items
 * Query parameters:
 * - ?boqItemId=<id>   required — filter by parent BOQ item
 * - ?includeInactive=true  (Admin only) show deactivated records
 *
 * Accessible: A, M
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const boqItemId = searchParams.get('boqItemId');

    if (!boqItemId) {
      return errorResponse('boqItemId query parameter is required.', 400);
    }

    const where = onlyActive({ boqItemId }, searchParams, user);

    const items = await prisma.extraItemBOQ.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return successResponse(items, 'Extra BOQ items retrieved successfully.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve extra BOQ items.');
  }
});

/**
 * POST /api/extra-boq-items
 * Body: { boqItemId, itemName, itemQuantity, requestedBy?, remarks? }
 * A new request stays pending. Only an admin can approve it.
 * Accessible: A, M
 */
export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request body is required.', 400);

    const { boqItemId, itemName, itemQuantity, requestedBy, remarks } = body;

    if (!boqItemId) return errorResponse('boqItemId is required.', 400);
    if (!itemName?.trim()) return errorResponse('itemName is required.', 400);

    // Verify the parent BOQ item exists
    const boqItem = await prisma.bOQItems.findUnique({ where: { id: boqItemId } });
    if (!boqItem) return errorResponse(`BOQ item with id "${boqItemId}" not found.`, 400);

    const record = await prisma.extraItemBOQ.create({
      data: {
        boqItemId,
        itemName: itemName.trim(),
        itemQuantity: itemQuantity ? String(itemQuantity).trim() : null,
        isApproved: false,
        status: 'PENDING',
        approvedBy: null,
        requestedBy: requestedBy?.trim() || null,
        remarks: remarks?.trim() || null,
        createdBy: user?.id || null,
        updatedBy: user?.id || null,
      },
    });

    return successResponse(record, 'Extra BOQ item created successfully.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create extra BOQ item.');
  }
});
