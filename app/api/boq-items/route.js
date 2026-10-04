import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/boq-items
 * Query params:
 * - ?boqId=...  (filter by parent BOQ)
 * - ?page=1 &limit=10 (or &limit=all)
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const isAll = searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = isAll ? 10000 : Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = isAll ? 0 : (page - 1) * limit;
    const boqId = searchParams.get('boqId');

    const where = {};
    if (boqId) where.boqId = boqId;

    if (!includeInactive(searchParams, user)) where.isActive = true;

    const [total, items] = await Promise.all([
      prisma.bOQItems.count({ where }),
      prisma.bOQItems.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ slNo: 'asc' }, { createdAt: 'asc' }],
        include: {
          boq: { select: { id: true, boqCode: true } },
        },
      }),
    ]);

    if (isAll) return successResponse(items, 'BOQ items retrieved');

    return successResponse(items, 'BOQ items retrieved', 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQ items');
  }
});

/**
 * POST /api/boq-items
 * Create one or many BOQ items.
 * Body can be a single object OR an array (bulk upload from Excel).
 *
 * Fields per item:
 * - boqId       (required)
 * - slNo        (string)
 * - itemName    (string — "Description of Work")
 * - specification (string)
 * - unit        (string)
 * - quantity    (string)
 * - rate        (number)
 * - amount      (number)
 * - remarks     (string)
 * - itemLeft    (string)
 * - itemReceivedTotalQuantity (string)
 * - itemReceivedImage (JSON array)
 * - extraItem   (string)
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request, context) => {
  try {
    const user = context?.user;
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request payload is required.', 400);

    const rows = Array.isArray(body) ? body : [body];

    if (rows.length === 0) return errorResponse('At least one item is required.', 400);
    if (rows.length > 500) return errorResponse('Maximum 500 items per request.', 400);

    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || typeof row.boqId !== 'string' || !row.boqId.trim())
        return errorResponse(`Row ${index + 1}: boqId is required. Nothing was imported.`, 400);
      for (const field of ['rate', 'amount']) {
        if (row[field] != null && (String(row[field]).trim() === '' || !Number.isFinite(Number(row[field])) || Number(row[field]) < 0))
          return errorResponse(`Row ${index + 1}: ${field} must be a non-negative number. Nothing was imported.`, 400);
      }
    }

    // Validate all boqId values exist
    const boqIds = [...new Set(rows.map((r) => r.boqId).filter(Boolean))];
    if (boqIds.length === 0) return errorResponse('boqId is required for all items.', 400);

    for (const id of boqIds) {
      const exists = await prisma.bOQs.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return errorResponse(`BOQ with id "${id}" not found.`, 400);
    }

    const data = rows.map((r) => ({
      boqId: r.boqId,
      slNo: r.slNo != null ? String(r.slNo) : null,
      itemName: r.itemName ?? r.description ?? r['Description of Work'] ?? null,
      specification: r.specification ?? r.Specification ?? null,
      unit: r.unit ?? r.Unit ?? null,
      quantity: r.quantity ?? r.Quantity != null ? String(r.quantity ?? r.Quantity) : null,
      rate: r.rate != null ? parseFloat(r.rate) : null,
      amount: r.amount != null ? parseFloat(r.amount) : null,
      remarks: r.remarks ?? r.Remarks ?? null,
      itemLeft: r.itemLeft != null ? String(r.itemLeft) : null,
      itemReceivedTotalQuantity: r.itemReceivedTotalQuantity != null ? String(r.itemReceivedTotalQuantity) : null,
      itemReceivedImage: Array.isArray(r.itemReceivedImage) ? r.itemReceivedImage : null,
      extraItem: r.extraItem ?? null,
      createdBy: user?.id ?? null,
    }));

    const created = await prisma.bOQItems.createMany({ data, skipDuplicates: false });

    return successResponse({ count: created.count }, `${created.count} BOQ item(s) created successfully.`, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create BOQ items');
  }
});

/**
 * DELETE /api/boq-items
 * Delete all items for a given BOQ.
 * Query: ?boqId=...
 *
 * Authenticated: ADMIN ('A') only.
 */
export const DELETE = requireRoles(['A'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const boqId = searchParams.get('boqId');
    if (!boqId) return errorResponse('boqId query param is required.', 400);

    const updated = await prisma.bOQItems.updateMany({ where: { boqId }, data: { isActive: false } });
    return successResponse({ count: updated.count }, `${updated.count} items deactivated.`);
  } catch (error) {
    return handleApiError(error, 'Failed to delete BOQ items');
  }
});
