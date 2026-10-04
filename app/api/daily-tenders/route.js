import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { parseTenderBody, presentTender } from '@/lib/daily-tenders';

const MODELS = {
  daily: prisma.dailyTender,
  saved: prisma.savedTender,
};

function listWhere(search) {
  if (!search) return {};
  return {
    OR: [
      { titleAndRefNo: { contains: search, mode: 'insensitive' } },
      { tenderId: { contains: search, mode: 'insensitive' } },
      { productCategory: { contains: search, mode: 'insensitive' } },
      { subCategory: { contains: search, mode: 'insensitive' } },
      { portalLink: { contains: search, mode: 'insensitive' } },
    ],
  };
}

/** Saved tenders still waiting on a result, closing within 7 days or already closed. */
function expiringPendingWhere() {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(today + 8 * 86400000);
  return {
    closingDate: { lte: cutoff },
    OR: [{ isWin: null }, { isWin: '' }],
  };
}

const RESULTS = ['win', 'loss', 'cancelled'];

/** Count and total tender value per result (win, loss, cancelled, pending) for saved tenders. */
async function resultSummary(search) {
  const groups = await prisma.savedTender.groupBy({
    by: ['isWin'],
    where: listWhere(search),
    _count: { _all: true },
    _sum: { tenderValue: true },
  });
  const summary = Object.fromEntries([...RESULTS, 'pending'].map((key) => [key, { count: 0, amount: 0n }]));
  for (const group of groups) {
    const key = RESULTS.includes(group.isWin) ? group.isWin : 'pending';
    summary[key].count += group._count._all;
    summary[key].amount += group._sum.tenderValue || 0n;
  }
  return summary;
}

/**
 * GET /api/daily-tenders?view=daily|saved
 * view=saved&summary=1 returns result counts instead of rows.
 */
export const GET = requireRoles(['A', 'M', 'T'])(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('view') === 'saved' ? 'saved' : 'daily';
    const view = user?.role === 'T' ? 'daily' : requested;
    const search = searchParams.get('search')?.trim();
    if (view === 'saved' && searchParams.get('summary') === '1') {
      return successResponse(await resultSummary(search), 'Saved tender results retrieved.');
    }
    const expiring = view === 'saved' && searchParams.get('alert') === 'expiring';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const result = view === 'saved' ? searchParams.get('result') : null;
    const where = expiring ? expiringPendingWhere() : listWhere(search);
    if (!expiring && RESULTS.includes(result)) where.isWin = result;
    if (!expiring && result === 'pending') where.AND = [{ OR: [{ isWin: null }, { isWin: { notIn: RESULTS } }] }];
    const model = MODELS[view];

    const [total, rows] = await Promise.all([
      model.count({ where }),
      model.findMany({
        where,
        skip: expiring ? 0 : (page - 1) * limit,
        take: expiring ? 50 : limit,
        orderBy: expiring ? { closingDate: 'asc' } : { id: 'desc' },
      }),
    ]);

    return successResponse(rows.map(presentTender), view === 'saved' ? 'Saved tenders retrieved.' : 'Daily tenders retrieved.', 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve tenders.');
  }
});

/**
 * POST /api/daily-tenders
 * Creates a daily tender row.
 */
export const POST = requireRoles(['T'])(async (request) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseTenderBody(body);
    if (!parsed.ok) return errorResponse(parsed.message, 400);

    const row = await prisma.dailyTender.create({ data: parsed.data });
    return successResponse(presentTender(row), 'Daily tender added.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to add daily tender.');
  }
});
