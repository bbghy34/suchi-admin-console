import { workforceEmployeeWhere, workforceRecordWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, getAuthenticatedUser } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, badRequest, unauthorized, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/leaves
 * Rules:
 * - Employees (role 'E') can only see their own leave requests.
 * - Managers/Admins ('M'/'A') can see all relevant leave requests.
 *
 * Query parameters supported:
 * - ?page=1
 * - &limit=10 (or &limit=all)
 * - &employeeId=... (Managers/Admins only)
 * - &status=PENDING|APPROVED|REJECTED
 * - &date=YYYY-MM-DD
 * - &startDate=YYYY-MM-DD
 * - &endDate=YYYY-MM-DD
 * - &search=... (matches reason, employee name, employee code)
 *
 * Authenticated.
 */
export const GET = requireAuth(async (request) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorized('User session not found.');
    }

    const { searchParams } = new URL(request.url);

    const isDropdown = searchParams.get('dropdown') === 'true' || searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = isDropdown ? 1000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = isDropdown ? 0 : (page - 1) * limit;

    const employeeIdFilter = searchParams.get('employeeId');
    const statusFilter = searchParams.get('status');
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const searchParam = searchParams.get('search');

    const where = { ...workforceRecordWhere() };

    // 1. Role Scoping Rule:
    // Employees can ONLY see their own leave requests
    if (user.role === 'E') {
      where.employeeId = user.id;
    } else if (employeeIdFilter && employeeIdFilter.trim()) {
      // Managers and Admins can filter by specific employee
      where.employeeId = employeeIdFilter.trim();
    }

    // 2. Status Filter: PENDING (null), APPROVED (true), REJECTED (false)
    if (statusFilter && statusFilter.trim()) {
      const st = statusFilter.trim().toUpperCase();
      if (st === 'PENDING') {
        where.approved = null;
      } else if (st === 'APPROVED') {
        where.approved = true;
      } else if (st === 'REJECTED') {
        where.approved = false;
      }
    }

    // 3. Date / Range Filters
    if (dateParam && dateParam.trim()) {
      const dayStart = new Date(`${dateParam.trim()}T00:00:00.000Z`);
      const dayEnd = new Date(`${dateParam.trim()}T23:59:59.999Z`);
      if (!isNaN(dayStart.getTime()) && !isNaN(dayEnd.getTime())) {
        where.leaveDate = {
          gte: dayStart,
          lte: dayEnd,
        };
      }
    } else if (startDateParam || endDateParam) {
      where.leaveDate = {};
      if (startDateParam && startDateParam.trim()) {
        const s = new Date(`${startDateParam.trim()}T00:00:00.000Z`);
        if (!isNaN(s.getTime())) where.leaveDate.gte = s;
      }
      if (endDateParam && endDateParam.trim()) {
        const e = new Date(`${endDateParam.trim()}T23:59:59.999Z`);
        if (!isNaN(e.getTime())) where.leaveDate.lte = e;
      }
    }

    // 4. Search Filter
    if (searchParam && searchParam.trim()) {
      const q = searchParam.trim();
      where.OR = [
        { reason: { contains: q, mode: 'insensitive' } },
        { employee: { name: { contains: q, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    // Execute count and query concurrently
    const [total, leaves] = await Promise.all([
      prisma.leave.count({ where }),
      prisma.leave.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              email: true,
              phone: true,
              role: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
              designation: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedLeaves = leaves.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      reason: l.reason,
      leaveDate: l.leaveDate,
      duration: l.duration ?? 1,
      approved: l.approved,
      status: l.approved === true ? 'APPROVED' : l.approved === false ? 'REJECTED' : 'PENDING',
      employee: l.employee,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));

    if (isDropdown) {
      return successResponse(formattedLeaves, 'Leave requests retrieved successfully');
    }

    return successResponse(
      formattedLeaves,
      'Leave requests retrieved successfully',
      200,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      }
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve leave requests');
  }
});

/**
 * POST /api/leaves
 * Rules:
 * - Employees can request leave (bound to their own employeeId).
 * - Managers/Admins can request leave for themselves or on behalf of an employee.
 * - Initial status is PENDING (approved: null).
 *
 * Fields:
 * - employeeId (optional if Employee, required/optional if Manager/Admin)
 * - reason (required string)
 * - leaveDate (required Date)
 * - duration (optional float, default 1)
 *
 * Authenticated.
 */
export const POST = requireAuth(async (request) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorized('User session not found.');
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return badRequest('Request payload is required.');
    }

    const { employeeId, reason, leaveDate, duration } = body;

    // 1. Determine Target Employee ID based on Role
    let targetEmployeeId = user.id;
    if (user.role === 'A' || user.role === 'M') {
      if (employeeId && String(employeeId).trim()) {
        const empExists = await prisma.employee.findUnique({
          where: workforceEmployeeWhere({ id: String(employeeId).trim() }),
          select: { id: true, name: true },
        });
        if (!empExists) {
          return badRequest(`Employee with ID "${employeeId}" not found.`);
        }
        targetEmployeeId = empExists.id;
      }
    }

    const targetEmployee = await prisma.employee.findUnique({ where: workforceEmployeeWhere({ id: targetEmployeeId }), select: { id: true } });
    if (!targetEmployee) return badRequest('Employee not found.');

    // 2. Validate Reason
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return badRequest('Reason for leave is required.');
    }

    // 3. Validate Leave Date
    if (!leaveDate) {
      return badRequest('Leave date is required.');
    }

    const parsedLeaveDate = new Date(leaveDate);
    if (isNaN(parsedLeaveDate.getTime())) {
      return badRequest('Invalid leaveDate date format.');
    }

    // 4. Validate Duration
    let parsedDuration = 1;
    if (duration !== undefined && duration !== null && duration !== '') {
      const d = parseFloat(duration);
      if (isNaN(d) || d <= 0) {
        return badRequest('Duration must be a positive number of days (e.g. 1 or 0.5).');
      }
      parsedDuration = d;
    }

    // 5. Create Leave Request (Default approved: null for Pending)
    const newLeave = await prisma.leave.create({
      data: {
        employeeId: targetEmployeeId,
        reason: reason.trim(),
        leaveDate: parsedLeaveDate,
        duration: parsedDuration,
        approved: null, // Pending status
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const formatted = {
      id: newLeave.id,
      employeeId: newLeave.employeeId,
      reason: newLeave.reason,
      leaveDate: newLeave.leaveDate,
      duration: newLeave.duration,
      approved: newLeave.approved,
      status: 'PENDING',
      employee: newLeave.employee,
      createdAt: newLeave.createdAt,
      updatedAt: newLeave.updatedAt,
    };

    return successResponse(formatted, 'Leave request submitted successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to submit leave request');
  }
});

