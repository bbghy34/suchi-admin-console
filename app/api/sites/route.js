import { workforceEmployeeWhere, workforceRecordWhere, publicSite } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';
import { isExcludedStaffRole, visiblePerson } from '@/lib/roles';
import { invalidateWarehouseOptions } from '@/lib/read-cache';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/sites
 * Query parameters supported:
 * - ?page=1
 * - &limit=20 (or &limit=all / &dropdown=true for full list)
 * - &projectId=... (filters by Site.projectId -> Project.id)
 * - &status=... (ACTIVE, INACTIVE, PLANNED, etc.)
 * - &sitManager=... (filters by Site.sitManager -> Employee.id)
 * - &search=... (matches name, address, coordinates)
 *
 * Includes:
 * - project (Site.projectId -> Project.id)
 * - manager (Site.sitManager -> Employee.id)
 * - _count { attendances }
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const isDropdown = searchParams.get('dropdown') === 'true' || searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = isDropdown ? 1000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = isDropdown ? 0 : (page - 1) * limit;

    const projectIdFilter = searchParams.get('projectId');
    const statusFilter = searchParams.get('status');
    const sitManagerFilter = searchParams.get('sitManager');
    const searchFilter = searchParams.get('search');

    const where = {};

    // 1. Filter by Project (Site.projectId -> Project.id)
    if (projectIdFilter && projectIdFilter.trim()) {
      where.projectId = projectIdFilter.trim();
    }

    // 2. Filter by Status
    if (statusFilter && statusFilter.trim()) {
      where.status = {
        equals: statusFilter.trim(),
        mode: 'insensitive',
      };
    }

    // 3. Filter by Site Manager (Site.sitManager -> Employee.id)
    if (sitManagerFilter && sitManagerFilter.trim()) {
      where.sitManager = sitManagerFilter.trim();
    }

    // 4. Search Filter (matches name, address, coordinates)
    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { coordinates: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    // Execute count and query concurrently
    const [total, sites] = await Promise.all([
      prisma.site.count({ where }),
      prisma.site.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              tenderId: true,
              status: true,
              budget: true,
            },
          },
          manager: {
            select: {
              role: true,
              id: true,
              name: true,
              email: true,
              phone: true,
              employeeCode: true,
              role: true,
            },
          },
          _count: {
            select: {
              attendances: { where: workforceRecordWhere() },
            },
          },
        },
      }),
    ]);

    const formattedSites = sites.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      coordinates: s.coordinates,
      attendanceRadius: s.attendanceRadius ?? null,
      status: s.status || 'ACTIVE',
      sitManager: publicSite(s).sitManager,
      projectId: s.projectId,
      manager: visiblePerson(s.manager),
      project: s.project,
      attendanceCount: s._count?.attendances || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    if (isDropdown) {
      return successResponse(formattedSites, 'Sites retrieved successfully');
    }

    return successResponse(
      formattedSites,
      'Sites retrieved successfully',
      200,
      {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      }
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve sites');
  }
});

/**
 * POST /api/sites
 * Creates a new site.
 *
 * Fields:
 * - name (required)
 * - address (optional)
 * - coordinates (optional)
 * - status (optional, defaults to 'ACTIVE')
 * - sitManager (optional, references Employee.id)
 * - projectId (optional, references Project.id)
 *
 * Validations:
 * - name must be non-empty string.
 * - projectId if supplied must exist in Project.
 * - sitManager if supplied must exist in Employee.
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const { name, address, coordinates, attendanceRadius, status, sitManager, projectId } = body;

    // 1. Validate Site Name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return errorResponse('Site name is required and cannot be empty.', 400);
    }

    // 2. Validate Project ID if provided (Site.projectId -> Project.id)
    let validatedProjectId = null;
    if (projectId !== undefined && projectId !== null && String(projectId).trim() !== '') {
      const trimmedProjectId = String(projectId).trim();
      const projectExists = await prisma.project.findUnique({
        where: { id: trimmedProjectId },
        select: { id: true, name: true },
      });

      if (!projectExists) {
        return errorResponse(
          `Project with ID "${trimmedProjectId}" not found. projectId must reference a valid Project.id.`,
          400
        );
      }
      validatedProjectId = projectExists.id;
    }

    // 3. Validate Site Manager if provided (Site.sitManager -> Employee.id)
    let validatedManagerId = null;
    if (sitManager !== undefined && sitManager !== null && String(sitManager).trim() !== '') {
      const trimmedManagerId = String(sitManager).trim();
      const managerExists = await prisma.employee.findUnique({
        where: { id: trimmedManagerId },
        select: { id: true, name: true, role: true },
      });

      if (!managerExists || isExcludedStaffRole(managerExists.role)) {
        return errorResponse(
          `Employee with ID "${trimmedManagerId}" not found. sitManager must reference a valid Employee.id.`,
          400
        );
      }
      validatedManagerId = managerExists.id;
    }

    // 4. Validate attendanceRadius if provided
    let validatedRadius = null;
    if (attendanceRadius !== undefined && attendanceRadius !== null && String(attendanceRadius).trim() !== '') {
      const parsed = parseInt(String(attendanceRadius), 10);
      if (isNaN(parsed) || parsed < 0) {
        return errorResponse('attendanceRadius must be a non-negative integer (metres).', 400);
      }
      validatedRadius = parsed;
    }

    // 5. Create Site
    const newSite = await prisma.site.create({
      data: {
        name: name.trim(),
        address: address && String(address).trim() ? String(address).trim() : null,
        coordinates: coordinates && String(coordinates).trim() ? String(coordinates).trim() : null,
        attendanceRadius: validatedRadius,
        status: status && String(status).trim() ? String(status).trim().toUpperCase() : 'ACTIVE',
        sitManager: validatedManagerId,
        projectId: validatedProjectId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            tenderId: true,
            status: true,
          },
        },
        manager: {
          select: {
            role: true,
            id: true,
            name: true,
            email: true,
            phone: true,
            employeeCode: true,
          },
        },
        _count: {
          select: {
            attendances: { where: workforceRecordWhere() },
          },
        },
      },
    });

    const formattedSite = {
      id: newSite.id,
      name: newSite.name,
      address: newSite.address,
      coordinates: newSite.coordinates,
      attendanceRadius: newSite.attendanceRadius ?? null,
      status: newSite.status || 'ACTIVE',
      sitManager: publicSite(newSite).sitManager,
      projectId: newSite.projectId,
      manager: publicSite(newSite).manager,
      project: newSite.project,
      attendanceCount: newSite._count?.attendances || 0,
      createdAt: newSite.createdAt,
      updatedAt: newSite.updatedAt,
    };

    invalidateWarehouseOptions();
    return successResponse(formattedSite, 'Site created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create site');
  }
});
