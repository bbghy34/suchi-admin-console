import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles, hashPassword, sanitizeEmployee, ROLES } from '@/lib/auth';
import { passwordProblem } from '@/lib/password-policy.mjs';
import { successResponse as baseSuccessResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { normalizeResourceUrl } from '@/lib/security';
import { employeeDirectoryWhere } from '@/lib/luit-admin/privacy.mjs';
import { isAssignableRole } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/employees
 * Query parameters supported:
 * - ?page=1
 * - &limit=20
 * - &department=deptId
 * - &designation=designationId
 * - &status=true|false|ACTIVE|INACTIVE
 * - &role=A|M|E
 * - &search=keyword
 *
 * Includes:
 * - Department
 * - Designation
 * - Site information
 *
 * Never returns passwordHash.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const departmentFilter = searchParams.get('department');
    const designationFilter = searchParams.get('designation');
    const statusFilter = searchParams.get('status');
    const roleFilter = searchParams.get('role');
    const searchFilter = searchParams.get('search');

    const where = {};

    if (departmentFilter) {
      where.deptId = departmentFilter;
    }

    if (designationFilter) {
      where.designationId = designationFilter;
    }

    if (roleFilter) {
      where.role = roleFilter;
    }

    const normalizedStatus = (statusFilter || '').trim().toLowerCase();
    const inactiveOnly = normalizedStatus === 'false' || normalizedStatus === 'inactive';
    const activeOnly = normalizedStatus === 'true' || normalizedStatus === 'active';

    if (inactiveOnly && user?.role === 'A') {
      where.status = false;
    } else if (!activeOnly && !inactiveOnly && user?.role === 'A') {
      // All Statuses: include active and inactive employees.
    } else {
      where.NOT = { status: false };
    }

    if (searchFilter) {
      const q = searchFilter.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { employeeCode: { contains: q, mode: 'insensitive' } },
        // phone is now BigInt — cannot use string 'contains'
      ];
    }

    const directoryWhere = employeeDirectoryWhere(where);
    const [total, employees] = await Promise.all([
      prisma.employee.count({ where: directoryWhere }),
      prisma.employee.findMany({
        where: directoryWhere,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          department: true,
          designation: true,
          managedSites: true,
        },
      }),
    ]);

    // Batch resolve assigned site information via siteId
    const siteIds = [...new Set(employees.map((e) => e.siteId).filter(Boolean))];
    let siteMap = {};

    if (siteIds.length > 0) {
      const sites = await prisma.site.findMany({
        where: { id: { in: siteIds } },
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
          projectId: true,
        },
      });
      siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));
    }

    // Format employees and strictly sanitize passwordHash
    const formattedEmployees = employees.map((emp) => {
      const safe = sanitizeEmployee(emp);
      return {
        ...safe,
        site: emp.siteId ? siteMap[emp.siteId] || null : null,
      };
    });

    const response = await successResponse(
      formattedEmployees,
      'Employees retrieved successfully'
    );

    // Attach pagination metadata in response
    const jsonBody = await response.json();
    jsonBody.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return Response.json(jsonBody, { status: 200 });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve employees');
  }
});

/**
 * POST /api/employees
 * Validations:
 * - employeeCode (required, unique)
 * - email (required, unique)
 * - name (required)
 * - deptId (required, must exist)
 * - designationId (required, must exist)
 * - joinDate (required, valid date)
 * - password (required, hashed using bcrypt)
 * - role (required, must be 'A', 'M', or 'AA')
 *
 * Checks duplicates for email and employeeCode.
 * Never stores plain text password.
 * Never returns passwordHash.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const {
      employeeCode,
      email,
      name,
      deptId,
      designationId,
      joinDate,
      password,
      role,
      phone,
      dob,
      gender,
      address,
      profileImageUrl,
      siteId,
      bankDetails,
      pan,
      aadhar,
      uan,
      emergencyNo,
      status,
    } = body;

    // Managers can create Manager accounts. Admin and Accountant accounts stay admin-only.
    if (user.role === ROLES.MANAGER && role && role.trim().toUpperCase() !== ROLES.MANAGER) {
      return errorResponse(
        'Managers are only permitted to create Manager accounts. Only Admins can create Admin or Accountant accounts.',
        403
      );
    }

    // 1. Validate required fields
    const missing = [];
    if (!employeeCode || !employeeCode.trim()) missing.push('employeeCode');
    if (!email || !email.trim()) missing.push('email');
    if (!name || !name.trim()) missing.push('name');
    if (!deptId || !deptId.trim()) missing.push('deptId');
    if (!designationId || !designationId.trim()) missing.push('designationId');
    if (!joinDate) missing.push('joinDate');
    if (!password) missing.push('password');
    if (!role || !role.trim()) missing.push('role');

    if (missing.length > 0) {
      return errorResponse(
        `Missing required fields: ${missing.join(', ')}`,
        400
      );
    }

    const normalizedCode = employeeCode.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRole = role.trim().toUpperCase();

    // 2. Validate role
    if (!isAssignableRole(normalizedRole)) {
      return errorResponse(
        `Invalid role "${role}". Allowed roles are: A (Admin), AA (Accountant), M (Manager).`,
        400
      );
    }

    const passwordIssue = passwordProblem(password);
    if (passwordIssue) return errorResponse(passwordIssue, 400);

    const imageUrl = normalizeResourceUrl(profileImageUrl);
    if (!imageUrl.ok) {
      return errorResponse('Profile image URL must be an http(s) link.', 400);
    }

    // 3. Check duplicate employeeCode
    const existingCode = await prisma.employee.findFirst({
      where: {
        employeeCode: {
          equals: normalizedCode,
          mode: 'insensitive',
        },
      },
    });

    if (existingCode) {
      return conflict(
        `An employee with code "${normalizedCode}" already exists.`
      );
    }

    // 4. Check duplicate email
    const existingEmail = await prisma.employee.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });

    if (existingEmail) {
      return conflict(
        `An employee with email "${normalizedEmail}" already exists.`
      );
    }

    // 5. Verify deptId exists
    const department = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!department) {
      return errorResponse(`Department with ID "${deptId}" not found.`, 400);
    }

    // 6. Verify designationId exists
    const designation = await prisma.designation.findUnique({
      where: { id: designationId },
    });

    if (!designation) {
      return errorResponse(
        `Designation with ID "${designationId}" not found.`,
        400
      );
    }

    // 7. Hash password using bcrypt
    const passwordHash = await hashPassword(password);

    // 8. Safely parse and normalize bankDetails JSON
    let parsedBankDetails = null;
    if (bankDetails) {
      if (typeof bankDetails === 'object') {
        parsedBankDetails = bankDetails;
      } else if (typeof bankDetails === 'string') {
        try {
          parsedBankDetails = JSON.parse(bankDetails);
        } catch {
          parsedBankDetails = bankDetails.trim() ? { raw: bankDetails.trim() } : null;
        }
      }
    } else if (body.bankName || body.accountNumber || body.ifscCode || body.branchName) {
      parsedBankDetails = {
        bankName: body.bankName?.trim() || '',
        accountNumber: body.accountNumber?.trim() || '',
        ifscCode: body.ifscCode?.trim()?.toUpperCase() || '',
        branchName: body.branchName?.trim() || '',
      };
    }

    // 9. Create employee record
    const newEmployee = await prisma.employee.create({
      data: {
        employeeCode: normalizedCode,
        email: normalizedEmail,
        name: name.trim(),
        deptId: department.id,
        designationId: designation.id,
        joinDate: new Date(joinDate),
        passwordHash,
        role: normalizedRole,
        status: status !== undefined ? (String(status) === 'false' ? false : true) : true,
        phone: phone ? BigInt(String(phone).replace(/\D/g, '') || '0') : null,
        dob: dob ? new Date(dob) : null,
        gender: gender ? gender.trim() : null,
        address: address ? address.trim() : null,
        profileImageUrl: imageUrl.url,
        siteId: siteId ? siteId.trim() : null,
        firmId: body.firmId ? body.firmId.trim() : null,
        bankDetails: parsedBankDetails,
        pan: pan ? pan.trim() : null,
        aadhar: aadhar ? BigInt(String(aadhar).replace(/\D/g, '') || '0') : null,
        uan: uan ? uan.trim() : null,
        emergencyNo: emergencyNo ? BigInt(String(emergencyNo).replace(/\D/g, '') || '0') : null,
        createdBy: body.createdBy ? body.createdBy.trim() : null,
        updatedBy: body.updatedBy ? body.updatedBy.trim() : null,
      },
      include: {
        department: true,
        designation: true,
      },
    });

    // 9. Sanitize response - NEVER return passwordHash
    const safeEmployee = sanitizeEmployee(newEmployee);

    return successResponse(safeEmployee, 'Employee created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create employee');
  }
});
