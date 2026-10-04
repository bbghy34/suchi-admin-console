import { requireRoles } from './auth.js';
import { invalidateWarehouseOptions, invalidateLowStock } from './read-cache.js';
import { successResponse, errorResponse, notFound, handleApiError } from './api-response.js';

/** Admins can ask for hidden records. Everyone else only sees active ones. */
export function includeInactive(searchParams, user) {
  return searchParams.get('includeInactive') === 'true' && user?.role === 'A';
}

export function onlyActive(where, searchParams, user) {
  if (includeInactive(searchParams, user)) return where;
  if (where.isActive !== undefined) return where;
  return { ...where, isActive: true };
}

/** Admin-only activate/deactivate. DELETE always deactivates. PATCH sets isActive from the body. */
export function setActiveHandler(delegate, label) {
  return requireRoles(['A'])(async (request, { params }) => {
    try {
      const { id } = await params;
      const existing = await delegate.findUnique({ where: { id } });
      if (!existing) return notFound(`${label} not found.`);

      let isActive = false;
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.isActive !== 'boolean') {
          return errorResponse('isActive boolean is required.', 400);
        }
        isActive = body.isActive;
      }

      const updated = await delegate.update({
        where: { id },
        data: { isActive },
      });
      invalidateWarehouseOptions();
      invalidateLowStock();

      return successResponse(
        { id: updated.id, isActive: updated.isActive },
        `${label} ${isActive ? 'activated' : 'deactivated'}. The record was kept.`
      );
    } catch (error) {
      return handleApiError(error, `Failed to update ${label}.`);
    }
  });
}
