import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { parseItemName, parsePrice, parseRemarks, parsePriceBound, expenseInclude } from '@/lib/site-expense';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


async function withPeople(records) {
  const ids = [...new Set(records.flatMap((row) => [row.createdBy, row.updatedBy]).filter(Boolean))];
  const people = ids.length
    ? await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(people.map((person) => [person.id, person]));
  const personOf = (id) => (id ? byId.get(id) || { id, name: id } : null);
  return records.map((row) => ({
    ...row,
    creator: personOf(row.createdBy),
    editor: personOf(row.updatedBy),
  }));
}

/**
 * GET /api/site-expenses
 * Lists expenses for the Site Expense page.
 * Filters: search, siteId, projectId, fromDate, toDate, minPrice, maxPrice, sortBy, sortOrder, page, limit
 */
export const GET = requireRoles(['A', 'M'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const siteId = searchParams.get('siteId')?.trim();
    const projectId = searchParams.get('projectId')?.trim();
    const fromDate = searchParams.get('fromDate')?.trim();
    const toDate = searchParams.get('toDate')?.trim();
    const sortBy = searchParams.get('sortBy')?.trim() || 'createdAt';
    const sortOrder = searchParams.get('sortOrder')?.trim()?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const minPrice = parsePriceBound(searchParams.get('minPrice'), 'Minimum price');
    const maxPrice = parsePriceBound(searchParams.get('maxPrice'), 'Maximum price');
    if (!minPrice.ok) return errorResponse(minPrice.message, 400);
    if (!maxPrice.ok) return errorResponse(maxPrice.message, 400);
    if (minPrice.value !== null && maxPrice.value !== null && minPrice.value > maxPrice.value) {
      return errorResponse('Minimum price cannot be greater than maximum price.', 400);
    }

    const where = {};
    if (siteId) where.siteId = siteId;
    if (projectId) where.site = { projectId };
    if (search) {
      where.OR = [
        { itemName: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } },
        { site: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (minPrice.value !== null || maxPrice.value !== null) {
      where.price = {};
      if (minPrice.value !== null) where.price.gte = minPrice.value;
      if (maxPrice.value !== null) where.price.lte = maxPrice.value;
    }
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        const start = new Date(fromDate);
        if (!Number.isNaN(start.getTime())) where.createdAt.gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        if (!Number.isNaN(end.getTime())) {
          if (toDate.length === 10) end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
    }

    let orderBy = { createdAt: sortOrder };
    if (sortBy === 'price') orderBy = { price: sortOrder };
    else if (sortBy === 'itemName') orderBy = { itemName: sortOrder };
    else if (sortBy === 'site') orderBy = { site: { name: sortOrder } };
    else if (sortBy === 'createdAt') orderBy = { createdAt: sortOrder };

    const exportAll = searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = exportAll ? 2000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = exportAll ? 0 : (page - 1) * limit;

    const [total, sum, records] = await Promise.all([
      prisma.siteExpense.count({ where }),
      prisma.siteExpense.aggregate({ where, _sum: { price: true } }),
      prisma.siteExpense.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: expenseInclude,
      }),
    ]);

    const rows = await withPeople(records);
    return successResponse(rows, 'Site expenses retrieved successfully.', 200, {
      page: exportAll ? 1 : page,
      limit,
      total,
      totalPages: exportAll ? 1 : Math.ceil(total / limit) || 1,
      totalAmount: (sum._sum.price ?? 0n).toString(),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve site expenses.');
  }
});

/**
 * POST /api/site-expenses
 * Body: { itemName, price, siteId, remarks? }
 */
export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request body is required.', 400);

    const itemName = parseItemName(body.itemName);
    const price = parsePrice(body.price);
    const remarks = parseRemarks(body.remarks);
    const siteId = String(body.siteId || '').trim();

    if (!itemName.ok) return errorResponse(itemName.message, 400);
    if (!price.ok) return errorResponse(price.message, 400);
    if (!remarks.ok) return errorResponse(remarks.message, 400);
    if (!siteId) return errorResponse('Site is required.', 400);

    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) return errorResponse('Site not found.', 400);

    const record = await prisma.siteExpense.create({
      data: {
        itemName: itemName.value,
        price: price.value,
        remarks: remarks.skip ? null : remarks.value,
        siteId,
        createdBy: user?.id || null,
        updatedBy: user?.id || null,
      },
      include: expenseInclude,
    });

    const [enriched] = await withPeople([record]);
    return successResponse(enriched, 'Site expense created.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create site expense.');
  }
});
