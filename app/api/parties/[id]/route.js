import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, conflict, handleApiError } from '@/lib/api-response';
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
 * GET /api/parties/[id]
 */
export const GET = requireRoles(['AA'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const party = await prisma.party.findUnique({
      where: { id },
      include: { _count: { select: { bills: true } } },
    });
    if (!party) return notFound('Party not found.');
    return successResponse(presentParty(party), 'Party retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve party.');
  }
});

/**
 * PUT /api/parties/[id]
 * Body: { name, phoneNo, gst? }
 */
export const PUT = requireRoles(['AA'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const existing = await prisma.party.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound('Party not found.');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorResponse('Request body is required.', 400);

    const name = parsePartyName(body.name);
    const phoneNo = parsePhone(body.phoneNo);
    const gst = parseGst(body.gst);
    if (!name.ok) return errorResponse(name.message, 400);
    if (!phoneNo.ok) return errorResponse(phoneNo.message, 400);
    if (!gst.ok) return errorResponse(gst.message, 400);

    const duplicate = await prisma.party.findFirst({
      where: {
        id: { not: id },
        name: { equals: name.value, mode: 'insensitive' },
        phoneNo: phoneNo.value,
      },
      select: { id: true },
    });
    if (duplicate) return conflict('A party with this name and phone already exists.');

    const party = await prisma.party.update({
      where: { id },
      data: {
        name: name.value,
        phoneNo: phoneNo.value,
        gst: gst.value,
        updatedBy: user?.id || null,
      },
      include: { _count: { select: { bills: true } } },
    });
    return successResponse(presentParty(party), 'Party updated.');
  } catch (error) {
    return handleApiError(error, 'Failed to update party.');
  }
});

/**
 * DELETE /api/parties/[id]
 * Refused while the party is used on a BOQ bill.
 */
export const DELETE = requireRoles(['AA'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const existing = await prisma.party.findUnique({
      where: { id },
      include: { _count: { select: { bills: true } } },
    });
    if (!existing) return notFound('Party not found.');
    if (existing._count.bills > 0) {
      return conflict('This party is used on BOQ bills. Change those bills before deleting it.');
    }
    await prisma.party.delete({ where: { id } });
    return successResponse({ id }, 'Party deleted.');
  } catch (error) {
    return handleApiError(error, 'Failed to delete party.');
  }
});
