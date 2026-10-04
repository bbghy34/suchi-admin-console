import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/boqs/[id]
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;

    const boq = await prisma.bOQs.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, tenderId: true, status: true } },
        site: { select: { id: true, name: true } },
      },
    });

    if (!boq) return notFound('BOQ record not found.');

    return successResponse(
      {
        id: boq.id,
        projectId: boq.projectId,
        boqCode: boq.boqCode,
        docsLinks: boq.docsLinks,
        createdAt: boq.createdAt,
        validity: boq.validity,
        createdBy: boq.createdBy,
        siteId: boq.siteId,
        project: boq.project,
        site: boq.site,
      },
      'BOQ record retrieved successfully'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQ record');
  }
});

/**
 * PUT /api/boqs/[id]
 * Updates an existing BOQ record.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;

    const existingBoq = await prisma.bOQs.findUnique({ where: { id } });
    if (!existingBoq) return errorResponse('BOQ record not found.', 404);

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request payload is required.', 400);

    const updateData = {};

    // boqCode
    if (body.boqCode !== undefined) {
      const trimmed = String(body.boqCode).trim();
      if (!trimmed) return errorResponse('BOQ code cannot be empty.', 400);
      updateData.boqCode = trimmed;
    }

    // projectId
    if (body.projectId !== undefined) {
      if (!body.projectId) {
        updateData.projectId = null;
      } else {
        const exists = await prisma.project.findUnique({
          where: { id: String(body.projectId).trim() },
          select: { id: true },
        });
        if (!exists) return errorResponse(`Project "${body.projectId}" not found.`, 400);
        updateData.projectId = exists.id;
      }
    }

    // siteId
    if (body.siteId !== undefined) {
      if (!body.siteId) {
        updateData.siteId = null;
      } else {
        const exists = await prisma.site.findUnique({
          where: { id: String(body.siteId).trim() },
          select: { id: true },
        });
        if (!exists) return errorResponse(`Site "${body.siteId}" not found.`, 400);
        updateData.siteId = exists.id;
      }
    }

    // docsLinks — JSON array of URL strings
    if (body.docsLinks !== undefined) {
      if (body.docsLinks === null || body.docsLinks === '') {
        updateData.docsLinks = null;
      } else if (Array.isArray(body.docsLinks)) {
        updateData.docsLinks = body.docsLinks;
      } else if (typeof body.docsLinks === 'string') {
        try {
          const parsed = JSON.parse(body.docsLinks);
          updateData.docsLinks = Array.isArray(parsed) ? parsed : [body.docsLinks];
        } catch {
          updateData.docsLinks = [body.docsLinks];
        }
      }
    }

    // validity date
    if (body.validity !== undefined) {
      if (!body.validity) {
        updateData.validity = null;
      } else {
        const d = new Date(body.validity);
        if (isNaN(d.getTime())) return errorResponse('Invalid validity date format.', 400);
        updateData.validity = d;
      }
    }

    const updatedBoq = await prisma.bOQs.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, tenderId: true } },
        site: { select: { id: true, name: true } },
      },
    });

    // If items were provided (e.g. from uploaded Excel during edit), insert them into BOQItems
    let importedItemsCount = 0;
    if (Array.isArray(body.items) && body.items.length > 0) {
      const user = context?.user;
      const itemsToCreate = body.items.map((r, i) => ({
        boqId: id,
        slNo: r.slNo ? String(r.slNo) : String(i + 1),
        itemName: r.itemName ? String(r.itemName) : 'Item',
        specification: r.specification || null,
        unit: r.unit || null,
        quantity: r.quantity ? String(r.quantity) : null,
        rate: r.rate != null ? parseFloat(r.rate) || null : null,
        amount: r.amount != null ? parseFloat(r.amount) || null : null,
        remarks: r.remarks || null,
        createdBy: user?.id ?? null,
      }));
      const result = await prisma.bOQItems.createMany({ data: itemsToCreate });
      importedItemsCount = result.count;
    }

    return successResponse(
      {
        id: updatedBoq.id,
        projectId: updatedBoq.projectId,
        boqCode: updatedBoq.boqCode,
        docsLinks: updatedBoq.docsLinks,
        createdAt: updatedBoq.createdAt,
        validity: updatedBoq.validity,
        createdBy: updatedBoq.createdBy,
        siteId: updatedBoq.siteId,
        project: updatedBoq.project,
        site: updatedBoq.site,
        itemsCount: importedItemsCount,
      },
      importedItemsCount > 0
        ? `BOQ record updated and ${importedItemsCount} line item(s) imported successfully`
        : 'BOQ record updated successfully'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to update BOQ record');
  }
});

const boqActive = setActiveHandler(prisma.bOQs, 'BOQ');
export const PATCH = boqActive;
export const DELETE = boqActive;
