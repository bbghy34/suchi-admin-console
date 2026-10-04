import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { docNo, postStockMovement, StockError } from '@/lib/warehouse';
import { invalidateLowStock } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const include = {
  material: { select: { id: true, code: true, name: true, unit: { select: { symbol: true } } } },
  project: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  issue: { select: { id: true, issueNumber: true } },
};

export const PATCH = requireRoles(['A', 'M'])(async (request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = String(body?.action || '').toUpperCase();
    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing || existing.isActive === false) return errorResponse('Material request not found.', 404);

    if (action === 'APPROVE' || action === 'REJECT') {
      if (existing.status !== 'PENDING') return errorResponse('Only a pending request can be approved or rejected.', 400);
      const row = await prisma.materialRequest.update({
        where: { id },
        data: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
        include,
      });
      return successResponse(row, action === 'APPROVE' ? 'Request approved.' : 'Request rejected.');
    }

    if (action === 'ISSUE') {
      if (existing.status !== 'APPROVED') return errorResponse('Approve the request before issuing stock.', 400);
      const savedId = await prisma.$transaction(async (tx) => {
        const claimed = await tx.materialRequest.updateMany({
          where: { id, status: 'APPROVED', isActive: true },
          data: { status: 'ISSUED' },
        });
        if (claimed.count !== 1) {
          throw new StockError('This request was already issued or is no longer approved.');
        }
        const issue = await tx.materialOutward.create({
          data: {
            issueNumber: docNo('ISS'),
            materialId: existing.materialId,
            projectId: existing.projectId,
            siteId: existing.siteId,
            quantity: existing.quantity,
            purpose: existing.remarks || 'Issued against material request',
            requestId: existing.id,
            createdBy: user.id,
          },
        });
        await postStockMovement(tx, {
          materialId: existing.materialId,
          direction: 'OUT',
          quantity: existing.quantity,
          movement: 'OUTWARD',
          referenceType: 'REQUEST',
          referenceId: existing.id,
          remarks: issue.issueNumber,
          createdBy: user.id,
        });
        return id;
      });
      const row = await prisma.materialRequest.findUnique({ where: { id: savedId }, include });
      invalidateLowStock();
      return successResponse(row, 'Material issued against the request.');
    }

    return errorResponse('Action must be approve, reject, or issue.', 400);
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 400);
    return handleApiError(error, 'Failed to update the material request.');
  }
});
