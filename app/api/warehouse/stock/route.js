import prisma from '@/lib/prisma';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, handleApiError } from '@/lib/api-response';
import { loadMaterials, shapeStockRow } from '@/lib/warehouse';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const materials = await loadMaterials();
    return successResponse(materials.map(shapeStockRow), 'Current stock retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve current stock.');
  }
});
