import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { includeInactive } from '@/lib/visibility';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


/**
 * GET /api/boqs
 * Query parameters:
 * - ?page=1 &limit=10
 * - &projectId=... (filter by projectId)
 * - &siteId=...    (filter by siteId)
 * - &search=...    (matches boqCode)
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
    const siteIdFilter = searchParams.get('siteId');
    const searchFilter = searchParams.get('search');

    const where = {};

    if (projectIdFilter && projectIdFilter.trim()) {
      where.projectId = projectIdFilter.trim();
    }

    if (siteIdFilter && siteIdFilter.trim()) {
      where.siteId = siteIdFilter.trim();
    }

    if (searchFilter && searchFilter.trim()) {
      where.boqCode = { contains: searchFilter.trim(), mode: 'insensitive' };
    }

    if (!includeInactive(searchParams, user)) where.isActive = true;

    const [total, boqs] = await Promise.all([
      prisma.bOQs.count({ where }),
      prisma.bOQs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, tenderId: true, status: true },
          },
          site: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const formattedBoqs = boqs.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      boqCode: b.boqCode,
      docsLinks: b.docsLinks,
      createdAt: b.createdAt,
      validity: b.validity,
      createdBy: b.createdBy,
      siteId: b.siteId,
      project: b.project,
      site: b.site,
    }));

    if (isDropdown) {
      return successResponse(formattedBoqs, 'BOQs retrieved successfully');
    }

    return successResponse(formattedBoqs, 'BOQs retrieved successfully', 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQs');
  }
});

/**
 * POST /api/boqs
 * Creates a new BOQ record.
 *
 * Body fields:
 * - boqCode (required)
 * - projectId (optional, must reference valid Project)
 * - siteId    (optional, must reference valid Site)
 * - docsLinks (optional, JSON array of URL strings)
 * - validity  (optional, date string)
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */
export const POST = requireRoles(['A', 'M'])(async (request, context) => {
  try {
    const user = context?.user;
    const body = await request.json().catch(() => null);
    if (!body) return errorResponse('Request payload is required.', 400);

    const { boqCode, projectId, siteId, docsLinks, validity, items } = body;

    // 1. Validate BOQ Code
    if (!boqCode || typeof boqCode !== 'string' || !boqCode.trim()) {
      return errorResponse('BOQ code is required and cannot be empty.', 400);
    }

    // 2. Validate projectId if provided
    let validatedProjectId = null;
    if (projectId && String(projectId).trim()) {
      const exists = await prisma.project.findUnique({
        where: { id: String(projectId).trim() },
        select: { id: true },
      });
      if (!exists) return errorResponse(`Project "${projectId}" not found.`, 400);
      validatedProjectId = exists.id;
    }

    // 3. Validate siteId if provided
    let validatedSiteId = null;
    if (siteId && String(siteId).trim()) {
      const exists = await prisma.site.findUnique({
        where: { id: String(siteId).trim() },
        select: { id: true },
      });
      if (!exists) return errorResponse(`Site "${siteId}" not found.`, 400);
      validatedSiteId = exists.id;
    }

    // 4. Parse docsLinks — must be an array of strings or null
    let parsedDocsLinks = null;
    if (docsLinks !== undefined && docsLinks !== null && docsLinks !== '') {
      if (Array.isArray(docsLinks)) {
        parsedDocsLinks = docsLinks;
      } else if (typeof docsLinks === 'string') {
        try {
          const parsed = JSON.parse(docsLinks);
          parsedDocsLinks = Array.isArray(parsed) ? parsed : [docsLinks];
        } catch {
          // treat single string as one-element array
          parsedDocsLinks = [docsLinks];
        }
      }
    }

    // 5. Validate validity date
    let validityDate = null;
    if (validity) {
      const d = new Date(validity);
      if (isNaN(d.getTime())) return errorResponse('Invalid validity date format.', 400);
      validityDate = d;
    }

    const hasItems = Array.isArray(items) && items.length > 0;

    const newBoq = await prisma.bOQs.create({
      data: {
        boqCode: boqCode.trim(),
        projectId: validatedProjectId,
        siteId: validatedSiteId,
        docsLinks: parsedDocsLinks,
        validity: validityDate,
        createdBy: user?.id ?? null,
        items: hasItems
          ? {
              create: items.map((r, i) => ({
                slNo: r.slNo ? String(r.slNo) : String(i + 1),
                itemName: r.itemName ? String(r.itemName) : 'Item',
                specification: r.specification || null,
                unit: r.unit || null,
                quantity: r.quantity ? String(r.quantity) : null,
                rate: r.rate != null ? parseFloat(r.rate) || null : null,
                amount: r.amount != null ? parseFloat(r.amount) || null : null,
                remarks: r.remarks || null,
                createdBy: user?.id ?? null,
              })),
            }
          : undefined,
      },
      include: {
        project: { select: { id: true, name: true, tenderId: true } },
        site: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });

    const itemsCount = newBoq._count?.items ?? 0;

    return successResponse(
      {
        id: newBoq.id,
        projectId: newBoq.projectId,
        boqCode: newBoq.boqCode,
        docsLinks: newBoq.docsLinks,
        createdAt: newBoq.createdAt,
        validity: newBoq.validity,
        createdBy: newBoq.createdBy,
        siteId: newBoq.siteId,
        project: newBoq.project,
        site: newBoq.site,
        itemsCount,
      },
      itemsCount > 0
        ? `BOQ record created and ${itemsCount} line item(s) imported successfully`
        : 'BOQ record created successfully',
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to create BOQ record');
  }
});
