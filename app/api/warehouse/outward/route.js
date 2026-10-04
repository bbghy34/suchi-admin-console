import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { assertSiteBelongsToProject, docNo, postStockMovement, positiveNumber, StockError } from '@/lib/warehouse';
import { invalidateLowStock } from '@/lib/read-cache';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const include = {
  material: { select: { id: true, code: true, name: true, unit: { select: { symbol: true } } } },
  project: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
};

export const GET = requireRoles(['A', 'M'])(async () => {
  try {
    const rows = await prisma.materialOutward.findMany({
      where: { isActive: true },
      orderBy: { issuedAt: 'desc' },
      take: 300,
      include,
    });
    return successResponse(rows, 'Material issues retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve material issues.');
  }
});

export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('JSON body is required.', 400);
    const materialId = String(body.materialId || '').trim();
    const projectId = String(body.projectId || '').trim();
    const siteId = String(body.siteId || '').trim();
    const purpose = String(body.purpose || '').trim();
    const quantity = positiveNumber(body.quantity, 'Quantity');
    if (!materialId) return errorResponse('Material is required.', 400);
    if (!quantity.ok) return errorResponse(quantity.message, 400);
    await assertSiteBelongsToProject(prisma, { siteId, projectId });

    const saved = await prisma.$transaction(async (tx) => {
      const issue = await tx.materialOutward.create({
        data: {
          issueNumber: docNo('ISS'),
          materialId,
          projectId: projectId || null,
          siteId: siteId || null,
          quantity: quantity.value,
          purpose: purpose || null,
          createdBy: user.id,
        },
      });
      await postStockMovement(tx, {
        materialId,
        direction: 'OUT',
        quantity: quantity.value,
        movement: 'OUTWARD',
        referenceType: 'ISSUE',
        referenceId: issue.id,
        remarks: purpose || issue.issueNumber,
        createdBy: user.id,
      });
      return issue.id;
    });

    const row = await prisma.materialOutward.findUnique({ where: { id: saved }, include });
    invalidateLowStock();
    return successResponse(row, 'Material issued and stock updated.', 201);
  } catch (error) {
    if (error instanceof StockError) return errorResponse(error.message, 400);
    if (error?.code === 'P2003') return errorResponse('Project or site was not found.', 400);
    return handleApiError(error, 'Failed to issue material.');
  }
});
