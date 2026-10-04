import { workforceRecordWhere, workforceRecordDelegate } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, getAuthenticatedUser } from '@/lib/auth';
import { successResponse as baseSuccessResponse, badRequest, unauthorized, forbidden, notFound, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/leaves/[id]
 * Rules:
 * - Employees can only see their own leave requests.
 * - Managers/Admins can see all leave requests.
 *
 * Authenticated.
 */
export const GET = requireAuth(async (request, { params }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorized('User session not found.');
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const leave = await prisma.leave.findUnique({
      where: { id, ...workforceRecordWhere() },
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
    });

    if (!leave) {
      return notFound('Leave request not found.');
    }

    // Role Scoping Rule: Employees can only view their own request
    if (user.role === 'E' && leave.employeeId !== user.id) {
      return forbidden('Access denied. You can only view your own leave requests.');
    }

    const formatted = {
      id: leave.id,
      employeeId: leave.employeeId,
      reason: leave.reason,
      leaveDate: leave.leaveDate,
      duration: leave.duration ?? 1,
      approved: leave.approved,
      status: leave.approved === true ? 'APPROVED' : leave.approved === false ? 'REJECTED' : 'PENDING',
      employee: leave.employee,
      createdAt: leave.createdAt,
      updatedAt: leave.updatedAt,
    };

    return successResponse(formatted, 'Leave details retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve leave request');
  }
});

/**
 * PUT /api/leaves/[id]
 * Rules:
 * - Managers/Admins can approve (approved: true) or reject (approved: false).
 * - Employees CANNOT approve or reject leave requests.
 * - Employees can update their own PENDING requests (reason, leaveDate, duration).
 *
 * Authenticated.
 */
export const PUT = requireAuth(async (request, { params }) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorized('User session not found.');
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingLeave = await prisma.leave.findUnique({
      where: { id, ...workforceRecordWhere() },
    });

    if (!existingLeave) {
      return notFound('Leave request not found.');
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return badRequest('Request payload is required.');
    }

    const isManagerOrAdmin = user.role === 'A' || user.role === 'M';
    const isOwner = existingLeave.employeeId === user.id;

    // Check permissions
    if (!isManagerOrAdmin && !isOwner) {
      return forbidden('Access denied to update this leave request.');
    }

    const updateData = {};

    // ================= 1. APPROVE / REJECT FLOW =================
    if (body.approved !== undefined) {
      // Rule: Only Managers and Admins can approve or reject
      if (!isManagerOrAdmin) {
        return forbidden('Access denied. Only Managers and Admins can approve or reject leave requests.');
      }

      if (existingLeave.employeeId === user.id && user.role !== 'A') {
        return forbidden('You cannot approve or reject your own leave request.');
      }

      if (body.approved === true) {
        updateData.approved = true;
      } else if (body.approved === false) {
        updateData.approved = false;
        // If optional rejection reason provided, append note if helpful
        if (body.rejectionReason && String(body.rejectionReason).trim()) {
          const note = String(body.rejectionReason).trim();
          updateData.reason = existingLeave.reason ? `${existingLeave.reason} [Rejected: ${note}]` : `[Rejected: ${note}]`;
        }
      } else if (body.approved === null) {
        updateData.approved = null; // Revert to pending
      }
    }

    // ================= 2. EMPLOYEE / MANAGER CONTENT EDITS =================
    if (body.reason !== undefined) {
      if (!isManagerOrAdmin && existingLeave.approved !== null) {
        return badRequest('Cannot edit a leave request that has already been decided.');
      }
      const trimmedReason = String(body.reason).trim();
      if (!trimmedReason) {
        return badRequest('Reason cannot be empty.');
      }
      updateData.reason = trimmedReason;
    }

    if (body.leaveDate !== undefined) {
      if (!isManagerOrAdmin && existingLeave.approved !== null) {
        return badRequest('Cannot edit a leave request that has already been decided.');
      }
      const parsedDate = new Date(body.leaveDate);
      if (isNaN(parsedDate.getTime())) {
        return badRequest('Invalid leaveDate format.');
      }
      updateData.leaveDate = parsedDate;
    }

    if (body.duration !== undefined) {
      if (!isManagerOrAdmin && existingLeave.approved !== null) {
        return badRequest('Cannot edit a leave request that has already been decided.');
      }
      const dur = parseFloat(body.duration);
      if (isNaN(dur) || dur <= 0) {
        return badRequest('Duration must be a positive number of days.');
      }
      updateData.duration = dur;
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: updateData,
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

    const statusText = updated.approved === true ? 'APPROVED' : updated.approved === false ? 'REJECTED' : 'PENDING';

    return successResponse(
      {
        id: updated.id,
        employeeId: updated.employeeId,
        reason: updated.reason,
        leaveDate: updated.leaveDate,
        duration: updated.duration,
        approved: updated.approved,
        status: statusText,
        employee: updated.employee,
        updatedAt: updated.updatedAt,
      },
      `Leave request updated successfully (Status: ${statusText})`
    );
  } catch (error) {
    return handleApiError(error, 'Failed to update leave request');
  }
});

const leaveActive = setActiveHandler(workforceRecordDelegate(prisma.leave), 'Leave request');
export const PATCH = leaveActive;
export const DELETE = leaveActive;
