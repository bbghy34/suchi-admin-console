import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { onlyActive } from '@/lib/visibility';
import { uploadToGCS } from '@/lib/gcs';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const MAX_SIZE = 8 * 1024 * 1024;

function parseCoordinate(value, min, max, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { ok: false, message: `${label} must be a number between ${min} and ${max}.` };
  }
  return { ok: true, value: num };
}

/**
 * GET /api/progress?siteId=&projectId=
 * Lists site progress photos. Deactivated rows are hidden unless an admin asks for them.
 */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId')?.trim();
    const projectId = searchParams.get('projectId')?.trim();
    const search = searchParams.get('search')?.trim();
    const fromDate = searchParams.get('fromDate')?.trim();
    const toDate = searchParams.get('toDate')?.trim();
    const sortBy = searchParams.get('sortBy')?.trim() || 'createdAt';
    const sortOrder = searchParams.get('sortOrder')?.trim()?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const isDropdown = searchParams.get('dropdown') === 'true' || searchParams.get('limit') === 'all';
    const isLegacySiteQuery = !searchParams.has('page') && !searchParams.has('search') && !searchParams.has('fromDate') && Boolean(siteId);

    const where = onlyActive({}, searchParams, user);
    if (siteId) where.siteId = siteId;
    if (projectId) where.projectId = projectId;

    if (search) {
      where.OR = [
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { site: { name: { contains: search, mode: 'insensitive' } } },
        { createdBy: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!isNaN(d.getTime())) {
          if (toDate.length === 10) d.setHours(23, 59, 59, 999);
          where.createdAt.lte = d;
        }
      }
    }

    let orderBy = { createdAt: 'desc' };
    if (sortBy === 'project') {
      orderBy = { project: { name: sortOrder } };
    } else if (sortBy === 'site') {
      orderBy = { site: { name: sortOrder } };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    }

    const progressInclude = {
      project: {
        select: {
          id: true,
          name: true,
          tenderId: true,
          status: true,
          budget: true,
          type: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
          address: true,
          coordinates: true,
          status: true,
          manager: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      },
    };

    if (isDropdown || isLegacySiteQuery) {
      const records = await prisma.progress.findMany({
        where,
        orderBy,
        include: progressInclude,
      });

      const creatorIds = Array.from(new Set(records.map((r) => r.createdBy).filter(Boolean)));
      const creators = creatorIds.length > 0
        ? await prisma.employee.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, name: true, email: true, role: true },
          })
        : [];
      const creatorMap = new Map(creators.map((c) => [c.id, c]));

      const enrichedRecords = records.map((r) => ({
        ...r,
        creator: creatorMap.get(r.createdBy) || (r.createdBy ? { id: r.createdBy, name: r.createdBy } : null),
      }));

      return successResponse(enrichedRecords, 'Site progress retrieved successfully.');
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
      prisma.progress.count({ where }),
      prisma.progress.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: progressInclude,
      }),
    ]);

    const creatorIds = Array.from(new Set(records.map((r) => r.createdBy).filter(Boolean)));
    const creators = creatorIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const creatorMap = new Map(creators.map((c) => [c.id, c]));

    const enrichedRecords = records.map((r) => ({
      ...r,
      creator: creatorMap.get(r.createdBy) || (r.createdBy ? { id: r.createdBy, name: r.createdBy } : null),
    }));

    return successResponse(enrichedRecords, 'Site progress retrieved successfully.', 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve site progress.');
  }
});

/**
 * POST /api/progress
 * multipart/form-data: file, projectId, siteId, latitude, longitude
 * The photo is stored in Google Cloud and the saved URL is the images column.
 */
export const POST = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) return errorResponse('Multipart form data is required.', 400);

    const projectId = String(formData.get('projectId') || '').trim();
    const siteId = String(formData.get('siteId') || '').trim();
    const latitude = parseCoordinate(formData.get('latitude'), -90, 90, 'Latitude');
    const longitude = parseCoordinate(formData.get('longitude'), -180, 180, 'Longitude');
    const file = formData.get('file');

    if (!projectId) return errorResponse('projectId is required.', 400);
    if (!siteId) return errorResponse('siteId is required.', 400);
    if (!latitude.ok) return errorResponse(latitude.message, 400);
    if (!longitude.ok) return errorResponse(longitude.message, 400);
    if (!file || typeof file === 'string') return errorResponse('A progress image is required.', 400);

    const filename = file.name || 'progress.jpg';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !IMAGE_EXTS.includes(ext)) {
      return errorResponse('Only image files (.jpg, .jpeg, .png, .webp, .gif) are accepted.', 400);
    }
    if (file.size && file.size > MAX_SIZE) {
      return errorResponse('Progress image size must not exceed 8MB.', 400);
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) return errorResponse('Project not found.', 400);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, projectId: true },
    });
    if (!site) return errorResponse('Site not found.', 400);
    if (site.projectId && site.projectId !== projectId) {
      return errorResponse('This site is not assigned to the selected project.', 400);
    }

    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const buffer = Buffer.from(await file.arrayBuffer());
    const { gcsPath } = await uploadToGCS(buffer, filename, `site-progress/${siteId}`, file.type || mimeMap[ext]);

    const record = await prisma.progress.create({
      data: {
        projectId,
        siteId,
        images: `/api/files/${gcsPath}`,
        latitude: latitude.value,
        longitude: longitude.value,
        createdBy: user?.id || null,
      },
      include: {
        project: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
      },
    });

    return successResponse(record, 'Site progress photo saved.', 201);
  } catch (error) {
    if (error.message?.includes('GCS_') || error.message?.includes('bucket') || error.message?.includes('S3')) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to save site progress.');
  }
});
