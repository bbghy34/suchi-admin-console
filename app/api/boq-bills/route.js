import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import {
  billInclude,
  parseAmount,
  parseBillNo,
  parseDateField,
  parseTreasuryBillDocs,
  treasuryImagesError,
} from '@/lib/bills';
import { removeBillDocuments, retainedTreasuryBillPaths, storeBillDocuments, treasuryBillFiles } from '@/lib/bill-doc';
import { withPeople } from '@/lib/record-people';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const BILL_IMAGE = { folder: 'boq-bills', label: 'Bill file', anyFile: true };

function presentBill(record) {
  return { ...record, billDocs: parseTreasuryBillDocs(record.billDocs) };
}

async function readBillBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return { error: 'Request body is required.' };
    const retained = retainedTreasuryBillPaths(formData);
    if (retained.error) return { error: retained.error };
    return {
      fields: {
        projectId: formData.get('projectId'),
        billDate: formData.get('billDate'),
        billNo: formData.get('billNo'),
        billAmount: formData.get('billAmount'),
        partyId: formData.get('partyId'),
        billPayment: formData.get('billPayment'),
        billPaymentDate: formData.get('billPaymentDate'),
      },
      files: treasuryBillFiles(formData),
      retained: retained.paths,
    };
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return { error: 'Request body is required.' };
  return { fields: body, files: [], retained: undefined };
}

async function requireProject(projectId) {
  if (!projectId) return { error: 'Project is required.' };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: 'Project not found.' };
  return { project };
}

async function requireParty(partyId) {
  const id = String(partyId ?? '').trim();
  if (!id) return { error: 'Party is required.' };
  const party = await prisma.party.findUnique({ where: { id }, select: { id: true } });
  if (!party) return { error: 'Party not found.' };
  return { party };
}

/**
 * GET /api/boq-bills
 * Filters: projectId (required), search, page, limit
 */
export const GET = requireRoles(['AA', 'A'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId')?.trim();
    const partyId = searchParams.get('partyId')?.trim();
    const search = searchParams.get('search')?.trim();
    const where = {};
    if (projectId) {
      const project = await requireProject(projectId);
      if (project.error) return errorResponse(project.error, project.error === 'Project not found.' ? 404 : 400);
      where.projectId = projectId;
    }
    if (partyId) {
      const party = await requireParty(partyId);
      if (party.error) return errorResponse(party.error, party.error === 'Party not found.' ? 404 : 400);
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

    const exportAll = searchParams.get('limit') === 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = exportAll ? 2000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const skip = exportAll ? 0 : (page - 1) * limit;

    const [total, records] = await Promise.all([
      prisma.boqBill.count({ where }),
      prisma.boqBill.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }],
        include: billInclude,
      }),
    ]);

    const rows = (await withPeople(records)).map(presentBill);
    return successResponse(rows, 'BOQ bills retrieved successfully.', 200, {
      page: exportAll ? 1 : page,
      limit,
      total,
      totalPages: exportAll ? 1 : Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQ bills.');
  }
});

/**
 * POST /api/boq-bills
 * Multipart fields plus files (one or more bill images).
 */
export const POST = requireRoles(['AA', 'A'])(async (request, { user }) => {
  let uploadedPaths = [];
  try {
    const incoming = await readBillBody(request);
    if (incoming.error) return errorResponse(incoming.error, 400);
    const { fields, files } = incoming;

    const project = await requireProject(String(fields.projectId || '').trim());
    if (project.error) return errorResponse(project.error, project.error === 'Project not found.' ? 404 : 400);

    const billDate = parseDateField(fields.billDate, 'Bill date');
    const billNo = parseBillNo(fields.billNo);
    const billAmount = parseAmount(fields.billAmount, 'Bill amount');
    const party = await requireParty(fields.partyId);
    const billPayment = parseAmount(fields.billPayment, 'Bill payment', { allowZero: true, required: false });
    const billPaymentDate = parseDateField(fields.billPaymentDate, 'Bill payment date', { required: false });

    if (!billDate.ok) return errorResponse(billDate.message, 400);
    if (!billNo.ok) return errorResponse(billNo.message, 400);
    if (!billAmount.ok) return errorResponse(billAmount.message, 400);
    if (party.error) return errorResponse(party.error, party.error === 'Party not found.' ? 404 : 400);
    if (!billPayment.ok) return errorResponse(billPayment.message, 400);
    if (!billPaymentDate.ok) return errorResponse(billPaymentDate.message, 400);
    if (!billPayment.skip && billPayment.value > billAmount.value) {
      return errorResponse('Bill payment cannot exceed the bill amount.', 400);
    }

    const imageMessage = treasuryImagesError(files, { label: BILL_IMAGE.label, required: false, anyFile: true });
    if (imageMessage) return errorResponse(imageMessage, 400);

    const stored = files.length ? await storeBillDocuments(files, BILL_IMAGE) : { ok: true, documents: [] };
    if (!stored.ok) return errorResponse(stored.message, 400);
    uploadedPaths = stored.documents.map((item) => item.path);

    const record = await prisma.boqBill.create({
      data: {
        projectId: project.project.id,
        billDate: billDate.value,
        billNo: billNo.value,
        billAmount: billAmount.value,
        partyId: party.party.id,
        billPayment: billPayment.skip ? null : billPayment.value,
        billPaymentDate: billPaymentDate.value,
        billDocs: stored.documents,
        createdBy: user?.id || null,
        updatedBy: user?.id || null,
      },
      include: billInclude,
    });

    const [enriched] = await withPeople([record]);
    return successResponse(presentBill(enriched), 'BOQ bill created.', 201);
  } catch (error) {
    await removeBillDocuments(uploadedPaths);
    if (
      error.message?.includes('GCS_') ||
      error.message?.includes('bucket') ||
      error.message?.includes('S3') ||
      error.message?.includes('storage')
    ) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to create BOQ bill.');
  }
});
