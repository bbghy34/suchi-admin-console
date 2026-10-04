import { workforceEmployeeWhere, workforceRecordWhere } from '@/lib/luit-admin/privacy.mjs';
import { attendanceSummary } from '@/lib/attendance-summary.mjs';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * Haversine formula — returns distance in metres between two lat/lng points.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/attendance
 * Query parameters supported:
 * - ?page=1
 * - &limit=10 (or &limit=all)
 * - &employeeId=...
 * - &siteId=...
 * - &date=YYYY-MM-DD
 * - &startDate=YYYY-MM-DD
 * - &endDate=YYYY-MM-DD
 * - &status=ACTIVE|COMPLETED|FLAGGED
 * - &search=...
 *
 * Authenticated.
 */
export const GET = requireAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const isDropdown = searchParams.get('dropdown') === 'true' || searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = isDropdown ? 1000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = isDropdown ? 0 : (page - 1) * limit;

    const employeeId = searchParams.get('employeeId');
    const siteId = searchParams.get('siteId');
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search');

    const where = { ...workforceRecordWhere() };

    // 1. Role Scoping & employeeId filter
    if (user.role === 'E') {
      // Employees are strictly limited to their own attendance records
      where.employeeId = user.id;
    } else if (employeeId && employeeId.trim()) {
      where.employeeId = employeeId.trim();
    }

    // 2. Filter by siteId
    if (siteId && siteId.trim()) {
      where.siteId = siteId.trim();
    }

    // 3. Filter by Date or Date Range
    if (dateParam && dateParam.trim()) {
      const dayStart = new Date(`${dateParam.trim()}T00:00:00.000Z`);
      const dayEnd = new Date(`${dateParam.trim()}T23:59:59.999Z`);
      if (!isNaN(dayStart.getTime()) && !isNaN(dayEnd.getTime())) {
        where.checkInTime = {
          gte: dayStart,
          lte: dayEnd,
        };
      }
    } else if (startDateParam || endDateParam) {
      where.checkInTime = {};
      if (startDateParam && startDateParam.trim()) {
        const s = new Date(`${startDateParam.trim()}T00:00:00.000Z`);
        if (!isNaN(s.getTime())) where.checkInTime.gte = s;
      }
      if (endDateParam && endDateParam.trim()) {
        const e = new Date(`${endDateParam.trim()}T23:59:59.999Z`);
        if (!isNaN(e.getTime())) where.checkInTime.lte = e;
      }
    }

    // 4. Filter by status
    if (statusParam && statusParam.trim()) {
      const st = statusParam.trim().toUpperCase();
      if (st === 'ACTIVE' || st === 'OPEN' || st === 'CHECKED_IN') {
        where.checkOutTime = null;
      } else if (st === 'COMPLETED') {
        where.checkOutTime = { not: null };
      } else if (st === 'FLAGGED') {
        where.isFlagged = true;
      }
    }

    // 5. Search filter (matches employee name, employeeCode, site name, method)
    if (searchParam && searchParam.trim()) {
      const q = searchParam.trim();
      where.OR = [
        { method: { contains: q, mode: 'insensitive' } },
        { employee: { name: { contains: q, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: q, mode: 'insensitive' } } },
        { site: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    // Concurrently fetch count and attendance records
    const [total, records, summaryRecords] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { checkInTime: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              email: true,
              phone: true,
              role: true,
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
      }),
      prisma.attendance.findMany({ where, select: { checkInTime: true, checkOutTime: true, isFlagged: true } }),
    ]);

    const formattedRecords = records.map((r) => {
      // Calculate working hours
      let workingMinutes = 0;
      let workingHoursText = '—';
      let isOngoing = false;

      if (r.checkInTime) {
        const start = new Date(r.checkInTime);
        const end = r.checkOutTime ? new Date(r.checkOutTime) : new Date();
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
          workingMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
          const hrs = Math.floor(workingMinutes / 60);
          const mins = workingMinutes % 60;
          workingHoursText = `${hrs}h ${mins}m${!r.checkOutTime ? ' (ongoing)' : ''}`;
          isOngoing = !r.checkOutTime;
        }
      }

      return {
        id: r.id,
        employeeId: r.employeeId,
        siteId: r.siteId,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        method: r.method || 'GPS',
        gpsAccuracy: r.gpsAccuracy,
        isFlagged: Boolean(r.isFlagged),
        // Location snapshot fields
        siteLat: r.siteLat ?? null,
        siteLng: r.siteLng ?? null,
        siteAttendanceRadius: r.siteAttendanceRadius ?? null,
        checkInLat: r.checkInLat ?? null,
        checkInLng: r.checkInLng ?? null,
        distanceFromSite: r.distanceFromSite ?? null,
        locationRemarks: r.locationRemarks ?? null,
        workingMinutes,
        workingHoursText,
        isOngoing,
        employee: r.employee,
        site: r.site,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    if (isDropdown) {
      return successResponse(formattedRecords, 'Attendance records retrieved successfully');
    }

    return successResponse(
      formattedRecords,
      'Attendance records retrieved successfully',
      200,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        summary: attendanceSummary(summaryRecords),
      }
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve attendance records');
  }
});

/**
 * POST /api/attendance
 * Handles Check-in and Check-out:
 *
 * Check-in:
 * - Creates a new attendance record with checkInTime, employeeId, siteId, method, gpsAccuracy, isFlagged.
 *
 * Check-out:
 * - When { action: 'checkout', employeeId } is provided:
 *   Finds the open attendance record without checkOutTime and updates checkOutTime.
 *
 * Authenticated.
 */
export const POST = requireAuth(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const action = String(body.action || '').trim().toLowerCase();
    const isCheckoutAction =
      action === 'checkout' ||
      action === 'check-out' ||
      action === 'check_out' ||
      body.isCheckout === true;

    // ================= CHECK-OUT FLOW =================
    if (isCheckoutAction) {
      if (!body.employeeId || !String(body.employeeId).trim()) {
        return errorResponse('employeeId is required for check-out.', 400);
      }

      const empId = String(body.employeeId).trim();

      // Permissions check: Employee can only check out for themselves
      if (user.role === 'E' && empId !== user.id) {
        return errorResponse('Access denied. Employees can only check out for themselves.', 403);
      }

      // Find the latest open check-in record for this employee
      const openWhere = {
        employeeId: empId,
        checkOutTime: null,
      };

      if (body.siteId && String(body.siteId).trim()) {
        openWhere.siteId = String(body.siteId).trim();
      }

      const openRecord = await prisma.attendance.findFirst({
        where: { ...openWhere, ...workforceRecordWhere() },
        orderBy: { checkInTime: 'desc' },
      });

      if (!openRecord) {
        return errorResponse(
          'No active open check-in record found for this employee to check out.',
          400
        );
      }

      const checkOutDate = user.role === 'E'
        ? new Date()
        : (body.checkOutTime ? new Date(body.checkOutTime) : new Date());
      if (isNaN(checkOutDate.getTime())) {
        return errorResponse('Invalid checkOutTime date format.', 400);
      }

      if (openRecord.checkInTime && checkOutDate < new Date(openRecord.checkInTime)) {
        return errorResponse('Check-out time cannot be earlier than check-in time.', 400);
      }

      const updatedRecord = await prisma.attendance.update({
        where: { id: openRecord.id },
        data: {
          checkOutTime: checkOutDate,
          ...(body.gpsAccuracy !== undefined && Number.isFinite(Number(body.gpsAccuracy))
            ? { gpsAccuracy: Number(body.gpsAccuracy) }
            : {}),
          ...(body.method ? { method: String(body.method).trim().slice(0, 40) } : {}),
          ...(user.role !== 'E' && body.isFlagged !== undefined ? { isFlagged: Boolean(body.isFlagged) } : {}),
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
          site: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
      });

      return successResponse(
        updatedRecord,
        `Employee "${updatedRecord.employee?.name || 'Employee'}" checked out successfully.`
      );
    }

    // ================= CHECK-IN / CREATE FLOW =================
    const {
      employeeId, siteId, checkInTime, checkOutTime,
      method, gpsAccuracy, isFlagged,
      checkInLat, checkInLng,
    } = body;

    // 1. Validate Employee
    if (!employeeId || !String(employeeId).trim()) {
      return errorResponse('employeeId is required.', 400);
    }

    const trimmedEmpId = String(employeeId).trim();

    // Permissions check: Employee can only check in for themselves
    if (user.role === 'E' && trimmedEmpId !== user.id) {
      return errorResponse('Access denied. Employees can only check in for themselves.', 403);
    }

    const employeeExists = await prisma.employee.findUnique({
      where: workforceEmployeeWhere({ id: trimmedEmpId }),
      select: { id: true, name: true },
    });

    if (!employeeExists) {
      return errorResponse(`Employee with ID "${trimmedEmpId}" not found.`, 400);
    }

    // 2. Validate Site if provided — also fetch coordinates + attendanceRadius
    let validatedSiteId = null;
    let siteRecord = null;
    if (siteId !== undefined && siteId !== null && String(siteId).trim() !== '') {
      const trimmedSiteId = String(siteId).trim();
      siteRecord = await prisma.site.findUnique({
        where: { id: trimmedSiteId },
        select: { id: true, name: true, coordinates: true, attendanceRadius: true },
      });

      if (!siteRecord) {
        return errorResponse(`Site with ID "${trimmedSiteId}" not found.`, 400);
      }
      validatedSiteId = siteRecord.id;
    }

    // 3. Employees always punch against server time so hours cannot be backdated.
    const checkInDate = user.role === 'E' ? new Date() : (checkInTime ? new Date(checkInTime) : new Date());
    if (isNaN(checkInDate.getTime())) {
      return errorResponse('Invalid checkInTime date format.', 400);
    }

    // 4. Validate Check-out Date if provided (administrators only)
    let checkOutDate = null;
    if (user.role !== 'E' && checkOutTime !== undefined && checkOutTime !== null && checkOutTime !== '') {
      const parsedOut = new Date(checkOutTime);
      if (isNaN(parsedOut.getTime())) {
        return errorResponse('Invalid checkOutTime date format.', 400);
      }
      if (parsedOut < checkInDate) {
        return errorResponse('Check-out time cannot be earlier than check-in time.', 400);
      }
      checkOutDate = parsedOut;
    }

    const gpsValue = gpsAccuracy !== undefined && gpsAccuracy !== null && gpsAccuracy !== ''
      ? Number(gpsAccuracy)
      : null;
    if (gpsValue !== null && !Number.isFinite(gpsValue)) {
      return errorResponse('gpsAccuracy must be a valid number.', 400);
    }

    // --- Location snapshot & distance computation ---
    const checkInLatVal = checkInLat !== undefined && checkInLat !== null && checkInLat !== ''
      ? Number(checkInLat) : null;
    const checkInLngVal = checkInLng !== undefined && checkInLng !== null && checkInLng !== ''
      ? Number(checkInLng) : null;

    // Parse site lat/lng from site.coordinates (format: "lat,lng" or "lat° N, lng° E")
    let siteLat = null;
    let siteLng = null;
    let siteAttendanceRadiusVal = null;
    if (siteRecord?.coordinates) {
      const raw = siteRecord.coordinates.replace(/[°NSEW]/g, '').replace(/\s+/g, ' ').trim();
      const parts = raw.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        siteLat = parts[0];
        siteLng = parts[1];
      }
    }
    if (siteRecord?.attendanceRadius != null) {
      siteAttendanceRadiusVal = siteRecord.attendanceRadius;
    }

    // Compute distance
    let distanceFromSite = null;
    if (siteLat !== null && siteLng !== null && checkInLatVal !== null && checkInLngVal !== null) {
      distanceFromSite = Math.round(haversineDistance(siteLat, siteLng, checkInLatVal, checkInLngVal) * 10) / 10;
    }

    // Auto-generate remarks
    let locationRemarks = null;
    if (checkInLatVal === null || checkInLngVal === null) {
      locationRemarks = 'No employee GPS location provided.';
    } else if (siteLat === null || siteLng === null) {
      locationRemarks = 'No site GPS coordinates configured.';
    } else if (siteAttendanceRadiusVal === null) {
      locationRemarks = `Distance from site: ${distanceFromSite}m. No attendance radius configured.`;
    } else if (distanceFromSite <= siteAttendanceRadiusVal) {
      locationRemarks = `Within radius. Distance: ${distanceFromSite}m (limit: ${siteAttendanceRadiusVal}m).`;
    } else {
      locationRemarks = `Outside radius. Distance: ${distanceFromSite}m exceeds limit of ${siteAttendanceRadiusVal}m.`;
    }

    const attendanceData = {
      employeeId: employeeExists.id,
      siteId: validatedSiteId,
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      method: method && String(method).trim() ? String(method).trim().toUpperCase().slice(0, 40) : 'GPS',
      gpsAccuracy: gpsValue,
      isFlagged: user.role === 'E' ? false : (isFlagged !== undefined ? Boolean(isFlagged) : false),
      siteLat,
      siteLng,
      siteAttendanceRadius: siteAttendanceRadiusVal,
      checkInLat: checkInLatVal,
      checkInLng: checkInLngVal,
      distanceFromSite,
      locationRemarks,
    };
    const attendanceInclude = {
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
    };

    // 5. Create the record. Open check-ins are locked per employee so two
    // simultaneous punches cannot both succeed.
    let newRecord;
    try {
      newRecord = await prisma.$transaction(async (tx) => {
        if (!checkOutDate) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeExists.id}))`;
          const openSession = await tx.attendance.findFirst({
            where: { employeeId: employeeExists.id, checkOutTime: null },
            select: { id: true },
          });
          if (openSession) {
            const openError = new Error('OPEN_SESSION');
            openError.code = 'OPEN_SESSION';
            throw openError;
          }
        }
        return tx.attendance.create({
          data: attendanceData,
          include: attendanceInclude,
        });
      });
    } catch (error) {
      if (error?.code === 'OPEN_SESSION') {
        return errorResponse('This employee already has an open check-in. Check out before starting a new session.', 400);
      }
      throw error;
    }

    return successResponse(
      newRecord,
      `Check-in recorded for "${newRecord.employee?.name || 'Employee'}" successfully.`,
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to process attendance record');
  }
});
