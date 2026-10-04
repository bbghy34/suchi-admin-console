import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
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

export const GET = requireRoles(['AA', 'A'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const record = await prisma.boqBill.findUnique({ where: { id }, include: billInclude });
    if (!record) return notFound('BOQ bill not found.');
    const [enriched] = await withPeople([record]);
    return successResponse(presentBill(enriched), 'BOQ bill retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve BOQ bill.');
  }
});

/**
 * PUT /api/boq-bills/[id]
 */
export const PUT = requireRoles(['AA', 'A'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const existing = await prisma.boqBill.findUnique({
      where: { id },
      select: { id: true, billAmount: true, billPayment: true, billDocs: true },
    });
    if (!existing) return notFound('BOQ bill not found.');

    const incoming = await readBillBody(request);
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
    if (fields.billAmount !== undefined && fields.billAmount !== null) {
      const billAmount = parseAmount(fields.billAmount, 'Bill amount');
      if (!billAmount.ok) return errorResponse(billAmount.message, 400);
      data.billAmount = billAmount.value;
    }
    if (fields.partyId !== undefined && fields.partyId !== null) {
      const idValue = String(fields.partyId).trim();
      if (!idValue) return errorResponse('Party is required.', 400);
      const party = await prisma.party.findUnique({ where: { id: idValue }, select: { id: true } });
      if (!party) return errorResponse('Party not found.', 404);
      data.partyId = party.id;
    }
    if (fields.billPayment !== undefined && fields.billPayment !== null) {
      const billPayment = parseAmount(fields.billPayment, 'Bill payment', { allowZero: true, required: false });
      if (!billPayment.ok) return errorResponse(billPayment.message, 400);
      data.billPayment = billPayment.skip ? null : billPayment.value;
    }
    if (fields.billPaymentDate !== undefined && fields.billPaymentDate !== null) {
      const billPaymentDate = parseDateField(fields.billPaymentDate, 'Bill payment date', { required: false });
      if (!billPaymentDate.ok) return errorResponse(billPaymentDate.message, 400);
      data.billPaymentDate = billPaymentDate.value;
    }

    const existingDocs = parseTreasuryBillDocs(existing.billDocs);
    const kept = retained == null
      ? existingDocs
      : existingDocs.filter((doc) => doc.path && retained.includes(doc.path));
    const imageMessage = treasuryImagesError(files, {
      existingCount: kept.filter((doc) => doc.path).length,
      label: BILL_IMAGE.label,
      required: false,
      anyFile: true,
    });
    if (imageMessage) return errorResponse(imageMessage, 400);

    const imagesChanged = retained != null || files.length > 0;
    let uploadedPaths = [];
    if (imagesChanged) {
      const stored = files.length ? await storeBillDocuments(files, BILL_IMAGE) : { ok: true, documents: [] };
      if (!stored.ok) return errorResponse(stored.message, 400);
      uploadedPaths = stored.documents.map((item) => item.path);
      data.billDocs = [...kept.filter((doc) => doc.path), ...stored.documents];
    }

    if (Object.keys(data).length === 1) {
      await removeBillDocuments(uploadedPaths);
      return errorResponse('Nothing to update.', 400);
    }

    const nextAmount = data.billAmount ?? existing.billAmount;
    const nextPayment = Object.prototype.hasOwnProperty.call(data, 'billPayment') ? data.billPayment : existing.billPayment;
    if (nextPayment != null && nextAmount != null && nextPayment > nextAmount) {
      await removeBillDocuments(uploadedPaths);
      return errorResponse('Bill payment cannot exceed the bill amount.', 400);
    }

    let record;
    try {
      record = await prisma.boqBill.update({
        where: { id },
        data,
        include: billInclude,
      });
    } catch (error) {
      await removeBillDocuments(uploadedPaths);
      throw error;
    }

    if (imagesChanged) {
      const savedPaths = new Set(parseTreasuryBillDocs(record.billDocs).map((doc) => doc.path));
      const removed = existingDocs
        .map((doc) => doc.path)
        .filter((path) => path && !savedPaths.has(path));
      await removeBillDocuments(removed);
    }

    const [enriched] = await withPeople([record]);
    return successResponse(presentBill(enriched), 'BOQ bill updated.');
  } catch (error) {
    if (
      error.message?.includes('GCS_') ||
      error.message?.includes('bucket') ||
      error.message?.includes('S3') ||
      error.message?.includes('storage')
    ) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to update BOQ bill.');
  }
});

export const DELETE = requireRoles(['AA', 'A'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const existing = await prisma.boqBill.findUnique({
      where: { id },
      select: { id: true, billDocs: true },
    });
    if (!existing) return notFound('BOQ bill not found.');
    await prisma.boqBill.delete({ where: { id } });
    await removeBillDocuments(parseTreasuryBillDocs(existing.billDocs).map((doc) => doc.path));
    return successResponse({ id }, 'BOQ bill deleted.');
  } catch (error) {
    return handleApiError(error, 'Failed to delete BOQ bill.');
  }
});
