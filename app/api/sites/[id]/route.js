import { workforceEmployeeWhere, workforceRecordWhere, publicSite } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { isExcludedStaffRole, visiblePerson } from '@/lib/roles';
import { invalidateWarehouseOptions } from '@/lib/read-cache';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/sites/[id]
 * Retrieves single site with relations:
 * - project (Site.projectId -> Project.id)
 * - manager (Site.sitManager -> Employee.id)
 * - attendances count
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const site = await prisma.site.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            budget: true,
            tenderId: true,
          },
        },
        manager: {
          select: {
            role: true,
            id: true,
            name: true,
            email: true,
            phone: true,
            employeeCode: true,
            role: true,
          },
        },
        _count: {
          select: {
            attendances: { where: workforceRecordWhere() },
          },
        },
      },
    });

    if (!site) {
      return notFound('Site not found.');
    }

    const formatted = {
      id: site.id,
      name: site.name,
      address: site.address,
      coordinates: site.coordinates,
      attendanceRadius: site.attendanceRadius ?? null,
      status: site.status || 'ACTIVE',
      sitManager: publicSite(site).sitManager,
      projectId: site.projectId,
      manager: visiblePerson(site.manager),
      project: site.project,
      attendanceCount: site._count?.attendances || 0,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };

    return successResponse(formatted, 'Site details retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve site');
  }
});

/**
 * PUT /api/sites/[id]
 * Updates an existing site.
 *
 * Validations:
 * - site must exist
 * - name if provided must be non-empty
 * - projectId if provided must reference valid Project.id or be null
 * - sitManager if provided must reference valid Employee.id or be null
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingSite = await prisma.site.findUnique({
      where: { id },
    });

    if (!existingSite) {
      return errorResponse('Site not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // 1. Validate name if updated
    if (body.name !== undefined) {
      const trimmedName = String(body.name).trim();
      if (!trimmedName) {
        return errorResponse('Site name cannot be empty.', 400);
      }
      updateData.name = trimmedName;
    }

    // 2. Validate projectId if updated (Site.projectId -> Project.id)
    if (body.projectId !== undefined) {
      if (body.projectId === null || body.projectId === '') {
        updateData.projectId = null;
      } else {
        const trimmedProjectId = String(body.projectId).trim();
        const projectExists = await prisma.project.findUnique({
          where: { id: trimmedProjectId },
          select: { id: true, name: true },
        });

        if (!projectExists) {
          return errorResponse(
            `Project with ID "${trimmedProjectId}" not found. projectId must reference a valid Project.id.`,
            400
          );
        }
        updateData.projectId = projectExists.id;
      }
    }

    // 3. Validate sitManager if updated (Site.sitManager -> Employee.id)
    if (body.sitManager !== undefined) {
      if (body.sitManager === null || body.sitManager === '') {
        updateData.sitManager = null;
      } else {
        const trimmedManagerId = String(body.sitManager).trim();
        const managerExists = await prisma.employee.findUnique({
          where: { id: trimmedManagerId },
          select: { id: true, name: true, role: true },
        });

        if (!managerExists || isExcludedStaffRole(managerExists.role)) {
          return errorResponse(
            `Employee with ID "${trimmedManagerId}" not found. sitManager must reference a valid Employee.id.`,
            400
          );
        }
        updateData.sitManager = managerExists.id;
      }
    }

    // 4. Update optional fields
    if (body.status !== undefined) {
      updateData.status = body.status ? String(body.status).trim().toUpperCase() : 'ACTIVE';
    }
    if (body.address !== undefined) {
      updateData.address = body.address && String(body.address).trim() ? String(body.address).trim() : null;
    }
    if (body.coordinates !== undefined) {
      updateData.coordinates = body.coordinates && String(body.coordinates).trim() ? String(body.coordinates).trim() : null;
    }
    if (body.attendanceRadius !== undefined) {
      if (body.attendanceRadius === null || String(body.attendanceRadius).trim() === '') {
        updateData.attendanceRadius = null;
      } else {
        const parsed = parseInt(String(body.attendanceRadius), 10);
        if (isNaN(parsed) || parsed < 0) {
          return errorResponse('attendanceRadius must be a non-negative integer (metres).', 400);
        }
        updateData.attendanceRadius = parsed;
      }
    }

    const updatedSite = await prisma.site.update({
      where: { id },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            tenderId: true,
            status: true,
          },
        },
        manager: {
          select: {
            role: true,
            id: true,
            name: true,
            email: true,
            phone: true,
            employeeCode: true,
            role: true,
          },
        },
        _count: {
          select: {
            attendances: { where: workforceRecordWhere() },
          },
        },
      },
    });

    const formatted = {
      id: updatedSite.id,
      name: updatedSite.name,
      address: updatedSite.address,
      coordinates: updatedSite.coordinates,
      attendanceRadius: updatedSite.attendanceRadius ?? null,
      status: updatedSite.status || 'ACTIVE',
      sitManager: publicSite(updatedSite).sitManager,
      projectId: updatedSite.projectId,
      manager: visiblePerson(updatedSite.manager),
      project: updatedSite.project,
      attendanceCount: updatedSite._count?.attendances || 0,
      createdAt: updatedSite.createdAt,
      updatedAt: updatedSite.updatedAt,
    };

    invalidateWarehouseOptions();
    return successResponse(formatted, 'Site updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update site');
  }
});

const siteActive = setActiveHandler(prisma.site, 'Site');
export const PATCH = siteActive;
export const DELETE = siteActive;
