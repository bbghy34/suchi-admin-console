import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireRoles, hashPassword, sanitizeEmployee, filterAllowedEmployeeUpdates, invalidateSession, ROLES } from '@/lib/auth';
import { passwordProblem } from '@/lib/password-policy.mjs';
import { successResponse as baseSuccessResponse, errorResponse, notFound, forbidden, conflict, handleApiError } from '@/lib/api-response';
import { normalizeResourceUrl } from '@/lib/security';
import { employeeDirectoryWhere } from '@/lib/luit-admin/privacy.mjs';
import { isAssignableRole, isExcludedStaffRole, publicRole } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/employees/[id]
 * Retrieves full employee profile including:
 * - Department
 * - Designation
 * - Site information
 * - Managed sites
 *
 * Never returns passwordHash.
 * Authenticated:
 * - Admins and Managers: can view any employee profile.
 * - Employees: can ONLY view their own profile (id === user.id).
 */
export const GET = requireAuth(async (request, { params, user }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Permissions check: Employees can only view their own profile
    if (user.role === ROLES.EMPLOYEE && user.id !== id) {
      return forbidden('Access denied. Employees are only permitted to view their own profile.');
    }

    const employee = await prisma.employee.findFirst({
      where: user.id === id ? { id } : employeeDirectoryWhere({ id }),
      include: {
        department: true,
        designation: true,
        managedSites: true,
      },
    });

    if (!employee || (isExcludedStaffRole(employee.role) && user.id !== employee.id)) {
      return notFound('Employee not found.');
    }

    // Resolve site if siteId is present
    let site = null;
    if (employee.siteId) {
      site = await prisma.site.findUnique({
        where: { id: employee.siteId },
      });
    }

    const safeEmployee = {
      ...sanitizeEmployee(employee),
      role: publicRole(employee.role),
      site,
    };
    delete safeEmployee.accountRole;

    return successResponse(safeEmployee, 'Employee retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve employee');
  }
});

/**
 * PUT /api/employees/[id]
 * Allows profile updates:
 * - Admins: full access to update any profile.
 * - Managers: can update employee details, but cannot elevate role to Admin.
 * - Employees: can ONLY update their own personal contact details (phone, address, emergency contact, bank details).
 *
 * Rules:
 * - Do NOT allow direct passwordHash modification.
 * - If a new 'password' is submitted, it is securely hashed with bcrypt.
 * - Never returns passwordHash.
 * Authenticated.
 */
export const PUT = requireAuth(async (request, { params, user }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Permissions check: Employees can ONLY update their own profile
    if (user.role === ROLES.EMPLOYEE && user.id !== id) {
      return errorResponse('Access denied. Employees are only permitted to update their own profile.', 403);
    }

    const existingEmployee = await prisma.employee.findFirst({
      where: user.id === id ? { id } : employeeDirectoryWhere({ id }),
    });

    if (!existingEmployee || (isExcludedStaffRole(existingEmployee.role) && user.id !== id)) {
      return errorResponse('Employee not found.', 404);
    }

    // Permissions check: Managers cannot edit Admin accounts
    if (user.role === ROLES.MANAGER && (existingEmployee.role === ROLES.ADMIN || existingEmployee.role === ROLES.ACCOUNTANT)) {
      return errorResponse('Managers are not permitted to modify Administrator or Accountant profiles.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }
    if (isExcludedStaffRole(existingEmployee.role)) {
      delete body.role;
    }

    // Role-based field filtering:
    const filterResult = filterAllowedEmployeeUpdates(user.role, body);
    if (filterResult.error) {
      return errorResponse(filterResult.error, 403);
    }

    const updateData = {};

    // 1. Direct passwordHash modification is strictly forbidden
    if ('passwordHash' in body) {
      delete body.passwordHash;
    }

    // 2. Password resets are an administrative action, never a self-service bypass.
    if (body.password) {
      if (user.role === ROLES.EMPLOYEE || user.id === id) {
        return errorResponse('Use the change-password endpoint to update your own password.', 403);
      }
      if (
        user.role === ROLES.MANAGER &&
        existingEmployee.role !== ROLES.MANAGER &&
        existingEmployee.role !== ROLES.EMPLOYEE
      ) {
        return errorResponse('Managers can only reset passwords for manager accounts.', 403);
      }
      const problem = passwordProblem(body.password);
      if (problem) return errorResponse(problem, 400);
      updateData.passwordHash = await hashPassword(body.password);
    }

    // 3. Employee Code update check
    if (body.employeeCode !== undefined) {
      const trimmedCode = body.employeeCode.trim();
      if (!trimmedCode) {
        return errorResponse('Employee code cannot be empty.', 400);
      }

      if (trimmedCode.toLowerCase() !== existingEmployee.employeeCode?.toLowerCase()) {
        const codeConflict = await prisma.employee.findFirst({
          where: {
            employeeCode: {
              equals: trimmedCode,
              mode: 'insensitive',
            },
            id: { not: id },
          },
        });

        if (codeConflict) {
          return errorResponse(
            `Another employee with code "${trimmedCode}" already exists.`,
            400
          );
        }
      }
      updateData.employeeCode = trimmedCode;
    }

    // 4. Email update check
    if (body.email !== undefined) {
      const trimmedEmail = body.email.trim().toLowerCase();
      if (!trimmedEmail) {
        return errorResponse('Email cannot be empty.', 400);
      }

      if (trimmedEmail !== existingEmployee.email?.toLowerCase()) {
        const emailConflict = await prisma.employee.findFirst({
          where: {
            email: {
              equals: trimmedEmail,
              mode: 'insensitive',
            },
            id: { not: id },
          },
        });

        if (emailConflict) {
          return errorResponse(
            `Another employee with email "${trimmedEmail}" already exists.`,
            400
          );
        }
      }
      updateData.email = trimmedEmail;
    }

    // 5. Department check if updated
    if (body.deptId !== undefined) {
      if (body.deptId) {
        const dept = await prisma.department.findUnique({
          where: { id: body.deptId },
        });
        if (!dept) {
          return errorResponse(`Department with ID "${body.deptId}" not found.`, 400);
        }
        updateData.deptId = body.deptId;
      } else {
        updateData.deptId = null;
      }
    }

    // 6. Designation check if updated
    if (body.designationId !== undefined) {
      if (body.designationId) {
        const desig = await prisma.designation.findUnique({
          where: { id: body.designationId },
        });
        if (!desig) {
          return errorResponse(`Designation with ID "${body.designationId}" not found.`, 400);
        }
        updateData.designationId = body.designationId;
      } else {
        updateData.designationId = null;
      }
    }

    // 7. Role check if updated
    if (body.role !== undefined) {
      const normalizedRole = body.role.trim().toUpperCase();
      if (!isAssignableRole(normalizedRole)) {
        return errorResponse(
          `Invalid role "${body.role}". Allowed roles: A (Admin), AA (Accountant), M (Manager).`,
          400
        );
      }
      updateData.role = normalizedRole;
    }

    // 8. Profile fields
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.phone !== undefined) {
      if (body.phone === null || body.phone === '') {
        updateData.phone = null;
      } else {
        const digits = String(body.phone).replace(/\D/g, '');
        updateData.phone = digits ? BigInt(digits) : null;
      }
    }
    if (body.status !== undefined) {
      if (user.role !== 'A') {
        return forbidden('Only an administrator can activate or deactivate an employee.');
      }
      updateData.status = String(body.status) === 'false' ? false : true;
    }
    if (body.gender !== undefined) updateData.gender = body.gender ? body.gender.trim() : null;
    if (body.address !== undefined) updateData.address = body.address ? body.address.trim() : null;
    if (body.profileImageUrl !== undefined) {
      const imageUrl = normalizeResourceUrl(body.profileImageUrl);
      if (!imageUrl.ok) {
        return errorResponse('Profile image URL must be an http(s) link.', 400);
      }
      updateData.profileImageUrl = imageUrl.url;
    }
    if (body.siteId !== undefined) updateData.siteId = body.siteId ? body.siteId.trim() : null;
    if (body.firmId !== undefined) updateData.firmId = body.firmId ? body.firmId.trim() : null;
    if (body.bankDetails !== undefined) {
      let parsedBankDetails = null;
      if (body.bankDetails) {
        if (typeof body.bankDetails === 'object') {
          parsedBankDetails = body.bankDetails;
        } else if (typeof body.bankDetails === 'string') {
          try {
            parsedBankDetails = JSON.parse(body.bankDetails);
          } catch {
            parsedBankDetails = body.bankDetails.trim() ? { raw: body.bankDetails.trim() } : null;
          }
        }
      }
      updateData.bankDetails = parsedBankDetails;
    } else if (body.bankName !== undefined || body.accountNumber !== undefined || body.ifscCode !== undefined || body.branchName !== undefined) {
      updateData.bankDetails = {
        bankName: body.bankName?.trim() || '',
        accountNumber: body.accountNumber?.trim() || '',
        ifscCode: body.ifscCode?.trim()?.toUpperCase() || '',
        branchName: body.branchName?.trim() || '',
      };
    }
    if (body.pan !== undefined) updateData.pan = body.pan ? body.pan.trim() : null;
    if (body.aadhar !== undefined) {
      if (body.aadhar === null || body.aadhar === '') {
        updateData.aadhar = null;
      } else {
        const digits = String(body.aadhar).replace(/\D/g, '');
        updateData.aadhar = digits ? BigInt(digits) : null;
      }
    }
    if (body.uan !== undefined) updateData.uan = body.uan ? body.uan.trim() : null;
    if (body.emergencyNo !== undefined) {
      if (body.emergencyNo === null || body.emergencyNo === '') {
        updateData.emergencyNo = null;
      } else {
        const digits = String(body.emergencyNo).replace(/\D/g, '');
        updateData.emergencyNo = digits ? BigInt(digits) : null;
      }
    }
    if (body.joinDate !== undefined) updateData.joinDate = body.joinDate ? new Date(body.joinDate) : null;
    if (body.dob !== undefined) updateData.dob = body.dob ? new Date(body.dob) : null;
    if (body.createdBy !== undefined) updateData.createdBy = body.createdBy ? body.createdBy.trim() : null;
    // Always store the ID of the user performing the update
    updateData.updatedBy = user?.id || (body.updatedBy ? body.updatedBy.trim() : null);

    const updatedEmployee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: true,
        designation: true,
      },
    });
    invalidateSession(id);

    const safeEmployee = { ...sanitizeEmployee(updatedEmployee), role: publicRole(updatedEmployee.role) };
    delete safeEmployee.accountRole;
    return successResponse(safeEmployee, 'Employee profile updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update employee');
  }
});

/**
 * DELETE /api/employees/[id]
 * Admin only.
 * Rules:
 * - "Prefer setting status=false instead of deleting the employee."
 * - By default: Soft-deletes employee by setting status = 'false'.
 * - If ?permanent=true is provided by Admin, checks foreign key dependencies
 *   (managed sites, HOD in department, attendance, leaves) before deleting.
 * - Never returns passwordHash.
 */
export const DELETE = requireRoles(['A'])(async (request, { params, user }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const employee = await prisma.employee.findFirst({
      where: employeeDirectoryWhere({ id }),
    });

    if (!employee || isExcludedStaffRole(employee.role)) {
      return notFound('Employee not found.');
    }

    const softDeleted = await prisma.employee.update({
      where: { id },
      data: {
        status: false,
        updatedBy: user?.id || null,
      },
      include: {
        department: true,
        designation: true,
      },
    });
    invalidateSession(id);

    const safe = sanitizeEmployee(softDeleted);
    return successResponse(
      safe,
      `Employee "${employee.name}" deactivated successfully. The record was kept.`
    );
  } catch (error) {
    return handleApiError(error, 'Failed to delete employee');
  }
});
