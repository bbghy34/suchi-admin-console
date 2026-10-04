import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, conflict, handleApiError } from '@/lib/api-response';
import { parseGst, parsePartyName, parsePhone } from '@/lib/bills';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


function presentParty(party) {
  return {
    id: party.id,
    name: party.name,
    phoneNo: party.phoneNo,
    gst: party.gst || null,
    billCount: party._count?.bills ?? 0,
  };
}

/**
 * GET /api/parties
 * Suggested search: ?search=name&limit=8
 */
export const GET = requireRoles(['AA', 'A'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '8', 10)));
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNo: { contains: search, mode: 'insensitive' } },
            { gst: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, parties] = await Promise.all([
      prisma.party.count({ where }),
      prisma.party.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { bills: true } } },
      }),
    ]);

    return successResponse(parties.map(presentParty), 'Parties retrieved.', 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve parties.');
  }
});

/**
 * POST /api/parties
 * Body: { name, phoneNo, gst? }
 * Refuses a second party with the same name and phone.
 */
export const POST = requireRoles(['AA', 'A'])(async (request, { user }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('Request body is required.', 400);

    const name = parsePartyName(body.name);
    const phoneNo = parsePhone(body.phoneNo);
    const gst = parseGst(body.gst);
    if (!name.ok) return errorResponse(name.message, 400);
    if (!phoneNo.ok) return errorResponse(phoneNo.message, 400);
    if (!gst.ok) return errorResponse(gst.message, 400);

    const existing = await prisma.party.findFirst({
      where: {
        name: { equals: name.value, mode: 'insensitive' },
        phoneNo: phoneNo.value,
      },
    });
    if (existing) return conflict('A party with this name and phone already exists.');

    const party = await prisma.party.create({
      data: {
        name: name.value,
        phoneNo: phoneNo.value,
        gst: gst.value,
        createdBy: user?.id || null,
        updatedBy: user?.id || null,
      },
    });
    return successResponse(presentParty(party), 'Party created.', 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create party.');
  }
});
