import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { docNo, postStockMovement, positiveNumber, nonNegativeNumber, StockError } from '@/lib/warehouse';
import { invalidateLowStock } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const include = {
  supplier: { select: { id: true, name: true } },
  material: { select: { id: true, code: true, name: true, unit: { select: { symbol: true } } } },
};

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const rows = await prisma.materialInward.findMany({
      where: { isActive: true },
      orderBy: { receivedAt: 'desc' },
      take: 300,
      include,
    });
    return successResponse(rows, 'Material inward records retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve inward records.');
  }
});

export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('JSON body is required.', 400);
    const supplierId = String(body.supplierId || '').trim();
    const materialId = String(body.materialId || '').trim();
    const remarks = String(body.remarks || '').trim();
    const quantity = positiveNumber(body.quantity, 'Quantity');
    const rate = nonNegativeNumber(body.rate, 'Rate');
    if (!supplierId) return errorResponse('Supplier is required.', 400);
    if (!materialId) return errorResponse('Material is required.', 400);
    if (!quantity.ok) return errorResponse(quantity.message, 400);
    if (!rate.ok) return errorResponse(rate.message, 400);

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.isActive === false) return errorResponse('Choose an active supplier.', 400);

    const saved = await prisma.$transaction(async (tx) => {
      const inward = await tx.materialInward.create({
        data: {
          grnNumber: docNo('GRN'),
          supplierId,
          materialId,
          quantity: quantity.value,
          rate: rate.value,
          remarks: remarks || null,
          createdBy: user.id,
        },
      });
      await postStockMovement(tx, {
        materialId,
        direction: 'IN',
        quantity: quantity.value,
        movement: 'INWARD',
        referenceType: 'GRN',
        referenceId: inward.id,
        remarks: remarks || inward.grnNumber,
        createdBy: user.id,
      });
      return inward.id;
    });

    const row = await prisma.materialInward.findUnique({ where: { id: saved }, include });
    invalidateLowStock();
    return successResponse(row, 'Goods received and stock updated.', 201);
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 400);
    if (error?.code === 'P2003') return errorResponse('Supplier or material was not found.', 400);
    return handleApiError(error, 'Failed to record material inward.');
  }
});
