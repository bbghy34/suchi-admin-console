import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, handleApiError } from '@/lib/api-response';
import {
  parseAmount,
  parseBillNo,
  parseDateField,
  parseTreasuryBillDocs,
  paymentInclude,
  treasuryImagesError,
} from '@/lib/bills';
import { removeBillDocuments, retainedTreasuryBillPaths, storeBillDocuments, treasuryBillFiles } from '@/lib/bill-doc';
import { withPeople } from '@/lib/record-people';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

const TREASURY_FILE = { folder: 'project-payments', label: 'Treasury bill file', anyFile: true };

async function requireProject(projectId) {
  if (!projectId) return { error: 'Project is required.' };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: 'Project not found.' };
  return { project };
}

/**
 * GET /api/project-payments
 * Filters: projectId (required), search, page, limit
 */
export const GET = requireRoles(['AA', 'A'])(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId')?.trim();
    const search = searchParams.get('search')?.trim();
    const where = {};
    if (projectId) {
      const project = await requireProject(projectId);
      if (project.error) return errorResponse(project.error, project.error === 'Project not found.' ? 404 : 400);
      where.projectId = projectId;
    }
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const matched = await prisma.$queryRaw`
        SELECT id FROM "ProjectPayment"
        WHERE "treasuryBillDocs"::text ILIKE ${pattern} ESCAPE '\\'
      `;
      const docIds = matched.map((row) => row.id).filter(Boolean);
      where.OR = [
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
      prisma.projectPayment.count({ where }),
      prisma.projectPayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }],
        include: paymentInclude,
      }),
    ]);

    const rows = (await withPeople(records)).map(presentPayment);
    return successResponse(rows, 'Project payments retrieved successfully.', 200, {
      page: exportAll ? 1 : page,
      limit,
      total,
      totalPages: exportAll ? 1 : Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve project payments.');
  }
});

async function readPaymentBody(request) {
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
        paymentReceivedDate: formData.get('paymentReceivedDate'),
        amountReceived: formData.get('amountReceived'),
      },
      files: treasuryBillFiles(formData),
      retained: retained.paths,
    };
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return { error: 'Request body is required.' };
  return { fields: body, files: [], retained: undefined };
}

function presentPayment(record) {
  return { ...record, treasuryBillDocs: parseTreasuryBillDocs(record.treasuryBillDocs) };
}

/**
 * POST /api/project-payments
 * Multipart fields: projectId, billDate, billNo, paymentReceivedDate, amountReceived, files
 */
export const POST = requireRoles(['AA', 'A'])(async (request, { user }) => {
  let uploadedPaths = [];
  try {
    const incoming = await readPaymentBody(request);
    if (incoming.error) return errorResponse(incoming.error, 400);
    const { fields, files } = incoming;

    const project = await requireProject(String(fields.projectId || '').trim());
    if (project.error) return errorResponse(project.error, project.error === 'Project not found.' ? 404 : 400);

    const billDate = parseDateField(fields.billDate, 'Bill date');
    const billNo = parseBillNo(fields.billNo);
    const paymentReceivedDate = parseDateField(fields.paymentReceivedDate, 'Payment received date');
    const amountReceived = parseAmount(fields.amountReceived, 'Amount received');

    if (!billDate.ok) return errorResponse(billDate.message, 400);
    if (!billNo.ok) return errorResponse(billNo.message, 400);
    if (!paymentReceivedDate.ok) return errorResponse(paymentReceivedDate.message, 400);
    if (!amountReceived.ok) return errorResponse(amountReceived.message, 400);

    const imageMessage = treasuryImagesError(files, { label: TREASURY_FILE.label, anyFile: true });
    if (imageMessage) return errorResponse(imageMessage, 400);

    const stored = await storeBillDocuments(files, TREASURY_FILE);
    if (!stored.ok) return errorResponse(stored.message, 400);
    uploadedPaths = stored.documents.map((item) => item.path);

    const record = await prisma.projectPayment.create({
      data: {
        projectId: project.project.id,
        billDate: billDate.value,
        billNo: billNo.value,
        paymentReceivedDate: paymentReceivedDate.value,
        treasuryBillDocs: stored.documents,
        amountReceived: amountReceived.value,
        createdBy: user?.id || null,
        updatedBy: user?.id || null,
      },
      include: paymentInclude,
    });

    const [enriched] = await withPeople([record]);
    return successResponse(presentPayment(enriched), 'Project payment created.', 201);
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
    return handleApiError(error, 'Failed to create project payment.');
  }
});
