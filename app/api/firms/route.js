import { workforceEmployeeWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/firms
 * Query parameters:
 *   - page, limit, search
 * Returns firm list with employee + project counts.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip  = (page - 1) * limit;

    const searchFilter = searchParams.get('search');

    const where = {};

    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.trim();
      where.OR = [
        { name:           { contains: q, mode: 'insensitive' } },
        { gstNo:          { contains: q, mode: 'insensitive' } },
        { proprietorName: { contains: q, mode: 'insensitive' } },
        { phoneNo:        { contains: q, mode: 'insensitive' } },
        { address:        { contains: q, mode: 'insensitive' } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    const [total, firms] = await Promise.all([
      prisma.firm.count({ where }),
      prisma.firm.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { employees: { where: workforceEmployeeWhere() }, projects: true },
          },
        },
      }),
    ]);

    const formatted = firms.map((f) => ({
      id:             f.id,
      name:           f.name,
      gstNo:          f.gstNo,
      address:        f.address,
      proprietorName: f.proprietorName,
      phoneNo:        f.phoneNo,
      createdBy:      f.createdBy,
      updatedBy:      f.updatedBy,
      employeeCount:  f._count?.employees ?? 0,
      projectCount:   f._count?.projects  ?? 0,
      isActive:       f.isActive,
      createdAt:      f.createdAt,
      updatedAt:      f.updatedAt,
    }));

    const response  = await successResponse(formatted, 'Firms retrieved successfully');
    const jsonBody  = await response.json();
    jsonBody.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return Response.json(jsonBody, { status: 200 });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve firms');
  }
});

/**
 * POST /api/firms
 * Required: name
 * Optional: gstNo, address, proprietorName, phoneNo
 * Authenticated: ADMIN ('A') only.
 */
export const POST = requireRoles(['A'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) return errorResponse('Request payload is required.', 400);

    const { name, gstNo, address, proprietorName, phoneNo, createdBy } = body;

    if (!name || !name.trim()) {
      return errorResponse('Firm name is required.', 400);
    }

    const trimmedName = name.trim();

    // Duplicate name check
    const existing = await prisma.firm.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });
    if (existing) {
      return conflict(`A firm named "${trimmedName}" already exists.`);
    }

    // Duplicate GST check
    if (gstNo && gstNo.trim()) {
      const gstConflict = await prisma.firm.findUnique({
        where: { gstNo: gstNo.trim().toUpperCase() },
      });
      if (gstConflict) {
        return conflict(`GST No "${gstNo.trim()}" is already registered.`);
      }
    }

    const firm = await prisma.firm.create({
      data: {
        name:           trimmedName,
        gstNo:          gstNo          ? gstNo.trim().toUpperCase() : null,
        address:        address        ? address.trim()        : null,
        proprietorName: proprietorName ? proprietorName.trim() : null,
        phoneNo:        phoneNo        ? phoneNo.trim()        : null,
        createdBy:      createdBy      ? createdBy.trim()      : null,
      },
      include: {
        _count: { select: { employees: { where: workforceEmployeeWhere() }, projects: true } },
      },
    });

    return successResponse(
      {
        id:             firm.id,
        name:           firm.name,
        gstNo:          firm.gstNo,
        address:        firm.address,
        proprietorName: firm.proprietorName,
        phoneNo:        firm.phoneNo,
        createdBy:      firm.createdBy,
        employeeCount:  firm._count?.employees ?? 0,
        projectCount:   firm._count?.projects  ?? 0,
        createdAt:      firm.createdAt,
        updatedAt:      firm.updatedAt,
      },
      'Firm created successfully',
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to create firm');
  }
});
