import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, handleApiError } from '@/lib/api-response';
import { loadLowStock } from '@/lib/warehouse';
import { readCache, WAREHOUSE_LOW_STOCK_KEY, LOW_STOCK_TTL_MS } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const [materialCount, supplierCount, lowStock, recentLedger] = await Promise.all([
      prisma.material.count({ where: { isActive: true } }),
      prisma.supplier.count({ where: { isActive: true } }),
      readCache(WAREHOUSE_LOW_STOCK_KEY, LOW_STOCK_TTL_MS, loadLowStock),
      prisma.stockLedger.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { material: { select: { code: true, name: true } } },
      }),
    ]);

    return successResponse({
      materialCount,
      supplierCount,
      lowStockCount: lowStock.length,
      lowStock,
      recentLedger,
    }, 'Warehouse summary retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve the warehouse summary.');
  }
});
