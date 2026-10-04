import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';

/**
 * GET /api/contractors
 * Query parameters supported:
 * - ?page=1
 * - &limit=20
 * - &search=keyword
 *
 * Returns contractor list with project count.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const searchFilter = searchParams.get('search');

    const where = {};

    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phoneNo: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    const [total, contractors] = await Promise.all([
      prisma.contractor.count({ where }),
      prisma.contractor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              projects: true,
            },
          },
        },
      }),
    ]);

    const formattedContractors = contractors.map((c) => ({
      id: c.id,
      name: c.name,
      phoneNo: c.phoneNo,
      description: c.description,
      projectCount: c._count?.projects ?? 0,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    const response = successResponse(
      formattedContractors,
      'Contractors retrieved successfully'
    );

    const jsonBody = await response.json();
    jsonBody.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return Response.json(jsonBody, { status: 200 });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve contractors');
  }
});

/**
 * POST /api/contractors
 * Required:
 * - name
 * Optional:
 * - phoneNo
 * - description
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const { name, phoneNo, description } = body;

    // Validate required field: name
    if (!name || !name.trim()) {
      return errorResponse('Contractor name is required.', 400);
    }

    const trimmedName = name.trim();

    // Check duplicate name
    const existingContractor = await prisma.contractor.findFirst({
      where: {
        name: {
          equals: trimmedName,
          mode: 'insensitive',
        },
      },
    });

    if (existingContractor) {
      return conflict(
        `A contractor with name "${trimmedName}" already exists.`
      );
    }

    const newContractor = await prisma.contractor.create({
      data: {
        name: trimmedName,
        phoneNo: phoneNo ? phoneNo.trim() : null,
        description: description ? description.trim() : null,
      },
      include: {
        _count: {
          select: {
            projects: true,
          },
        },
      },
    });

    const formatted = {
      id: newContractor.id,
      name: newContractor.name,
      phoneNo: newContractor.phoneNo,
      description: newContractor.description,
      projectCount: newContractor._count?.projects ?? 0,
      createdAt: newContractor.createdAt,
      updatedAt: newContractor.updatedAt,
    };

    return successResponse(formatted, 'Contractor created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create contractor');
  }
});
