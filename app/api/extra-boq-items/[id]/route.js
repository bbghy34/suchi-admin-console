import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { setActiveHandler } from '@/lib/visibility';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/extra-boq-items/[id]
 * Accessible: A, M
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const record = await prisma.extraItemBOQ.findUnique({ where: { id } });
    if (!record) return notFound('Extra BOQ item not found.');
    return successResponse(record, 'Extra BOQ item retrieved successfully.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve extra BOQ item.');
  }
});

/**
 * PUT /api/extra-boq-items/[id]
 * Update item fields.
 * Accessible: A, M
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request body is required.', 400);

    const existing = await prisma.extraItemBOQ.findUnique({ where: { id } });
    if (!existing) return notFound('Extra BOQ item not found.');

    const { itemName, itemQuantity, isApproved, approvedBy, requestedBy, remarks, decision, decisionRemarks } = body;

    if (decision !== undefined) {
      if (user?.role !== 'A') {
        return errorResponse('Only an admin can accept or reject an extra item.', 403);
      }
      if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
        return errorResponse('Decision must be ACCEPTED or REJECTED.', 400);
      }
      const note = String(decisionRemarks || '').trim();
      if (!note) return errorResponse('Remarks are required.', 400);
      if (note.length > 1000) return errorResponse('Remarks must be 1000 characters or fewer.', 400);

      const current = existing.status || (existing.isApproved ? 'ACCEPTED' : 'PENDING');
      if (current !== 'PENDING') {
        return errorResponse('This extra item has already been accepted or rejected.', 400);
      }

      const updated = await prisma.extraItemBOQ.update({
        where: { id },
        data: {
          status: decision,
          isApproved: decision === 'ACCEPTED',
          approvedBy: user?.name || 'Admin',
          decisionRemarks: note,
          updatedBy: user?.id || null,
        },
      });

      const label = decision === 'ACCEPTED' ? 'accepted' : 'rejected';
      return successResponse(updated, `Extra BOQ item ${label}.`);
    }

    const wantsApproval = typeof isApproved === 'boolean' || approvedBy !== undefined;
    if (wantsApproval && user?.role !== 'A') {
      return errorResponse('Only an admin can approve a variation.', 403);
    }

    const nextApproved = user?.role === 'A' && typeof isApproved === 'boolean' ? isApproved : existing.isApproved;

    const updated = await prisma.extraItemBOQ.update({
      where: { id },
      data: {
        itemName: itemName !== undefined ? itemName?.trim() || existing.itemName : existing.itemName,
        itemQuantity: itemQuantity !== undefined ? (itemQuantity ? String(itemQuantity).trim() : null) : existing.itemQuantity,
        isApproved: nextApproved,
        status: user?.role === 'A' && typeof isApproved === 'boolean'
          ? (nextApproved ? 'ACCEPTED' : (existing.status === 'REJECTED' ? 'REJECTED' : 'PENDING'))
          : existing.status,
        approvedBy: user?.role === 'A' && approvedBy !== undefined ? (approvedBy?.trim() || null) : existing.approvedBy,
        requestedBy: requestedBy !== undefined ? (requestedBy?.trim() || null) : existing.requestedBy,
        remarks: remarks !== undefined ? (remarks?.trim() || null) : existing.remarks,
        updatedBy: user?.id || null,
      },
    });

    return successResponse(updated, 'Extra BOQ item updated successfully.');
  } catch (error) {
    return handleApiError(error, 'Failed to update extra BOQ item.');
  }
});

/**
 * DELETE /api/extra-boq-items/[id]
 * Soft-deactivates (Admin only).
 * PATCH /api/extra-boq-items/[id]
 * Toggles isActive explicitly (Admin only).
 */
export const DELETE = setActiveHandler(prisma.extraItemBOQ, 'Extra BOQ item');
export const PATCH  = setActiveHandler(prisma.extraItemBOQ, 'Extra BOQ item');
