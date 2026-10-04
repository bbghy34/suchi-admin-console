import { hideLuitAdminResponse } from '@/lib/luit-admin/privacy.mjs';
import prisma from '@/lib/prisma';
import { requireRoles } from '@/lib/auth';
import { uploadToGCS, deleteFromGCS } from '@/lib/gcs';
import { successResponse as baseSuccessResponse, errorResponse, notFound, handleApiError } from '@/lib/api-response';
import {
  DELIVERY_IMAGE_EXTS,
  parseImagesArray,
  parseCoordinate,
  parseDeliveryQuantity,
  parseQty,
  nextReceivedTotals,
  employeeCanRecordDelivery,
} from '@/lib/boq-delivery';

const successResponse = (...args) => hideLuitAdminResponse(prisma, baseSuccessResponse, ...args);


const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit

async function assertDeliveryAccess(user, boqId) {
  if (user?.role !== 'E') return null;
  const [boq, employee] = await Promise.all([
    boqId
      ? prisma.bOQs.findUnique({ where: { id: boqId }, select: { siteId: true } })
      : null,
    prisma.employee.findUnique({ where: { id: user.id }, select: { siteId: true } }),
  ]);
  if (!employeeCanRecordDelivery(user.role, employee?.siteId, boq?.siteId)) {
    return errorResponse('You can record deliveries only for your assigned site.', 403);
  }
  return null;
}

/**
 * GET /api/boq-items/[id]/images
 * Returns the array of received images for a given BOQ line item,
 * with creator employee details enriched where available.
 */
export const GET = requireRoles(['A', 'M', 'E'])(async (request, { params }) => {
  try {
    const { id } = await params;
    const item = await prisma.bOQItems.findUnique({
      where: { id },
      select: {
        id: true,
        boqId: true,
        slNo: true,
        itemName: true,
        itemReceivedImage: true,
        itemReceivedTotalQuantity: true,
        itemLeft: true,
        quantity: true,
        unit: true,
      },
    });

    if (!item) return notFound('BOQ item not found.');

    const images = parseImagesArray(item.itemReceivedImage);

    // Enrich with creator details
    const userIds = [...new Set(images.map((img) => img?.createdBy).filter(Boolean))];
    let empMap = {};
    if (userIds.length > 0) {
      const employees = await prisma.employee.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, employeeCode: true, role: true },
      });
      empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
    }

    const enriched = images.map((img) => ({
      ...img,
      creator: img?.createdBy ? empMap[img.createdBy] || null : null,
    }));

    return successResponse({
      boqItemId: item.id,
      itemName: item.itemName,
      slNo: item.slNo,
      quantity: item.quantity,
      unit: item.unit,
      itemReceivedTotalQuantity: item.itemReceivedTotalQuantity,
      itemLeft: item.itemLeft,
      images: enriched,
    }, 'Received images retrieved successfully.');
  } catch (error) {
    return handleApiError(error, 'Failed to retrieve received images.');
  }
});

/**
 * POST /api/boq-items/[id]/images
 * Multipart form data:
 * - file: Image file (.jpg, .jpeg, .png, .webp, .gif)
 * - quantity: amount delivered with this photo, in the line item's unit (required)
 * - lat / latitude: GPS latitude (optional)
 * - long / longitude: GPS longitude (optional)
 * - slNo: Custom serial number (optional, defaults to current count + 1)
 *
 * Uploads image to GCS under 'boq-received-images/<boqItemId>/'
 * and appends { slNo, imageLink, quantity, lat, long, createdAt, createdBy }.
 * The line item's received total and quantity left are updated from that amount.
 */
export const POST = requireRoles(['A', 'M', 'E'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const item = await prisma.bOQItems.findUnique({
      where: { id },
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

    const denied = await assertDeliveryAccess(user, item.boqId);
    if (denied) return denied;

    const formData = await request.formData().catch(() => null);
    if (!formData) return errorResponse('Multipart form data is required.', 400);

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

    // Existing images
    const currentImages = parseImagesArray(item.itemReceivedImage);

    // Serial number
    const customSlNo = formData.get('slNo');
    let nextSlNo = currentImages.length + 1;
    if (customSlNo !== null && customSlNo !== undefined && String(customSlNo).trim() !== '') {
      const parsedNum = Number(customSlNo);
      nextSlNo = Number.isFinite(parsedNum) ? parsedNum : String(customSlNo).trim();
    }

    // Upload to GCS
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
      `boq-received-images/${id}`,
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
      where: { id },
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

/**
 * DELETE /api/boq-items/[id]/images
 * Query params or JSON body:
 * - ?index=0 (0-based index)
 * - OR ?slNo=1
 * - OR ?imageLink=/api/files/...
 *
 * Removes the image from the itemReceivedImage JSON array.
 * Optionally attempts GCS deletion if gcsPath is resolvable.
 */
export const DELETE = requireRoles(['A', 'M'])(async (request, { params, user }) => {
  try {
    const { id } = await params;
    const item = await prisma.bOQItems.findUnique({
      where: { id },
      select: {
        id: true,
        itemReceivedImage: true,
        itemReceivedTotalQuantity: true,
        itemLeft: true,
        quantity: true,
        unit: true,
      },
    });

    if (!item) return notFound('BOQ item not found.');

    const currentImages = parseImagesArray(item.itemReceivedImage);
    if (currentImages.length === 0) {
      return errorResponse('No received images found for this item.', 400);
    }

    const { searchParams } = new URL(request.url);
    const indexParam = searchParams.get('index');
    const slNoParam = searchParams.get('slNo');
    const imageLinkParam = searchParams.get('imageLink');

    let removeIdx = -1;

    if (indexParam !== null) {
      const idx = parseInt(indexParam, 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < currentImages.length) {
        removeIdx = idx;
      }
    } else if (slNoParam !== null) {
      removeIdx = currentImages.findIndex((img) => String(img.slNo) === String(slNoParam));
    } else if (imageLinkParam) {
      removeIdx = currentImages.findIndex((img) => img.imageLink === imageLinkParam);
    }

    if (removeIdx === -1) {
      return errorResponse('Target image to delete was not found. Provide valid ?index, ?slNo, or ?imageLink.', 400);
    }

    const [deletedImage] = currentImages.splice(removeIdx, 1);

    // Try deleting from GCS if it's a proxy link
    if (deletedImage?.imageLink?.startsWith('/api/files/')) {
      const gcsPath = deletedImage.imageLink.replace('/api/files/', '');
      try {
        await deleteFromGCS(gcsPath);
      } catch (e) {
        console.warn('GCS file delete warning:', e.message);
      }
    }

    const removedQty = parseQty(deletedImage?.quantity) ?? 0;
    const totals = nextReceivedTotals({
      ordered: item.quantity,
      currentReceived: item.itemReceivedTotalQuantity,
      currentLeft: item.itemLeft,
      delta: -removedQty,
    });

    const updatedItem = await prisma.bOQItems.update({
      where: { id },
      data: {
        itemReceivedImage: currentImages,
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
        deletedImage,
        images: currentImages,
      },
      'Received photo removed successfully.'
    );
  } catch (error) {
    return handleApiError(error, 'Failed to delete received image.');
  }
});
