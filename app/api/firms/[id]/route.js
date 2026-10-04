import { workforceEmployeeWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { isExcludedStaffRole, LUIT_ADMIN_ROLE, TENDER_ROLE } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/firms/[id]
 * Returns firm detail + employees + projects.
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;

    const firm = await prisma.firm.findUnique({
      where: { id },
      include: {
        employees: {
          select: { id: true, name: true, employeeCode: true, role: true, status: true },
          where: { NOT: { role: { in: [LUIT_ADMIN_ROLE, TENDER_ROLE] } } },
          orderBy: { name: 'asc' },
        },
        projects: {
          select: { id: true, name: true, status: true, progress: true, startDate: true, endDate: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { employees: { where: workforceEmployeeWhere() }, projects: true } },
      },
    });

    if (!firm) return notFound('Firm not found.');

    const employees = (firm.employees || []).filter((person) => !isExcludedStaffRole(person.role));

    return successResponse(
      {
        id:             firm.id,
        name:           firm.name,
        gstNo:          firm.gstNo,
        address:        firm.address,
        proprietorName: firm.proprietorName,
        phoneNo:        firm.phoneNo,
        createdBy:      firm.createdBy,
        updatedBy:      firm.updatedBy,
        employeeCount:  employees.length,
        projectCount:   firm._count?.projects  ?? 0,
        employees,
        projects:       firm.projects,
        createdAt:      firm.createdAt,
        updatedAt:      firm.updatedAt,
      },
      'Firm details retrieved successfully'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve firm');
  }
});

/**
 * PUT /api/firms/[id]
 * Update firm fields. Admin only.
 */
export const PUT = requireRoles(['A'])(async (request, { params }) => {
  try {
    const { id } = await params;

    const existing = await prisma.firm.findUnique({ where: { id } });
    if (!existing) return errorResponse('Firm not found.', 404);

    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request payload is required.', 400);

    const updateData = {};

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) return errorResponse('Firm name cannot be empty.', 400);

      if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
        const nameConflict = await prisma.firm.findFirst({
          where: { name: { equals: trimmedName, mode: 'insensitive' }, id: { not: id } },
        });
        if (nameConflict) return conflict(`Another firm named "${trimmedName}" already exists.`);
      }
      updateData.name = trimmedName;
    }

    if (body.gstNo !== undefined) {
      const trimmedGst = body.gstNo ? body.gstNo.trim().toUpperCase() : null;
      if (trimmedGst && trimmedGst !== existing.gstNo) {
        const gstConflict = await prisma.firm.findFirst({
          where: { gstNo: trimmedGst, id: { not: id } },
        });
        if (gstConflict) return conflict(`GST No "${trimmedGst}" is already registered.`);
      }
      updateData.gstNo = trimmedGst;
    }

    if (body.address        !== undefined) updateData.address        = body.address        ? body.address.trim()        : null;
    if (body.proprietorName !== undefined) updateData.proprietorName = body.proprietorName ? body.proprietorName.trim() : null;
    if (body.phoneNo        !== undefined) updateData.phoneNo        = body.phoneNo        ? body.phoneNo.trim()        : null;
    if (body.updatedBy      !== undefined) updateData.updatedBy      = body.updatedBy      ? body.updatedBy.trim()      : null;

    const updated = await prisma.firm.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { employees: { where: workforceEmployeeWhere() }, projects: true } } },
    });

    return successResponse(
      {
        id:             updated.id,
        name:           updated.name,
        gstNo:          updated.gstNo,
        address:        updated.address,
        proprietorName: updated.proprietorName,
        phoneNo:        updated.phoneNo,
        createdBy:      updated.createdBy,
        updatedBy:      updated.updatedBy,
        employeeCount:  updated._count?.employees ?? 0,
        projectCount:   updated._count?.projects  ?? 0,
        createdAt:      updated.createdAt,
        updatedAt:      updated.updatedAt,
      },
      'Firm updated successfully'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to update firm');
  }
});

const firmActive = setActiveHandler(prisma.firm, 'Firm');
export const PATCH = firmActive;
export const DELETE = firmActive;
