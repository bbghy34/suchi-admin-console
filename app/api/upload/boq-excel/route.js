/**
 * POST /api/upload/boq-excel
 *
 * Accepts a multipart/form-data upload with:
 *   - file   : the Excel / CSV file
 *   - boqId  : the parent BOQ id (required)
 *
 * Steps:
 * 1. Validates auth and boqId
 * 2. Uploads file to GCS under boq-files/<boqId>/
 * 3. Appends the public GCS URL to BOQs.docsLinks JSON array
 * 4. Parses the Excel with xlsx and bulk-inserts rows into BOQItems
 * 5. Returns { gcsUrl, count } to the client
 *
 * Authenticated: ADMIN ('A') and MANAGER ('M').
 */

import { requireRoles } from '@/lib/auth';
import { errorResponse, successResponse, handleApiError } from '@/lib/api-response';
import { uploadToGCS } from '@/lib/gcs';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export const POST = requireRoles(['A', 'M'])(async (request, context) => {
  try {
    const user = context?.user;

    // --- Parse multipart form data ---
    const formData = await request.formData().catch(() => null);
    if (!formData) return errorResponse('Multipart form data is required.', 400);

    const file = formData.get('file');
    const boqId = formData.get('boqId');

    if (!file || typeof file === 'string') return errorResponse('No file provided.', 400);
    if (!boqId) return errorResponse('boqId is required.', 400);

    // --- Validate BOQ exists ---
    const boq = await prisma.bOQs.findUnique({ where: { id: boqId }, select: { id: true, docsLinks: true } });
    if (!boq) return errorResponse(`BOQ with id "${boqId}" not found.`, 404);

    // --- Validate file type ---
    const filename = file.name || 'upload.xlsx';
    const ext = filename.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return errorResponse('Only .xlsx, .xls, or .csv files are accepted.', 400);
    }

    const mimeMap = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv' };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    // --- Upload to GCS ---
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { publicUrl } = await uploadToGCS(buffer, filename, `boq-files/${boqId}`, mimeType);

    // --- Append GCS URL to BOQs.docsLinks ---
    const existingLinks = Array.isArray(boq.docsLinks) ? boq.docsLinks : boq.docsLinks ? [boq.docsLinks] : [];
    await prisma.bOQs.update({
      where: { id: boqId },
      data: { docsLinks: [...existingLinks, publicUrl] },
    });

    // --- Parse Excel and insert BOQItems ---
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    let insertedCount = 0;

    if (ws) {
      const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const headerKeywords = ['description', 'item', 'work', 'particulars', 'qty', 'quantity', 'unit', 'rate', 'amount', 'sl'];
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(10, rows2D.length); r++) {
        const rowValues = (rows2D[r] || []).map((v) => String(v).trim().toLowerCase());
        const matchedCount = headerKeywords.filter((kw) => rowValues.some((v) => v.includes(kw))).length;
        if (matchedCount >= 2) {
          headerRowIdx = r;
          break;
        }
      }

      const rawRows = XLSX.utils.sheet_to_json(ws, { range: headerRowIdx, defval: '' });

      const get = (row, ...keys) => {
        for (const k of keys) {
          const match = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
          if (match !== undefined && row[match] !== '' && row[match] != null) return String(row[match]).trim();
        }
        return null;
      };

      const parseNum = (val) => {
        if (val == null) return null;
        const clean = String(val).replace(/[^0-9.-]/g, '');
        const n = parseFloat(clean);
        return isNaN(n) ? null : n;
      };

      const items = rawRows
        .map((row, i) => {
          const name = get(row, 'description of work', 'item description', 'description', 'particulars', 'item name', 'item', 'work description', 'scope of work', 'name');
          const slNo = get(row, 'sl no', 'sl.no', 'slno', 'serial no', 's.no', 'sr no', 'sr.no', 'item no', 'no', '#') || String(i + 1);
          const specification = get(row, 'specification', 'specifications', 'specs', 'spec', 'details', 'make/brand');
          const unit = get(row, 'unit', 'uom', 'units', 'measuring unit');
          const quantity = get(row, 'quantity', 'qty', 'quantities', 'nos', 'no.');
          const rate = parseNum(get(row, 'rate', 'unit rate', 'price', 'unit price', 'rate (inr)', 'rate (rs)'));
          const amount = parseNum(get(row, 'amount', 'total', 'total amount', 'total cost', 'cost', 'total (inr)', 'amount (inr)', 'net amount'));
          const remarks = get(row, 'remarks', 'remark', 'note', 'notes', 'comments');

          return {
            boqId,
            slNo,
            itemName: name || (quantity || unit ? `Item ${i + 1}` : null),
            specification,
            unit,
            quantity: quantity || null,
            rate,
            amount,
            remarks,
            itemLeft: null,
            itemReceivedTotalQuantity: null,
            itemReceivedImage: null,
            extraItem: null,
            createdBy: user?.id ?? null,
          };
        })
        .filter((it) => it.itemName && it.itemName !== '—' && it.itemName.toLowerCase() !== 'total' && it.itemName.toLowerCase() !== 'grand total');

      if (items.length > 0) {
        const result = await prisma.bOQItems.createMany({ data: items, skipDuplicates: false });
        insertedCount = result.count;
      }
    }

    return successResponse(
      { gcsUrl: publicUrl, count: insertedCount, boqId },
      `File uploaded to GCS and ${insertedCount} item(s) imported successfully.`,
      201
    );
  } catch (error) {
    // GCS not configured — give a helpful message
    if (error.message?.includes('GCS_') || error.message?.includes('bucket') || error.message?.includes('S3')) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to upload BOQ file');
  }
});

export const config = { api: { bodyParser: false } };
