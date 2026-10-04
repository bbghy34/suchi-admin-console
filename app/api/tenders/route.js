import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { onlyActive } from '@/lib/visibility';

/** Projects that already store a tender reference. Files live in TenderFile. */
export const GET = requireRoles(['A', 'M'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const where = onlyActive(
      {
        AND: [{ tenderId: { not: null } }, { NOT: { tenderId: '' } }],
      },
      searchParams,
      user
    );

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        tenderId: true,
        status: true,
        type: true,
        progress: true,
        budget: true,
        startDate: true,
        endDate: true,
        isActive: true,
        departmentRel: { select: { name: true } },
        contractorRel: { select: { name: true } },
        firm: { select: { name: true } },
      },
    });

    const data = projects
      .filter((item) => item.tenderId && String(item.tenderId).trim())
      .map((item) => ({
        id: item.id,
        name: item.name,
        tenderId: String(item.tenderId).trim(),
        status: item.status,
        type: item.type,
        progress: item.progress,
        budget: item.budget,
        startDate: item.startDate,
        endDate: item.endDate,
        isActive: item.isActive,
        department: item.departmentRel?.name || null,
        contractor: item.contractorRel?.name || null,
        firm: item.firm?.name || null,
      }));

    return successResponse(data, 'Tender references retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve tender references.');
  }
});
