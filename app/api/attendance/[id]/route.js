import { workforceEmployeeWhere, workforceRecordWhere, workforceRecordDelegate } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireAuth, requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, forbidden, handleApiError } from '@/lib/api-response';
import { setActiveHandler } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/attendance/[id]
 * Retrieves single attendance record with Employee and Site.
 *
 * Authenticated:
 * - Admin/Manager can view any record.
 * - Employee can only view their own record.
 */
export const GET = requireAuth(async (request, { params, user }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const record = await prisma.attendance.findUnique({
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
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            coordinates: true,
            status: true,
            attendanceRadius: true,
          },
        },
      },
    });

    if (!record) {
      return notFound('Attendance record not found.');
    }

    // Role check: Employee can only view their own attendance record
    if (user.role === 'E' && record.employeeId !== user.id) {
      return forbidden('Access denied. Employees are only permitted to view their own attendance record.');
    }

    let workingMinutes = 0;
    let workingHoursText = '—';
    let isOngoing = false;

    if (record.checkInTime) {
      const start = new Date(record.checkInTime);
      const end = record.checkOutTime ? new Date(record.checkOutTime) : new Date();
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        workingMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
        const hrs = Math.floor(workingMinutes / 60);
        const mins = workingMinutes % 60;
        workingHoursText = `${hrs}h ${mins}m${!record.checkOutTime ? ' (ongoing)' : ''}`;
        isOngoing = !record.checkOutTime;
      }
    }

    const formatted = {
      ...record,
      workingMinutes,
      workingHoursText,
      isOngoing,
    };

    return successResponse(formatted, 'Attendance details retrieved successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve attendance record');
  }
});

/**
 * PUT /api/attendance/[id]
 * Updates an attendance record.
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const PUT = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const existingRecord = await prisma.attendance.findUnique({
      where: { id, ...workforceRecordWhere() },
    });

    if (!existingRecord) {
      return notFound('Attendance record not found.');
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const updateData = {};

    // 1. Validate employeeId if updated
    if (body.employeeId !== undefined) {
      const empId = String(body.employeeId).trim();
      const employeeExists = await prisma.employee.findUnique({
        where: workforceEmployeeWhere({ id: empId }),
        select: { id: true },
      });
      if (!employeeExists) {
        return errorResponse(`Employee with ID "${empId}" not found.`, 400);
      }
      updateData.employeeId = empId;
    }

    // 2. Validate siteId if updated
    if (body.siteId !== undefined) {
      if (body.siteId === null || body.siteId === '') {
        updateData.siteId = null;
      } else {
        const sId = String(body.siteId).trim();
        const siteExists = await prisma.site.findUnique({
          where: { id: sId },
          select: { id: true },
        });
        if (!siteExists) {
          return errorResponse(`Site with ID "${sId}" not found.`, 400);
        }
        updateData.siteId = sId;
      }
    }

    // 3. Validate checkInTime and checkOutTime
    let effectiveCheckIn = existingRecord.checkInTime;
    let effectiveCheckOut = existingRecord.checkOutTime;

    if (body.checkInTime !== undefined) {
      if (!body.checkInTime) {
        return errorResponse('checkInTime cannot be empty.', 400);
      }
      const parsedIn = new Date(body.checkInTime);
      if (isNaN(parsedIn.getTime())) {
        return errorResponse('Invalid checkInTime date format.', 400);
      }
      effectiveCheckIn = parsedIn;
      updateData.checkInTime = parsedIn;
    }

    if (body.checkOutTime !== undefined) {
      if (body.checkOutTime === null || body.checkOutTime === '') {
        effectiveCheckOut = null;
        updateData.checkOutTime = null;
      } else {
        const parsedOut = new Date(body.checkOutTime);
        if (isNaN(parsedOut.getTime())) {
          return errorResponse('Invalid checkOutTime date format.', 400);
        }
        effectiveCheckOut = parsedOut;
        updateData.checkOutTime = parsedOut;
      }
    }

    if (effectiveCheckIn && effectiveCheckOut && effectiveCheckOut < effectiveCheckIn) {
      return errorResponse('Check-out time cannot be earlier than check-in time.', 400);
    }

    // 4. Update method, gpsAccuracy, isFlagged, location fields
    if (body.method !== undefined) {
      updateData.method = body.method ? String(body.method).trim().toUpperCase() : 'GPS';
    }

    if (body.gpsAccuracy !== undefined) {
      updateData.gpsAccuracy =
        body.gpsAccuracy !== null && body.gpsAccuracy !== '' ? parseFloat(body.gpsAccuracy) : null;
    }

    if (body.isFlagged !== undefined) {
      updateData.isFlagged = Boolean(body.isFlagged);
    }

    // Location fields (admin/manager manual corrections)
    if (body.checkInLat !== undefined) {
      updateData.checkInLat = body.checkInLat !== null && body.checkInLat !== '' ? Number(body.checkInLat) : null;
    }
    if (body.checkInLng !== undefined) {
      updateData.checkInLng = body.checkInLng !== null && body.checkInLng !== '' ? Number(body.checkInLng) : null;
    }
    if (body.siteLat !== undefined) {
      updateData.siteLat = body.siteLat !== null && body.siteLat !== '' ? Number(body.siteLat) : null;
    }
    if (body.siteLng !== undefined) {
      updateData.siteLng = body.siteLng !== null && body.siteLng !== '' ? Number(body.siteLng) : null;
    }
    if (body.siteAttendanceRadius !== undefined) {
      updateData.siteAttendanceRadius = body.siteAttendanceRadius !== null ? parseInt(body.siteAttendanceRadius, 10) : null;
    }
    if (body.distanceFromSite !== undefined) {
      updateData.distanceFromSite = body.distanceFromSite !== null && body.distanceFromSite !== '' ? Number(body.distanceFromSite) : null;
    }
    if (body.locationRemarks !== undefined) {
      updateData.locationRemarks = body.locationRemarks ? String(body.locationRemarks).trim() : null;
    }

    const updated = await prisma.attendance.update({
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
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            coordinates: true,
            attendanceRadius: true,
          },
        },
      },
    });

    return successResponse(updated, 'Attendance record updated successfully');
  } catch (error) {
    return handleApiError(error, 'Failed to update attendance record');
  }
});

const attendanceActive = setActiveHandler(workforceRecordDelegate(prisma.attendance), 'Attendance record');
export const PATCH = attendanceActive;
export const DELETE = attendanceActive;

