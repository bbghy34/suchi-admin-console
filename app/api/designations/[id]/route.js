import { workforceEmployeeWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/designations/[id]
 * Returns single designation with employee count.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const designation = await prisma.designation.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: { where: workforceEmployeeWhere() },
          },
        },
      },
    });

    if (!designation) {
      return notFound('Designation not found.');
    }

    const formatted = {
      id: designation.id,
      title: designation.title,
      description: designation.description,
      employeeCount: designation._count.employees,
      createdAt: designation.createdAt,
      updatedAt: designation.updatedAt,
    };

    return successResponse(formatted, 'Designation retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve designation');
  }
});

/**
 * PUT /api/designations/[id]
 * Updates designation title and description.
 * Rules:
 * - Only Admin can update (role: 'A')
 * - title must remain unique if modified
 */
export const PUT = requireRoles(['A'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existing = await prisma.designation.findUnique({
      where: { id },
    });

    if (!existing) {
      return errorResponse('Designation not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // Validate title update if provided
    if (body.title !== undefined) {
      const trimmedTitle = body.title.trim();
      if (!trimmedTitle) {
        return errorResponse('Designation title cannot be empty.', 400);
      }

      if (trimmedTitle.toLowerCase() !== existing.title.toLowerCase()) {
        const titleConflict = await prisma.designation.findFirst({
          where: {
            title: {
              equals: trimmedTitle,
              mode: 'insensitive',
            },
            id: { not: id },
          },
        });

        if (titleConflict) {
          return conflict(
            `Another designation with title "${trimmedTitle}" already exists.`
          );
        }
      }

      updateData.title = trimmedTitle;
    }

    // Update description if provided
    if (body.description !== undefined) {
      updateData.description = body.description ? body.description.trim() : null;
    }

    const updated = await prisma.designation.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            employees: { where: workforceEmployeeWhere() },
          },
        },
      },
    });

    const formatted = {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      employeeCount: updated._count.employees,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    return successResponse(formatted, 'Designation updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update designation');
  }
});

const designationActive = setActiveHandler(prisma.designation, 'Designation');
export const PATCH = designationActive;
export const DELETE = designationActive;
