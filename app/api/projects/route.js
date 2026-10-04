import { publicSite } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';
import { invalidateWarehouseOptions } from '@/lib/read-cache';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

/**
 * GET /api/projects
 * Filters supported:
 * - status (e.g. ?status=ACTIVE, PLANNING, COMPLETED)
 * - department (e.g. ?department=deptId)
 * - contractor (e.g. ?contractor=contractorId)
 * - type (e.g. ?type=Buildings)
 * - search (e.g. ?search=keyword)
 *
 * Pagination:
 * - ?page=1&limit=20
 *
 * Returns:
 * - Project
 * - Department (departmentRel)
 * - Contractor (contractorRel - Project.contractor -> Contractor.id)
 * - Sites
 * - BOQs (boqRecords)
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const GET = requireRoles(['A', 'M', 'AA'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const statusFilter = searchParams.get('status');
    const departmentFilter = searchParams.get('department');
    const contractorFilter = searchParams.get('contractor');
    const typeFilter = searchParams.get('type');
    const searchFilter = searchParams.get('search');

    const where = {};

    if (statusFilter && statusFilter.trim()) {
      where.status = {
        equals: statusFilter.trim(),
        mode: 'insensitive',
      };
    }

    if (departmentFilter && departmentFilter.trim()) {
      where.department = departmentFilter.trim();
    }

    if (contractorFilter && contractorFilter.trim()) {
      where.contractor = contractorFilter.trim();
    }

    if (typeFilter && typeFilter.trim()) {
      where.type = {
        equals: typeFilter.trim(),
        mode: 'insensitive',
      };
    }

    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tenderId: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          departmentRel: true,
          contractorRel: true,
          firm: true,
          sites: {
            include: {
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
            },
          },
          boqRecords: true,
        },
      }),
    ]);

    // Format projects to provide clean, robust access to both raw IDs and nested relations
    const formattedProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      type: p.type,
      status: p.status,
      departmentId: p.department,
      department: p.departmentRel,
      departmentRel: p.departmentRel,
      progress: p.progress,
      tenderId: p.tenderId,
      startDate: p.startDate,
      endDate: p.endDate,
      budget: p.budget,
      contractorId: p.contractor,
      contractor: p.contractorRel,
      contractorRel: p.contractorRel,
      firmId: p.firmId,
      firm: p.firm,
      sites: (p.sites || []).map(publicSite),
      boqRecords: p.boqRecords || [],
      siteCount: p.sites?.length || 0,
      boqCount: p.boqRecords?.length || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const response = await successResponse(
      formattedProjects,
      'Projects retrieved successfully'
    );

    const jsonBody = await response.json();
    jsonBody.pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return Response.json(jsonBody, { status: 200 });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve projects');
  }
});

/**
 * POST /api/projects
 * Required:
 * - name
 * - department
 * - startDate
 * - endDate
 *
 * Optional:
 * - description
 * - type
 * - status
 * - progress
 * - tenderId
 * - budget
 * - contractor (Must reference Contractor.id, NEVER Employee)
 * - bOQs
 *
 * Validation:
 * - department must exist
 * - contractor must exist if supplied
 * - contractor must be a Contractor.id
 * - startDate must be before endDate
 * - progress should be between 0 and 100
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Request payload is required.', 400);
    }

    const {
      name,
      department,
      startDate,
      endDate,
      description,
      type,
      status,
      progress,
      tenderId,
      budget,
      contractor,
      firmId,
    } = body;

    // 1. Validate required fields
    const missing = [];
    if (!name || !name.trim()) missing.push('name');
    if (!department || !department.trim()) missing.push('department');
    if (!startDate) missing.push('startDate');
    if (!endDate) missing.push('endDate');

    if (missing.length > 0) {
      return errorResponse(`Missing required fields: ${missing.join(', ')}`, 400);
    }

    const trimmedName = name.trim();
    const deptId = department.trim();

    // 2. Validate department exists
    const deptRecord = await prisma.department.findUnique({
      where: { id: deptId },
    });

    if (!deptRecord) {
      return errorResponse(`Department with ID "${deptId}" not found.`, 400);
    }

    // 3. Validate contractor if supplied (MUST be Contractor.id, NEVER Employee)
    let contractorId = null;
    if (contractor !== undefined && contractor !== null && contractor !== '') {
      const trimmedContractorId = String(contractor).trim();
      if (trimmedContractorId) {
        const contractorRecord = await prisma.contractor.findUnique({
          where: { id: trimmedContractorId },
        });

        if (!contractorRecord) {
          return errorResponse(
            `Contractor with ID "${trimmedContractorId}" not found. Contractor must reference a valid Contractor.id.`,
            400
          );
        }
        contractorId = contractorRecord.id;
      }
    }

    // 4. Validate startDate and endDate
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate.getTime())) {
      return errorResponse('Invalid startDate format. Please provide a valid date string.', 400);
    }

    if (isNaN(parsedEndDate.getTime())) {
      return errorResponse('Invalid endDate format. Please provide a valid date string.', 400);
    }

    if (parsedStartDate >= parsedEndDate) {
      return errorResponse('Start date must be before end date.', 400);
    }

    // 5. Validate progress
    let parsedProgress = null;
    if (progress !== undefined && progress !== null && progress !== '') {
      const p = Number(progress);
      if (isNaN(p) || p < 0 || p > 100) {
        return errorResponse('Progress should be between 0 and 100.', 400);
      }
      parsedProgress = Math.round(p);
    }

    // 6. Validate budget
    let parsedBudget = null;
    if (budget !== undefined && budget !== null && budget !== '') {
      const b = parseFloat(budget);
      if (isNaN(b) || b < 0) {
        return errorResponse('Budget must be a non-negative number.', 400);
      }
      parsedBudget = b;
    }

    // 7. Create Project record
    const newProject = await prisma.project.create({
      data: {
        name: trimmedName,
        department: deptId,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        description: description ? description.trim() : null,
        type: type ? type.trim() : null,
        status: status ? status.trim() : 'PLANNING',
        progress: parsedProgress,
        tenderId: tenderId ? tenderId.trim() : null,
        budget: parsedBudget,
        contractor: contractorId,
        firmId: firmId ? firmId.trim() : null,
      },
      include: {
        departmentRel: true,
        contractorRel: true,
        firm: true,
        sites: { include: { manager: { select: { id: true, role: true } } } },
        boqRecords: true,
      },
    });

    const formatted = {
      id: newProject.id,
      name: newProject.name,
      description: newProject.description,
      type: newProject.type,
      status: newProject.status,
      departmentId: newProject.department,
      department: newProject.departmentRel,
      departmentRel: newProject.departmentRel,
      progress: newProject.progress,
      tenderId: newProject.tenderId,
      startDate: newProject.startDate,
      endDate: newProject.endDate,
      budget: newProject.budget,
      contractorId: newProject.contractor,
      contractor: newProject.contractorRel,
      contractorRel: newProject.contractorRel,
      firmId: newProject.firmId,
      firm: newProject.firm,
      sites: (newProject.sites || []).map(publicSite),
      boqRecords: newProject.boqRecords || [],
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt,
    };

    invalidateWarehouseOptions();
    return successResponse(formatted, 'Project created successfully', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create project');
  }
});
