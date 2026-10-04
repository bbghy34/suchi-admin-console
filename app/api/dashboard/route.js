import prisma from '@/lib/prisma';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/auth';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import { LUIT_ADMIN_ROLE, TENDER_ROLE } from '@/lib/roles';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/dashboard
 * Live dashboard statistics:
 * - For Admin ('A') and Manager ('M'): full enterprise KPIs, projects, contractors, attendance, leaves.
 * - For Employee ('E'): strictly scoped personal dashboard (today's check-in status, own attendance, own leaves).
 * Authenticated.
 */
export const GET = requireAuth(async (request, { user }) => {
  try {
    // Calculate today's time range
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // ================= EMPLOYEE-SCOPED DASHBOARD =================
    if (user.role === 'E' || user.role === 'AA') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      const [
        todayRecord,
        monthlyAttendanceCount,
        pendingLeavesCount,
        approvedLeavesCount,
        recentAttendanceRaw,
        recentLeavesRaw,
      ] = await Promise.all([
        // Today's attendance for employee
        prisma.attendance.findFirst({
          where: {
            employeeId: user.id,
            isActive: true,
            checkInTime: { gte: todayStart, lte: todayEnd },
          },
          orderBy: { checkInTime: 'desc' },
          include: { site: { select: { id: true, name: true } } },
        }),

        // Total attendance this month for employee
        prisma.attendance.count({
          where: {
            employeeId: user.id,
            isActive: true,
            checkInTime: { gte: monthStart },
          },
        }),

        // Pending leaves for employee
        prisma.leave.count({
          where: {
            employeeId: user.id,
            approved: null,
            isActive: true,
          },
        }),

        // Approved leaves for employee
        prisma.leave.count({
          where: {
            employeeId: user.id,
            approved: true,
            isActive: true,
          },
        }),

        // Recent 5 attendance records
        prisma.attendance.findMany({
          where: { employeeId: user.id, isActive: true },
          take: 5,
          orderBy: { checkInTime: 'desc' },
          include: { site: { select: { id: true, name: true } } },
        }),

        // Recent 5 leave requests
        prisma.leave.findMany({
          where: { employeeId: user.id, isActive: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const recentAttendance = recentAttendanceRaw.map((r) => {
        let workingMinutes = 0;
        let workingHoursText = '—';
        if (r.checkInTime) {
          const start = new Date(r.checkInTime);
          const end = r.checkOutTime ? new Date(r.checkOutTime) : new Date();
          if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
            workingMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
            const hrs = Math.floor(workingMinutes / 60);
            const mins = workingMinutes % 60;
            workingHoursText = `${hrs}h ${mins}m${!r.checkOutTime ? ' (ongoing)' : ''}`;
          }
        }
        return {
          id: r.id,
          checkInTime: r.checkInTime,
          checkOutTime: r.checkOutTime,
          site: r.site ? r.site.name : 'Headquarters',
          workingHoursText,
          isOngoing: !r.checkOutTime,
        };
      });

      const recentLeaves = recentLeavesRaw.map((l) => ({
        id: l.id,
        leaveDate: l.leaveDate,
        duration: l.duration ?? 1,
        reason: l.reason,
        approved: l.approved,
        status: l.approved === true ? 'APPROVED' : l.approved === false ? 'REJECTED' : 'PENDING',
        createdAt: l.createdAt,
      }));

      const employeePayload = {
        isEmployee: true,
        currentUser: user,
        kpis: {
          todayStatus: todayRecord ? (todayRecord.checkOutTime ? 'Completed' : 'Checked In') : 'Not Checked In',
          checkedInTime: todayRecord ? todayRecord.checkInTime : null,
          checkedOutTime: todayRecord ? todayRecord.checkOutTime : null,
          siteName: todayRecord?.site?.name || null,
          monthlyAttendance: monthlyAttendanceCount,
          pendingLeaves: pendingLeavesCount,
          approvedLeaves: approvedLeavesCount,
        },
        todayRecord,
        recentAttendance,
        recentLeaves,
      };

      return successResponse(employeePayload, 'Employee dashboard data retrieved successfully', 200);
    }

    // ================= ADMIN & MANAGER ENTERPRISE DASHBOARD =================
    const statusKey = (value) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const isCompletedProject = (project) => statusKey(project.status) === 'COMPLETED' || project.progress >= 100;
    const isActiveProject = (project) => !isCompletedProject(project) && ['ACTIVE', 'IN_PROGRESS', 'ONGOING'].includes(statusKey(project.status));
    // The five headline counts in one round trip. Staff counts follow the same
    // rule as lib/prisma.js: the Luit admin and the tender login are not staff,
    // and their attendance and leave rows are not counted.
    const countsQuery = prisma.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM "Employee" e
          WHERE e.status = true AND (e.role IS NULL OR e.role NOT IN (${LUIT_ADMIN_ROLE}, ${TENDER_ROLE}))) AS "totalEmployees",
        (SELECT count(*)::int FROM "Contractor" c WHERE c."isActive" = true) AS "totalContractors",
        (SELECT count(*)::int FROM "Site" s WHERE s."isActive" = true) AS "totalSites",
        (SELECT count(*)::int FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
          WHERE a."checkInTime" >= ${todayStart} AND a."checkInTime" <= ${todayEnd}
            AND (e.role IS NULL OR e.role NOT IN (${LUIT_ADMIN_ROLE}, ${TENDER_ROLE}))) AS "todayAttendance",
        (SELECT count(*)::int FROM "Leave" l JOIN "Employee" e ON e.id = l."employeeId"
          WHERE l.approved IS NULL AND l."isActive" = true
            AND (e.role IS NULL OR e.role NOT IN (${LUIT_ADMIN_ROLE}, ${TENDER_ROLE}))) AS "pendingLeaves"
    `;
    const [
      [counts],
      allProjectsRaw,
      recentAttendanceRaw,
      pendingLeavesRaw,
      contractorsRaw,
    ] = await Promise.all([
      countsQuery,
      prisma.project.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          tenderId: true,
          status: true,
          progress: true,
          budget: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          contractor: true,
          departmentRel: { select: { name: true } },
          contractorRel: { select: { name: true } },
          _count: { select: { sites: true } },
        },
      }),

      // 9. Recent Attendance
      prisma.attendance.findMany({
        where: { isActive: true },
        take: 6,
        orderBy: { checkInTime: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              email: true,
              department: {
                select: { id: true, name: true },
              },
            },
          },
          site: {
            select: { id: true, name: true },
          },
        },
      }),

      // 10. Pending Leaves
      prisma.leave.findMany({
        where: {
          approved: null,
          isActive: true,
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              email: true,
              department: {
                select: { id: true, name: true },
              },
              designation: {
                select: { id: true, title: true },
              },
            },
          },
        },
      }),

      prisma.contractor.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, phoneNo: true, description: true },
      }),
    ]);

    const { totalEmployees, totalContractors, totalSites, todayAttendance: todayAttendanceCount, pendingLeaves: pendingLeavesCount } = counts;
    const totalProjects = allProjectsRaw.length;
    const activeProjectsCount = allProjectsRaw.filter(isActiveProject).length;
    const recentProjectsRaw = allProjectsRaw.slice(0, 6);
    const projectsByContractor = new Map();
    for (const project of allProjectsRaw) {
      if (!project.contractor) continue;
      const assigned = projectsByContractor.get(project.contractor) || [];
      assigned.push(project);
      projectsByContractor.set(project.contractor, assigned);
    }

    // Format recent projects
    const recentProjects = recentProjectsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      tenderId: p.tenderId || 'N/A',
      department: p.departmentRel?.name || 'Unassigned',
      contractor: p.contractorRel?.name || 'Unassigned',
      status: p.status || 'PLANNING',
      progress: p.progress ?? 0,
      budget: p.budget || 0,
      startDate: p.startDate,
      endDate: p.endDate,
      siteCount: p._count?.sites || 0,
      createdAt: p.createdAt,
    }));

    // Format recent attendance
    const recentAttendance = recentAttendanceRaw.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee?.name || 'Unknown Staff',
      employeeCode: a.employee?.employeeCode || 'EMP',
      department: a.employee?.department?.name || 'General',
      siteName: a.site?.name || 'Main Office',
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      method: a.method || 'STANDARD',
      gpsAccuracy: a.gpsAccuracy,
      isFlagged: Boolean(a.isFlagged),
      status: a.checkOutTime ? 'COMPLETED' : 'ACTIVE',
    }));

    // Format pending leaves
    const pendingLeaves = pendingLeavesRaw.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee?.name || 'Unknown Staff',
      employeeCode: l.employee?.employeeCode || 'EMP',
      department: l.employee?.department?.name || 'Corporate',
      designation: l.employee?.designation?.title || 'Staff',
      reason: l.reason || 'Leave requested',
      leaveDate: l.leaveDate,
      duration: l.duration || 1,
      status: 'PENDING',
      createdAt: l.createdAt,
    }));

    // Project progress breakdown & stats
    const projectProgressList = allProjectsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      department: p.departmentRel?.name || 'Unassigned',
      contractor: p.contractorRel?.name || 'Unassigned',
      status: p.status || 'PLANNING',
      progress: p.progress ?? 0,
      budget: p.budget || 0,
      startDate: p.startDate,
      endDate: p.endDate,
    }));

    const progressSum = projectProgressList.reduce((acc, curr) => acc + curr.progress, 0);
    const averageProgress =
      projectProgressList.length > 0 ? Math.round(progressSum / projectProgressList.length) : 0;

    const completedProjectsCount = projectProgressList.filter(isCompletedProject).length;

    const planningProjectsCount = projectProgressList.filter(
      (p) => !isCompletedProject(p) && statusKey(p.status) === 'PLANNING'
    ).length;

    // Contractor project summary
    const contractorProjectSummary = contractorsRaw.map((c) => {
      const assignedProjects = projectsByContractor.get(c.id) || [];
      const totalBudget = assignedProjects.reduce((acc, p) => acc + (p.budget || 0), 0);
      const activeCount = assignedProjects.filter(isActiveProject).length;

      return {
        id: c.id,
        name: c.name,
        phoneNo: c.phoneNo || 'N/A',
        description: c.description,
        totalProjects: assignedProjects.length,
        activeProjects: activeCount,
        totalBudget,
        projectNames: assignedProjects.map((p) => p.name),
        projects: assignedProjects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          progress: p.progress ?? 0,
          budget: p.budget,
        })),
      };
    });

    const responsePayload = {
      kpis: {
        totalEmployees,
        totalContractors,
        totalProjects,
        activeProjects: activeProjectsCount,
        totalSites,
        todayAttendance: todayAttendanceCount,
        pendingLeaves: pendingLeavesCount,
      },
      recentProjects,
      recentAttendance,
      pendingLeaves,
      projectProgress: {
        projects: projectProgressList,
        averageProgress,
        completedProjectsCount,
        activeProjectsCount,
        planningProjectsCount,
        totalProjectsCount: totalProjects,
      },
      contractorProjectSummary,
      currentUser: user ? { id: user.id, name: user.name, role: user.role } : null,
    };

    return successResponse(responsePayload, 'Dashboard data retrieved successfully', 200);
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve dashboard metrics from database');
  }
});
