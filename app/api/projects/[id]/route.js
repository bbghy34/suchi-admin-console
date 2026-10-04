import { publicSite } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { invalidateWarehouseOptions } from '@/lib/read-cache';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/projects/[id]
 * Returns project details including:
 * - Department (departmentRel)
 * - Contractor (contractorRel - Project.contractor -> Contractor.id)
 * - Sites
 * - BOQs (boqRecords)
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        departmentRel: true,
        contractorRel: true,
        firm: true,
        sites: {
          include: {
            manager: {
              select: {
                role: true,
                id: true,
                name: true,
                email: true,
                phone: true,
                employeeCode: true,
              },
            },
          },
        },
        boqRecords: true,
      },
    });

    if (!project) {
      return errorResponse('Project not found.', 404);
    }

    const formatted = {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      status: project.status,
      departmentId: project.department,
      department: project.departmentRel,
      departmentRel: project.departmentRel,
      progress: project.progress,
      tenderId: project.tenderId,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      contractorId: project.contractor,
      contractor: project.contractorRel,
      contractorRel: project.contractorRel,
      firmId: project.firmId,
      firm: project.firm,
      sites: (project.sites || []).map(publicSite),
      boqRecords: project.boqRecords || [],
      siteCount: project.sites?.length || 0,
      boqCount: project.boqRecords?.length || 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    return successResponse(formatted, 'Project details retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve project');
  }
});

/**
 * PUT /api/projects/[id]
 * Updates project details with same validation as POST:
 * - department must exist if updated
 * - contractor must exist if supplied (must be Contractor.id, never Employee)
 * - startDate must be before endDate
 * - progress should be between 0 and 100
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return errorResponse('Project not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // 1. Validate Name
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return errorResponse('Project name cannot be empty.', 400);
      }
      updateData.name = trimmedName;
    }

    // 2. Validate Department if updated
    if (body.department !== undefined) {
      const trimmedDept = body.department ? body.department.trim() : null;
      if (!trimmedDept) {
        return errorResponse('Department is required and cannot be empty.', 400);
      }

      const deptRecord = await prisma.department.findUnique({
        where: { id: trimmedDept },
      });

      if (!deptRecord) {
        return errorResponse(`Department with ID "${trimmedDept}" not found.`, 400);
      }
      updateData.department = trimmedDept;
    }

    // 3. Validate Contractor if updated (MUST be Contractor.id, NEVER Employee)
    if (body.contractor !== undefined) {
      if (body.contractor === null || body.contractor === '') {
        updateData.contractor = null;
      } else {
        const trimmedContractor = String(body.contractor).trim();
        const contractorRecord = await prisma.contractor.findUnique({
          where: { id: trimmedContractor },
        });

        if (!contractorRecord) {
          return errorResponse(
            `Contractor with ID "${trimmedContractor}" not found. Contractor must reference a valid Contractor.id.`,
            400
          );
        }
        updateData.contractor = contractorRecord.id;
      }
    }

    // 4. Validate Dates
    let effectiveStartDate = existingProject.startDate;
    let effectiveEndDate = existingProject.endDate;

    if (body.startDate !== undefined) {
      if (!body.startDate) {
        return errorResponse('Start date cannot be empty.', 400);
      }
      const sDate = new Date(body.startDate);
      if (isNaN(sDate.getTime())) {
        return errorResponse('Invalid startDate format.', 400);
      }
      effectiveStartDate = sDate;
      updateData.startDate = sDate;
    }

    if (body.endDate !== undefined) {
      if (!body.endDate) {
        return errorResponse('End date cannot be empty.', 400);
      }
      const eDate = new Date(body.endDate);
      if (isNaN(eDate.getTime())) {
        return errorResponse('Invalid endDate format.', 400);
      }
      effectiveEndDate = eDate;
      updateData.endDate = eDate;
    }

    if (effectiveStartDate && effectiveEndDate && effectiveStartDate >= effectiveEndDate) {
      return errorResponse('Start date must be before end date.', 400);
    }

    // 5. Validate Progress
    if (body.progress !== undefined) {
      if (body.progress === null || body.progress === '') {
        updateData.progress = null;
      } else {
        const p = Number(body.progress);
        if (isNaN(p) || p < 0 || p > 100) {
          return errorResponse('Progress should be between 0 and 100.', 400);
        }
        updateData.progress = Math.round(p);
      }
    }

    // 6. Validate Budget
    if (body.budget !== undefined) {
      if (body.budget === null || body.budget === '') {
        updateData.budget = null;
      } else {
        const b = parseFloat(body.budget);
        if (isNaN(b) || b < 0) {
          return errorResponse('Budget must be a non-negative number.', 400);
        }
        updateData.budget = b;
      }
    }

    // Optional fields
    if (body.description !== undefined) {
      updateData.description = body.description ? body.description.trim() : null;
    }
    if (body.type !== undefined) {
      updateData.type = body.type ? body.type.trim() : null;
    }
    if (body.status !== undefined) {
      updateData.status = body.status ? body.status.trim() : null;
    }
    if (body.tenderId !== undefined) {
      updateData.tenderId = body.tenderId ? body.tenderId.trim() : null;
    }
    if (body.firmId !== undefined) {
      updateData.firmId = body.firmId ? body.firmId.trim() : null;
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        departmentRel: true,
        contractorRel: true,
        firm: true,
        sites: { include: { manager: { select: { id: true, role: true } } } },
        boqRecords: true,
      },
    });

    const formatted = {
      id: updatedProject.id,
      name: updatedProject.name,
      description: updatedProject.description,
      type: updatedProject.type,
      status: updatedProject.status,
      departmentId: updatedProject.department,
      department: updatedProject.departmentRel,
      departmentRel: updatedProject.departmentRel,
      progress: updatedProject.progress,
      tenderId: updatedProject.tenderId,
      startDate: updatedProject.startDate,
      endDate: updatedProject.endDate,
      budget: updatedProject.budget,
      contractorId: updatedProject.contractor,
      contractor: updatedProject.contractorRel,
      contractorRel: updatedProject.contractorRel,
      firmId: updatedProject.firmId,
      firm: updatedProject.firm,
      sites: (updatedProject.sites || []).map(publicSite),
      boqRecords: updatedProject.boqRecords || [],
      createdAt: updatedProject.createdAt,
      updatedAt: updatedProject.updatedAt,
    };

    invalidateWarehouseOptions();
    return successResponse(formatted, 'Project updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update project');
  }
});

const projectActive = setActiveHandler(prisma.project, 'Project');
export const PATCH = projectActive;
export const DELETE = projectActive;
