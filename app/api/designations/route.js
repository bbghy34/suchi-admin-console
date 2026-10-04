import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { onlyActive } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { excludedStaffCounts } from '@/lib/excluded-staff';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/designations
 * Returns all designations with employee counts.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const [designations, excludedByDesignation] = await Promise.all([
      prisma.designation.findMany({
        where: onlyActive({}, searchParams, user),
        orderBy: { title: 'asc' },
        include: {
          _count: {
            select: {
              employees: true,
            },
          },
        },
      }),
      excludedStaffCounts(prisma, 'designationId'),
    ]);

    const formatted = designations.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      employeeCount: Math.max(0, d._count.employees - (excludedByDesignation.get(d.id) || 0)),
      isActive: d.isActive,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return successResponse(formatted, 'Designations retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve designations');
  }
});

/**
 * POST /api/designations
 * Creates a new designation.
 * Required: title
 * Optional: description
 * Rules:
 * - title must be unique
 * - Only Admin can create (role: 'A')
 */
export const POST = requireRoles(['A'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.title || !body.title.trim()) {
      return errorResponse('Designation title is required.', 400);
    }

    const title = body.title.trim();
    const description = body.description ? body.description.trim() : null;

    // Validate unique title (case-insensitive)
    const existing = await prisma.designation.findFirst({
      where: {
        title: {
          equals: title,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return conflict(`A designation with title "${title}" already exists.`);
    }

    const newDesignation = await prisma.designation.create({
      data: {
        title,
        description,
      },
    });

    const formatted = {
      id: newDesignation.id,
      title: newDesignation.title,
      description: newDesignation.description,
      employeeCount: 0,
      createdAt: newDesignation.createdAt,
      updatedAt: newDesignation.updatedAt,
    };

    return successResponse(formatted, 'Designation created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create designation');
  }
});
