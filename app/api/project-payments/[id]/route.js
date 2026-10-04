import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import {
  parseAmount,
  parseBillNo,
  parseDateField,
  parseTreasuryBillDocs,
  paymentInclude,
  treasuryImagesError,
} from '@/lib/bills';
import {
  removeBillDocuments,
  retainedTreasuryBillPaths,
  storeBillDocuments,
  treasuryBillFiles,
} from '@/lib/bill-doc';
import { withPeople } from '@/lib/record-people';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);

const TREASURY_FILE = { folder: 'project-payments', label: 'Treasury bill file', anyFile: true };

function presentPayment(record) {
  return { ...record, treasuryBillDocs: parseTreasuryBillDocs(record.treasuryBillDocs) };
}

async function readPaymentBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return { error: 'Request body is required.' };
    const retained = retainedTreasuryBillPaths(formData);
    if (retained.error) return { error: retained.error };
    return {
      fields: {
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

export const GET = requireRoles(['AA', 'A'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const record = await prisma.projectPayment.findUnique({ where: { id }, include: paymentInclude });
    if (!record) return notFound('Project payment not found.');
    const [enriched] = await withPeople([record]);
    return successResponse(presentPayment(enriched), 'Project payment retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve project payment.');
  }
});

/**
 * PUT /api/project-payments/[id]
 */
export const PUT = requireRoles(['AA', 'A'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const existing = await prisma.projectPayment.findUnique({
      where: { id },
      select: { id: true, treasuryBillDocs: true },
    });
    if (!existing) return notFound('Project payment not found.');

    const incoming = await readPaymentBody(request);
    if (incoming.error) return errorResponse(incoming.error, 400);
    const { fields, files, retained } = incoming;

    const data = { updatedBy: user?.id || null };

    if (fields.billDate !== undefined && fields.billDate !== null) {
      const billDate = parseDateField(fields.billDate, 'Bill date');
      if (!billDate.ok) return errorResponse(billDate.message, 400);
      data.billDate = billDate.value;
    }
    if (fields.billNo !== undefined && fields.billNo !== null) {
      const billNo = parseBillNo(fields.billNo);
      if (!billNo.ok) return errorResponse(billNo.message, 400);
      data.billNo = billNo.value;
    }
    if (fields.paymentReceivedDate !== undefined && fields.paymentReceivedDate !== null) {
      const paymentReceivedDate = parseDateField(fields.paymentReceivedDate, 'Payment received date');
      if (!paymentReceivedDate.ok) return errorResponse(paymentReceivedDate.message, 400);
      data.paymentReceivedDate = paymentReceivedDate.value;
    }
    if (fields.amountReceived !== undefined && fields.amountReceived !== null) {
      const amountReceived = parseAmount(fields.amountReceived, 'Amount received');
      if (!amountReceived.ok) return errorResponse(amountReceived.message, 400);
      data.amountReceived = amountReceived.value;
    }

    const existingDocs = parseTreasuryBillDocs(existing.treasuryBillDocs);
    const kept = retained == null
      ? existingDocs
      : existingDocs.filter((doc) => doc.path && retained.includes(doc.path));
    const imageMessage = treasuryImagesError(files, {
      existingCount: kept.filter((doc) => doc.path).length,
      label: TREASURY_FILE.label,
      anyFile: true,
    });
    if (imageMessage) return errorResponse(imageMessage, 400);

    const imagesChanged = retained != null || files.length > 0;
    let uploadedPaths = [];
    if (imagesChanged) {
      const stored = files.length ? await storeBillDocuments(files, TREASURY_FILE) : { ok: true, documents: [] };
      if (!stored.ok) return errorResponse(stored.message, 400);
      uploadedPaths = stored.documents.map((item) => item.path);
      data.treasuryBillDocs = [...kept.filter((doc) => doc.path), ...stored.documents];
    }

    if (Object.keys(data).length === 1) return errorResponse('Nothing to update.', 400);

    let record;
    try {
      record = await prisma.projectPayment.update({
        where: { id },
        data,
        include: paymentInclude,
      });
    } catch (error) {
      await removeBillDocuments(uploadedPaths);
      throw error;
    }

    if (imagesChanged) {
      const savedPaths = new Set(parseTreasuryBillDocs(record.treasuryBillDocs).map((doc) => doc.path));
      const removed = existingDocs
        .map((doc) => doc.path)
        .filter((path) => path && !savedPaths.has(path));
      await removeBillDocuments(removed);
    }

    const [enriched] = await withPeople([record]);
    return successResponse(presentPayment(enriched), 'Project payment updated.');
  } catch (error) {
    if (
      error.message?.includes('GCS_') ||
      error.message?.includes('bucket') ||
      error.message?.includes('S3') ||
      error.message?.includes('storage')
    ) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to update project payment.');
  }
});

export const DELETE = requireRoles(['AA', 'A'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const existing = await prisma.projectPayment.findUnique({
      where: { id },
      select: { id: true, treasuryBillDocs: true },
    });
    if (!existing) return notFound('Project payment not found.');
    await prisma.projectPayment.delete({ where: { id } });
    await removeBillDocuments(parseTreasuryBillDocs(existing.treasuryBillDocs).map((doc) => doc.path));
    return successResponse({ id }, 'Project payment deleted.');
  } catch (error) {
    return handleApiError(error, 'Failed to delete project payment.');
  }
});
