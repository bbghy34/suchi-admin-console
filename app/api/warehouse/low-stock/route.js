import prisma from '@/lib/prisma';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, handleApiError } from '@/lib/api-response';
import { loadLowStock } from '@/lib/warehouse';
import { readCache, WAREHOUSE_LOW_STOCK_KEY, LOW_STOCK_TTL_MS } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const data = await readCache(WAREHOUSE_LOW_STOCK_KEY, LOW_STOCK_TTL_MS, loadLowStock);
    return successResponse(data, 'Low stock retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve low stock.');
  }
});
