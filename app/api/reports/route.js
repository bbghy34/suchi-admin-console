import { workforceEmployeeWhere, workforceRecordWhere } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isActiveAccount } from '@/lib/security';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/reports
 * Comprehensive Reports API supporting Attendance, Projects, Contractors, Employees, and Leaves.
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);

    const reportType = searchParams.get('reportType') || 'attendance';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const departmentId = searchParams.get('departmentId');
    const contractorId = searchParams.get('contractorId');
    const siteId = searchParams.get('siteId');
    const employeeId = searchParams.get('employeeId');
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search');

    // Build Date Filter helper
    let dateFilter = null;
    if (startDateParam || endDateParam) {
      dateFilter = {};
      if (startDateParam) {
        const s = new Date(`${startDateParam}T00:00:00.000Z`);
        if (!isNaN(s.getTime())) dateFilter.gte = s;
      }
      if (endDateParam) {
        const e = new Date(`${endDateParam}T23:59:59.999Z`);
        if (!isNaN(e.getTime())) dateFilter.lte = e;
      }
    }

    // These independent reads can share a round trip window; Prisma's pool
    // still bounds database connections when several reports are requested.
    const [departmentsList, contractorsList, sitesList, employeesList] = await Promise.all([
      prisma.department.findMany({
        select: { id: true, name: true }, orderBy: { name: 'asc' },
      }),
      prisma.contractor.findMany({
        select: { id: true, name: true }, orderBy: { name: 'asc' },
      }),
      prisma.site.findMany({
        select: { id: true, name: true }, orderBy: { name: 'asc' },
      }),
      prisma.employee.findMany({
        select: { id: true, name: true, employeeCode: true, deptId: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    let attendanceData = [];
    let projectData = [];
    let contractorData = [];
    let employeeData = [];
    let leaveData = [];

    // 1. Attendance Report
    if (reportType === 'all' || reportType === 'attendance') {
      const attWhere = { isActive: true, ...workforceRecordWhere() };
      if (employeeId && employeeId !== 'ALL') {
        attWhere.employeeId = employeeId;
      }
      if (siteId && siteId !== 'ALL') {
        attWhere.siteId = siteId;
      }
      if (departmentId && departmentId !== 'ALL') {
        attWhere.employee = { ...(typeof attWhere.employee === 'object' ? attWhere.employee : {}), deptId: departmentId };
      }
      if (dateFilter) {
        attWhere.checkInTime = dateFilter;
      }
      if (statusParam && statusParam !== 'ALL') {
        const st = statusParam.toUpperCase();
        if (st === 'COMPLETED') {
          attWhere.checkOutTime = { not: null };
        } else if (st === 'ACTIVE') {
          attWhere.checkOutTime = null;
        } else if (st === 'FLAGGED') {
          attWhere.isFlagged = true;
        }
      }
      if (searchParam && searchParam.trim()) {
        attWhere.OR = [
          { employee: { name: { contains: searchParam.trim(), mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: searchParam.trim(), mode: 'insensitive' } } },
          { site: { name: { contains: searchParam.trim(), mode: 'insensitive' } } },
        ];
      }

      const rawAttendance = await prisma.attendance.findMany({
        where: attWhere,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              department: { select: { id: true, name: true } },
            },
          },
          site: {
            select: { id: true, name: true, address: true },
          },
        },
        orderBy: { checkInTime: 'desc' },
      });

      attendanceData = rawAttendance.map((rec) => {
        let workingHoursNumber = 0;
        let workingHoursDisplay = 'Ongoing';
        const checkIn = rec.checkInTime ? new Date(rec.checkInTime) : null;
        const checkOut = rec.checkOutTime ? new Date(rec.checkOutTime) : null;

        if (checkIn && checkOut) {
          const diffMs = checkOut.getTime() - checkIn.getTime();
          workingHoursNumber = Math.max(0, diffMs / (1000 * 60 * 60));
          workingHoursDisplay = `${workingHoursNumber.toFixed(1)} hrs`;
        } else if (checkIn) {
          const diffMs = Date.now() - checkIn.getTime();
          workingHoursNumber = Math.max(0, diffMs / (1000 * 60 * 60));
          workingHoursDisplay = `${workingHoursNumber.toFixed(1)} hrs (Active)`;
        }

        const status = rec.isFlagged
          ? 'FLAGGED'
          : rec.checkOutTime
          ? 'COMPLETED'
          : 'ACTIVE';

        return {
          id: rec.id,
          employeeId: rec.employeeId,
          employee: rec.employee?.name || 'Unknown Staff',
          employeeCode: rec.employee?.employeeCode || 'SG-EMP',
          department: rec.employee?.department?.name || 'Operations',
          siteId: rec.siteId,
          site: rec.site?.name || 'Main Office Terminal',
          date: rec.checkInTime,
          checkIn: rec.checkInTime,
          checkOut: rec.checkOutTime,
          workingHours: workingHoursDisplay,
          workingHoursNum: Number(workingHoursNumber.toFixed(1)),
          status,
          method: rec.method || 'BIOMETRIC_GEO',
          gpsAccuracy: rec.gpsAccuracy,
          isFlagged: Boolean(rec.isFlagged),
        };
      });
    }

    // 2. Project Report
    if (reportType === 'all' || reportType === 'project') {
      const projWhere = { isActive: true };
      if (statusParam && statusParam !== 'ALL') {
        projWhere.status = {
          equals: statusParam,
          mode: 'insensitive',
        };
      }
      if (departmentId && departmentId !== 'ALL') {
        projWhere.department = departmentId;
      }
      if (contractorId && contractorId !== 'ALL') {
        projWhere.contractor = contractorId;
      }
      if (dateFilter) {
        projWhere.OR = [
          { startDate: dateFilter },
          { endDate: dateFilter },
        ];
      }
      if (searchParam && searchParam.trim()) {
        const q = searchParam.trim();
        projWhere.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tenderId: { contains: q, mode: 'insensitive' } },
        ];
      }

      const rawProjects = await prisma.project.findMany({
        where: projWhere,
        include: {
          departmentRel: { select: { id: true, name: true } },
          contractorRel: { select: { id: true, name: true } },
          sites: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      projectData = rawProjects.map((p) => ({
        id: p.id,
        project: p.name,
        tenderId: p.tenderId || 'N/A',
        department: p.departmentRel?.name || 'Unassigned',
        contractor: p.contractorRel?.name || 'Unassigned',
        status: p.status || 'PLANNING',
        progress: p.progress ?? 0,
        budget: p.budget || 0,
        startDate: p.startDate,
        endDate: p.endDate,
        siteCount: p.sites?.length || 0,
      }));
    }

    // 3. Contractor Report
    if (reportType === 'all' || reportType === 'contractor') {
      const contWhere = { isActive: true };
      if (searchParam && searchParam.trim()) {
        const q = searchParam.trim();
        contWhere.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { phoneNo: { contains: q, mode: 'insensitive' } },
        ];
      }

      const rawContractors = await prisma.contractor.findMany({
        where: contWhere,
        include: {
          projects: {
            select: {
              id: true,
              name: true,
              status: true,
              progress: true,
              budget: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      contractorData = rawContractors.map((c) => {
        const assignedProjects = c.projects || [];
        const totalProjects = assignedProjects.length;
        const activeProjects = assignedProjects.filter((p) =>
          ['ACTIVE', 'IN_PROGRESS', 'Active', 'In Progress', 'ongoing', 'ONGOING'].includes(p.status)
        ).length;
        const completedProjects = assignedProjects.filter(
          (p) => p.status?.toUpperCase() === 'COMPLETED' || (p.progress ?? 0) >= 100
        ).length;
        const totalBudget = assignedProjects.reduce((sum, p) => sum + (p.budget || 0), 0);

        return {
          id: c.id,
          contractor: c.name,
          phone: c.phoneNo || 'N/A',
          description: c.description || 'Verified Contractor',
          totalProjects,
          activeProjects,
          completedProjects,
          totalBudget,
          projects: assignedProjects,
        };
      });
    }

    // 4. Employee Report
    if (reportType === 'all' || reportType === 'employee') {
      const empWhere = { NOT: { status: false } };
      if (departmentId && departmentId !== 'ALL') {
        empWhere.deptId = departmentId;
      }
      if (siteId && siteId !== 'ALL') {
        empWhere.siteId = siteId;
      }
      if (searchParam && searchParam.trim()) {
        const q = searchParam.trim();
        empWhere.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { employeeCode: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ];
      }

      const rawEmployees = await prisma.employee.findMany({
        where: workforceEmployeeWhere(empWhere),
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, title: true } },
          attendances: {
            select: {
              id: true,
              checkInTime: true,
              checkOutTime: true,
            },
          },
          leaves: {
            select: {
              id: true,
              approved: true,
              duration: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      employeeData = rawEmployees.map((e) => {
        let totalHours = 0;
        e.attendances?.forEach((att) => {
          if (att.checkInTime && att.checkOutTime) {
            const diffMs = new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime();
            totalHours += Math.max(0, diffMs / (1000 * 60 * 60));
          }
        });

        const totalAttendances = e.attendances?.length || 0;
        const totalLeaves = e.leaves?.length || 0;
        const approvedLeaves = e.leaves?.filter((l) => l.approved === true).length || 0;
        const pendingLeaves = e.leaves?.filter((l) => l.approved === null).length || 0;

        return {
          id: e.id,
          employee: e.name,
          employeeCode: e.employeeCode || 'SG-EMP',
          email: e.email || 'N/A',
          phone: e.phone || 'N/A',
          department: e.department?.name || 'General',
          designation: e.designation?.title || 'Staff Member',
          joinDate: e.joinDate,
          totalAttendances,
          totalHoursLogged: Number(totalHours.toFixed(1)),
          totalLeaves,
          approvedLeaves,
          pendingLeaves,
          status: isActiveAccount(e) ? 'Active' : 'Inactive',
        };
      });
    }

    // 5. Leave Report
    if (reportType === 'all' || reportType === 'leave') {
      const leaveWhere = { isActive: true, ...workforceRecordWhere() };
      if (employeeId && employeeId !== 'ALL') {
        leaveWhere.employeeId = employeeId;
      }
      if (departmentId && departmentId !== 'ALL') {
        leaveWhere.employee = { deptId: departmentId };
      }
      if (statusParam && statusParam !== 'ALL') {
        const st = statusParam.toUpperCase();
        if (st === 'PENDING') {
          leaveWhere.approved = null;
        } else if (st === 'APPROVED') {
          leaveWhere.approved = true;
        } else if (st === 'REJECTED') {
          leaveWhere.approved = false;
        }
      }
      if (dateFilter) {
        leaveWhere.leaveDate = dateFilter;
      }
      if (searchParam && searchParam.trim()) {
        const q = searchParam.trim();
        leaveWhere.OR = [
          { reason: { contains: q, mode: 'insensitive' } },
          { employee: { name: { contains: q, mode: 'insensitive' } } },
          { employee: { employeeCode: { contains: q, mode: 'insensitive' } } },
        ];
      }

      const rawLeaves = await prisma.leave.findMany({
        where: leaveWhere,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      leaveData = rawLeaves.map((l) => ({
        id: l.id,
        employee: l.employee?.name || 'Unknown Staff',
        employeeCode: l.employee?.employeeCode || 'SG-EMP',
        department: l.employee?.department?.name || 'Operations',
        designation: l.employee?.designation?.title || 'Staff Member',
        leaveDate: l.leaveDate,
        duration: l.duration ?? 1,
        reason: l.reason || 'Leave application',
        status: l.approved === true ? 'APPROVED' : l.approved === false ? 'REJECTED' : 'PENDING',
        createdAt: l.createdAt,
      }));
    }

    // Calculated summary counters for active report
    const summary = {
      attendance: {
        totalRecords: attendanceData.length,
        completedPunches: attendanceData.filter((a) => a.status === 'COMPLETED').length,
        activePunches: attendanceData.filter((a) => a.status === 'ACTIVE').length,
        totalHours: Number(attendanceData.reduce((acc, a) => acc + (a.workingHoursNum || 0), 0).toFixed(1)),
      },
      project: {
        totalProjects: projectData.length,
        activeProjects: projectData.filter((p) => ['ACTIVE', 'IN_PROGRESS'].includes(p.status?.toUpperCase())).length,
        totalBudget: projectData.reduce((acc, p) => acc + (p.budget || 0), 0),
        avgProgress: projectData.length > 0 ? Math.round(projectData.reduce((acc, p) => acc + p.progress, 0) / projectData.length) : 0,
      },
      contractor: {
        totalContractors: contractorData.length,
        contractorsWithProjects: contractorData.filter((c) => c.totalProjects > 0).length,
        totalPortfolioBudget: contractorData.reduce((acc, c) => acc + c.totalBudget, 0),
      },
      employee: {
        totalEmployees: employeeData.length,
        totalAttendances: employeeData.reduce((acc, e) => acc + e.totalAttendances, 0),
        totalLeaves: employeeData.reduce((acc, e) => acc + e.totalLeaves, 0),
      },
      leave: {
        totalLeaves: leaveData.length,
        approved: leaveData.filter((l) => l.status === 'APPROVED').length,
        pending: leaveData.filter((l) => l.status === 'PENDING').length,
        rejected: leaveData.filter((l) => l.status === 'REJECTED').length,
      },
    };

    const payload = {
      reportType,
      data: {
        attendance: attendanceData,
        project: projectData,
        contractor: contractorData,
        employee: employeeData,
        leave: leaveData,
      },
      summary,
      filters: {
        departments: departmentsList,
        contractors: contractorsList,
        sites: sitesList,
        employees: employeesList,
      },
    };

    return successResponse(payload, 'Report data retrieved successfully', 200);
  } catch (error) {
    return handleApiError(error, 'Failed to generate report data from database');
  }
});
