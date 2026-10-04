import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { uploadToGCS } from '@/lib/gcs';
import { successResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import {
  DELIVERY_IMAGE_EXTS,
  parseImagesArray,
  parseCoordinate,
  parseDeliveryQuantity,
  nextReceivedTotals,
  employeeCanRecordDelivery,
} from '@/lib/boq-delivery';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit

/**
 * POST /api/upload/boq-item-image
 * Same delivery record as /api/boq-items/[id]/images.
 * - boqItemId: ID of the BOQ item (required)
 * - file: Image file (.jpg, .jpeg, .png, .webp, .gif)
 * - quantity: amount delivered with this photo (required)
 * - lat / latitude, long / longitude (optional)
 * - slNo (optional)
 */
export const POST = requireRoles(['A', 'M', 'E'])(async (request, { user }) => {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) return errorResponse('Multipart form data is required.', 400);

    const boqItemId = String(formData.get('boqItemId') || formData.get('id') || '').trim();
    if (!boqItemId) return errorResponse('boqItemId is required.', 400);

    const item = await prisma.bOQItems.findUnique({
      where: { id: boqItemId },
      select: {
        id: true,
        itemReceivedImage: true,
        itemReceivedTotalQuantity: true,
        itemLeft: true,
        quantity: true,
        unit: true,
        boqId: true,
      },
    });
    if (!item) return notFound('BOQ item not found.');

    if (user?.role === 'E') {
      const [boq, employee] = await Promise.all([
        item.boqId
          ? prisma.bOQs.findUnique({ where: { id: item.boqId }, select: { siteId: true } })
          : null,
        prisma.employee.findUnique({ where: { id: user.id }, select: { siteId: true } }),
      ]);
      if (!employeeCanRecordDelivery(user.role, employee?.siteId, boq?.siteId)) {
        return errorResponse('You can record deliveries only for your assigned site.', 403);
      }
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('An image file is required.', 400);
    }

    const filename = file.name || 'received-item.jpg';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !DELIVERY_IMAGE_EXTS.includes(ext)) {
      return errorResponse(`Only image files (${DELIVERY_IMAGE_EXTS.join(', ')}) are accepted.`, 400);
    }

    const qtyParsed = parseDeliveryQuantity(
      formData.get('quantity') ?? formData.get('qty') ?? formData.get('receivedQuantity')
    );
    if (!qtyParsed.ok) return errorResponse(qtyParsed.message, 400);

    if (file.size && file.size > MAX_SIZE) {
      return errorResponse('Image file size must not exceed 10MB.', 400);
    }

    const rawLat = formData.get('lat') ?? formData.get('latitude');
    const rawLong = formData.get('long') ?? formData.get('lng') ?? formData.get('longitude');

    const latParsed = parseCoordinate(rawLat, -90, 90, 'Latitude');
    if (!latParsed.ok) return errorResponse(latParsed.message, 400);

    const longParsed = parseCoordinate(rawLong, -180, 180, 'Longitude');
    if (!longParsed.ok) return errorResponse(longParsed.message, 400);

    const currentImages = parseImagesArray(item.itemReceivedImage);

    const customSlNo = formData.get('slNo');
    let nextSlNo = currentImages.length + 1;
    if (customSlNo !== null && customSlNo !== undefined && String(customSlNo).trim() !== '') {
      const parsedNum = Number(customSlNo);
      nextSlNo = Number.isFinite(parsedNum) ? parsedNum : String(customSlNo).trim();
    }

    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mimeType = file.type || mimeMap[ext] || 'application/octet-stream';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { gcsPath, publicUrl } = await uploadToGCS(
      buffer,
      filename,
      `boq-received-images/${boqItemId}`,
      mimeType
    );

    const imageLink = `/api/files/${gcsPath}`;

    const newEntry = {
      slNo: nextSlNo,
      imageLink,
      lat: latParsed.value,
      long: longParsed.value,
      quantity: qtyParsed.value,
      createdAt: new Date().toISOString(),
      createdBy: user?.id || null,
    };

    const updatedImages = [...currentImages, newEntry];
    const totals = nextReceivedTotals({
      ordered: item.quantity,
      currentReceived: item.itemReceivedTotalQuantity,
      currentLeft: item.itemLeft,
      delta: qtyParsed.value,
    });

    const updatedItem = await prisma.bOQItems.update({
      where: { id: boqItemId },
      data: {
        itemReceivedImage: updatedImages,
        itemReceivedTotalQuantity: totals.itemReceivedTotalQuantity,
        itemLeft: totals.itemLeft,
        updatedBy: user?.id || null,
      },
      select: {
        id: true,
        slNo: true,
        itemName: true,
        unit: true,
        quantity: true,
        itemReceivedTotalQuantity: true,
        itemLeft: true,
        itemReceivedImage: true,
      },
    });

    return successResponse(
      {
        boqItemId: updatedItem.id,
        unit: updatedItem.unit,
        quantity: updatedItem.quantity,
        itemReceivedTotalQuantity: updatedItem.itemReceivedTotalQuantity,
        itemLeft: updatedItem.itemLeft,
        newEntry,
        images: updatedImages,
        directGcsUrl: publicUrl,
      },
      'Received delivery photo uploaded to storage and linked to BOQ item successfully.',
      201
    );
  } catch (error) {
    if (error.message?.includes('GCS_') || error.message?.includes('bucket') || error.message?.includes('S3')) {
      return errorResponse(`File storage is not configured: ${error.message}`, 503);
    }
    return handleApiError(error, 'Failed to upload received image.');
  }
});
