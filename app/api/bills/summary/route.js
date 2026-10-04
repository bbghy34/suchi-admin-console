import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, notFound, handleApiError } from '@/lib/api-response';
import { buildBillSummary } from '@/lib/bills';

async function chartWhereFor(searchParams, projectId) {
  const partyId = searchParams.get('partyId')?.trim() || '';
  const search = searchParams.get('search')?.trim() || '';
  const where = {};
  if (projectId) where.projectId = projectId;
  if (partyId) {
    const party = await prisma.party.findUnique({ where: { id: partyId }, select: { id: true } });
    if (!party) return { error: 'Party not found.' };
    where.partyId = partyId;
  }
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const matched = await prisma.$queryRaw`
      SELECT id FROM "BoqBill"
      WHERE "billDocs"::text ILIKE ${pattern} ESCAPE '\\'
    `;
    const docIds = matched.map((row) => row.id).filter(Boolean);
    where.OR = [
      { party: { name: { contains: search, mode: 'insensitive' } } },
      { party: { phoneNo: { contains: search, mode: 'insensitive' } } },
      { billNo: { contains: search.toUpperCase() } },
      { project: { name: { contains: search, mode: 'insensitive' } } },
      ...(docIds.length ? [{ id: { in: docIds } }] : []),
    ];
  }
  return { where, active: Boolean(projectId || partyId || search) };
}

/**
 * GET /api/bills/summary?projectId=&partyId=&search=
 * Budget, received, and BOQ totals. Omit projectId to include every project.
 * partyId and search narrow the party bill chart only.
 */
export const GET = requireRoles(['AA', 'A'])(async (request) => {
  try {
    const searchParams = new URL(request.url).searchParams;
    const projectId = searchParams.get('projectId')?.trim();

    let project = null;
    if (projectId) {
      project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, budget: true, status: true },
      });
      if (!project) return notFound('Project not found.');
    }

    const paymentWhere = projectId ? { projectId } : {};
    const billWhere = projectId ? { projectId } : {};

    const [budgetAgg, payments, paymentCount, bills, billCount] = await Promise.all([
      project
        ? Promise.resolve({ _sum: { budget: project.budget } })
        : prisma.project.aggregate({
            where: { isActive: true },
            _sum: { budget: true },
          }),
      prisma.projectPayment.aggregate({
        where: paymentWhere,
        _sum: { amountReceived: true },
      }),
      prisma.projectPayment.count({ where: paymentWhere }),
      prisma.boqBill.aggregate({
        where: billWhere,
        _sum: { billAmount: true, billPayment: true },
      }),
      prisma.boqBill.count({ where: billWhere }),
    ]);

    const chartFilter = await chartWhereFor(searchParams, projectId);
    if (chartFilter.error) return notFound(chartFilter.error);

    let partyBills = [];
    if (chartFilter.active) {
      const groups = await prisma.boqBill.groupBy({
        by: ['partyId'],
        where: chartFilter.where,
        _sum: { billAmount: true },
        _count: { _all: true },
      });
      const partyIds = groups.map((row) => row.partyId).filter(Boolean);
      const parties = partyIds.length
        ? await prisma.party.findMany({
            where: { id: { in: partyIds } },
            select: { id: true, name: true },
          })
        : [];
      const names = new Map(parties.map((party) => [party.id, party.name]));
      partyBills = groups
        .map((row) => ({
          partyId: row.partyId,
          name: names.get(row.partyId) || 'Party',
          amount: Number(row._sum.billAmount ?? 0),
          count: row._count._all,
        }))
        .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
    }

    const summary = buildBillSummary({
      budget: budgetAgg._sum.budget,
      received: payments._sum.amountReceived ?? 0n,
      billed: bills._sum.billAmount ?? 0n,
      paid: bills._sum.billPayment ?? 0n,
      paymentCount,
      billCount,
    });

    return successResponse(
      {
        project: project
          ? {
              id: project.id,
              name: project.name,
              status: project.status,
              budget: project.budget,
            }
          : null,
        scope: projectId ? 'project' : 'all',
        partyBills,
        ...summary,
      },
      'Bill summary retrieved.'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve the bill summary.');
  }
});
