import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { postStockMovement, positiveNumber, StockError } from '@/lib/warehouse';
import { invalidateLowStock } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const include = { material: { select: { id: true, code: true, name: true } } };

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const rows = await prisma.stockAdjustment.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include,
    });
    return successResponse(rows, 'Stock adjustments retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve stock adjustments.');
  }
});

export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('JSON body is required.', 400);
    const materialId = String(body.materialId || '').trim();
    const direction = String(body.direction || '').toUpperCase();
    const reason = String(body.reason || '').trim();
    const quantity = positiveNumber(body.quantity, 'Quantity');
    if (!materialId) return errorResponse('Material is required.', 400);
    if (direction !== 'INCREASE' && direction !== 'DECREASE') {
      return errorResponse('Direction must be increase or decrease.', 400);
    }
    if (!reason) return errorResponse('A reason is required.', 400);
    if (!quantity.ok) return errorResponse(quantity.message, 400);

    const saved = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          materialId,
          direction,
          quantity: quantity.value,
          reason,
          createdBy: user.id,
        },
      });
      await postStockMovement(tx, {
        materialId,
        direction: direction === 'DECREASE' ? 'OUT' : 'IN',
        quantity: quantity.value,
        movement: 'ADJUSTMENT',
        referenceType: 'ADJUSTMENT',
        referenceId: adjustment.id,
        remarks: reason,
        createdBy: user.id,
      });
      return adjustment;
    });

    const row = await prisma.stockAdjustment.findUnique({ where: { id: saved.id }, include });
    invalidateLowStock();
    return successResponse(row, 'Stock adjusted.', 201);
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 400);
    if (error?.code === 'P2003') return errorResponse('Material was not found.', 400);
    return handleApiError(error, 'Failed to adjust stock.');
  }
});
