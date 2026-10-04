import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { setActiveHandler } from '@/lib/visibility';
import { successResponse as baseSuccessResponse, notFound, handleApiError } from '@/lib/api-response';
import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

export const GET = requireRoles(['A', 'M'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const record = await prisma.progress.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
      },
    });
    if (!record) return notFound('Progress record not found.');
    return successResponse(record, 'Progress record retrieved successfully.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve progress record.');
  }
});

const progressActive = setActiveHandler(prisma.progress, 'Progress record');
export const PATCH = progressActive;
export const DELETE = progressActive;
