import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, handleApiError } from '@/lib/api-response';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const materialSelect = { id: true, code: true, name: true, unit: { select: { symbol: true, name: true } } };

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const rows = await prisma.stockLedger.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { material: { select: materialSelect } },
    });
    return successResponse(rows, 'Stock ledger retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve the stock ledger.');
  }
});
