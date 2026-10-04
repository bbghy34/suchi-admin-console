import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';

/**
 * GET /api/contractors/[id]
 * Returns:
 * - Contractor details
 * - Assigned projects (Project.contractor -> Contractor.id)
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          include: {
            departmentRel: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            projects: true,
          },
        },
      },
    });

    if (!contractor) {
      return notFound('Contractor not found.');
    }

    const formatted = {
      id: contractor.id,
      name: contractor.name,
      phoneNo: contractor.phoneNo,
      description: contractor.description,
      projectCount: contractor._count?.projects ?? contractor.projects.length,
      projects: contractor.projects,
      createdAt: contractor.createdAt,
      updatedAt: contractor.updatedAt,
    };

    return successResponse(formatted, 'Contractor details retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve contractor');
  }
});

/**
 * PUT /api/contractors/[id]
 * Allow:
 * - name
 * - phoneNo
 * - description
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingContractor = await prisma.contractor.findUnique({
      where: { id },
    });

    if (!existingContractor) {
      return errorResponse('Contractor not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // Validate name if provided
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return errorResponse('Contractor name cannot be empty.', 400);
      }

      if (trimmedName.toLowerCase() !== existingContractor.name.toLowerCase()) {
        const nameConflict = await prisma.contractor.findFirst({
          where: {
            name: {
              equals: trimmedName,
              mode: 'insensitive',
            },
            id: { not: id },
          },
        });

        if (nameConflict) {
          return conflict(
            `Another contractor with name "${trimmedName}" already exists.`
          );
        }
      }

      updateData.name = trimmedName;
    }

    if (body.phoneNo !== undefined) {
      updateData.phoneNo = body.phoneNo ? body.phoneNo.trim() : null;
    }

    if (body.description !== undefined) {
      updateData.description = body.description ? body.description.trim() : null;
    }

    const updatedContractor = await prisma.contractor.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            projects: true,
          },
        },
      },
    });

    const formatted = {
      id: updatedContractor.id,
      name: updatedContractor.name,
      phoneNo: updatedContractor.phoneNo,
      description: updatedContractor.description,
      projectCount: updatedContractor._count?.projects ?? 0,
      createdAt: updatedContractor.createdAt,
      updatedAt: updatedContractor.updatedAt,
    };

    return successResponse(formatted, 'Contractor updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update contractor');
  }
});

const contractorActive = setActiveHandler(prisma.contractor, 'Contractor');
export const PATCH = contractorActive;
export const DELETE = contractorActive;
