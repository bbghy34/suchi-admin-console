import { workforceEmployeeWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { excludedStaffCounts } from '@/lib/excluded-staff';
import { isExcludedStaffRole, visiblePerson } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/departments/[id]
 * Returns single department with employee count and HOD details.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            projects: true,
          },
        },
      },
    });

    if (!department) {
      return notFound('Department not found.');
    }

    // Retrieve HOD details if configured
    let hodEmployee = null;
    if (department.HOD) {
      hodEmployee = await prisma.employee.findUnique({
        where: workforceEmployeeWhere({ id: department.HOD }),
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          employeeCode: true,
          role: true,
        },
      });
      if (isExcludedStaffRole(hodEmployee?.role)) hodEmployee = null;
    }

    const excludedByDept = await excludedStaffCounts(prisma, 'deptId');
    const formatted = {
      id: department.id,
      name: department.name,
      description: department.description,
      HOD: hodEmployee ? department.HOD : null,
      hod: visiblePerson(hodEmployee),
      employeeCount: Math.max(0, department._count.employees - (excludedByDept.get(department.id) || 0)),
      projectCount: department._count.projects,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };

    return successResponse(formatted, 'Department details retrieved');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve department');
  }
});

/**
 * PUT /api/departments/[id]
 * Updates department fields: name, description, HOD.
 * Validates:
 * - Department exists
 * - name uniqueness (if changed)
 * - HOD employee existence (if provided)
 * Authenticated: ADMIN ('A') only.
 */
export const PUT = requireRoles(['A'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingDept = await prisma.department.findUnique({
      where: { id },
    });

    if (!existingDept) {
      return errorResponse('Department not found.', 404);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // Validate name update
    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        return errorResponse('Department name cannot be empty.', 400);
      }

      // Check name uniqueness if different from current
      if (trimmedName.toLowerCase() !== existingDept.name.toLowerCase()) {
        const nameConflict = await prisma.department.findFirst({
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
            `Another department named "${trimmedName}" already exists.`
          );
        }
      }

      updateData.name = trimmedName;
    }

    // Description update
    if (body.description !== undefined) {
      updateData.description = body.description ? body.description.trim() : null;
    }

    // Validate HOD update
    let hodEmployee = null;
    if (body.HOD !== undefined) {
      const trimmedHOD = body.HOD ? body.HOD.trim() : null;

      if (trimmedHOD) {
        hodEmployee = await prisma.employee.findUnique({
          where: workforceEmployeeWhere({ id: trimmedHOD }),
          select: {
            id: true,
            name: true,
            email: true,
            employeeCode: true,
            role: true,
          },
        });

        if (!hodEmployee || isExcludedStaffRole(hodEmployee.role)) {
          return errorResponse(
            `HOD employee with ID "${trimmedHOD}" was not found.`,
            400
          );
        }
        updateData.HOD = trimmedHOD;
      } else {
        updateData.HOD = null;
      }
    }

    const updatedDepartment = await prisma.department.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            employees: true,
            projects: true,
          },
        },
      },
    });

    // If HOD was not updated in this request, fetch existing HOD details for response
    if (body.HOD === undefined && updatedDepartment.HOD) {
      hodEmployee = await prisma.employee.findUnique({
        where: { id: updatedDepartment.HOD },
        select: {
          id: true,
          name: true,
          email: true,
          employeeCode: true,
          role: true,
        },
      });
      if (isExcludedStaffRole(hodEmployee?.role)) hodEmployee = null;
    }

    const excludedByDept = await excludedStaffCounts(prisma, 'deptId');
    const formatted = {
      id: updatedDepartment.id,
      name: updatedDepartment.name,
      description: updatedDepartment.description,
      HOD: hodEmployee ? updatedDepartment.HOD : null,
      hod: visiblePerson(hodEmployee),
      employeeCount: Math.max(0, updatedDepartment._count.employees - (excludedByDept.get(updatedDepartment.id) || 0)),
      projectCount: updatedDepartment._count.projects,
      createdAt: updatedDepartment.createdAt,
      updatedAt: updatedDepartment.updatedAt,
    };

    return successResponse(formatted, 'Department updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update department');
  }
});

const departmentActive = setActiveHandler(prisma.department, 'Department');
export const PATCH = departmentActive;
export const DELETE = departmentActive;
