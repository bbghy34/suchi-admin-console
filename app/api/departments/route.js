import { workforceEmployeeWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { onlyActive } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { excludedStaffCounts } from '@/lib/excluded-staff';
import { isExcludedStaffRole, visiblePerson } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/departments
 * Returns all departments with employee counts and HOD information.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const [departments, excludedByDept] = await Promise.all([
      prisma.department.findMany({
        where: onlyActive({}, searchParams, user),
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              employees: true,
              projects: true,
            },
          },
        },
      }),
      excludedStaffCounts(prisma, 'deptId'),
    ]);

    // Extract unique HOD IDs to batch query employee information
    const hodIds = [
      ...new Set(departments.map((d) => d.HOD).filter(Boolean)),
    ];

    let hodMap = {};
    if (hodIds.length > 0) {
      const hodEmployees = await prisma.employee.findMany({
        where: { id: { in: hodIds } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          employeeCode: true,
          role: true,
        },
      });

      hodMap = Object.fromEntries(hodEmployees.map((e) => [e.id, e]));
    }

    // Format output with employee count and HOD information
    const formatted = departments.map((dept) => {
      const hod = visiblePerson(dept.HOD ? hodMap[dept.HOD] || null : null);
      return {
      id: dept.id,
      name: dept.name,
      description: dept.description,
      HOD: hod ? dept.HOD : null,
      hod,
      employeeCount: Math.max(0, dept._count.employees - (excludedByDept.get(dept.id) || 0)),
      projectCount: dept._count.projects,
      isActive: dept.isActive,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
      };
    });

    return successResponse(formatted, 'Departments retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve departments');
  }
});

/**
 * POST /api/departments
 * Create a new department.
 * Required: name
 * Optional: description, HOD
 * Validations:
 * - name must be unique
 * - HOD employee must exist if provided
 * Authenticated: ADMIN ('A') only.
 */
export const POST = requireRoles(['A'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.name || !body.name.trim()) {
      return errorResponse('Department name is required.', 400);
    }

    const name = body.name.trim();
    const description = body.description ? body.description.trim() : null;
    const HOD = body.HOD ? body.HOD.trim() : null;

    // Validate: name must be unique (case-insensitive)
    const existing = await prisma.department.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return conflict(`A department named "${name}" already exists.`);
    }

    // Validate: HOD employee must exist if provided
    let hodEmployee = null;
    if (HOD) {
      hodEmployee = await prisma.employee.findUnique({
        where: workforceEmployeeWhere({ id: HOD }),
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
          `HOD employee with ID "${HOD}" was not found. Please provide a valid employee ID.`,
          400
        );
      }
    }

    // Create department
    const newDepartment = await prisma.department.create({
      data: {
        name,
        description,
        HOD,
      },
    });

    const responseData = {
      ...newDepartment,
      hod: visiblePerson(hodEmployee),
      employeeCount: 0,
      projectCount: 0,
    };

    return successResponse(responseData, 'Department created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create department');
  }
});
