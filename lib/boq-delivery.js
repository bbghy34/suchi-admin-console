export const DELIVERY_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

const MAX_QTY = 1_000_000_000;

export function parseImagesArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      if (raw.startsWith('http') || raw.startsWith('/api/files')) {
        return [{
          slNo: 1,
          imageLink: raw,
          lat: null,
          long: null,
          quantity: null,
          createdAt: new Date().toISOString(),
          createdBy: null,
        }];
      }
    }
  }
  return [];
}

export function parseCoordinate(value, min, max, label) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { ok: false, message: `${label} must be a number between ${min} and ${max}.` };
  }
  return { ok: true, value: num };
}

export function parseQty(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function formatQty(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/** Quantity delivered with this photo. Required, and must be greater than zero. */
export function parseDeliveryQuantity(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { ok: false, message: 'Enter the quantity delivered with this photo.' };
  }
  const num = parseQty(value);
  if (num === null || num <= 0 || num > MAX_QTY) {
    return { ok: false, message: 'Delivered quantity must be a number greater than zero.' };
  }
  return { ok: true, value: num };
}

/**
 * Add or remove a delivery from the running received total.
 * Ordered quantity, when it is a number, sets what is still left.
 */
export function nextReceivedTotals({ ordered, currentReceived, currentLeft, delta }) {
  const base = parseQty(currentReceived) ?? 0;
  const next = Math.max(0, base + delta);
  const orderedNum = parseQty(ordered);
  return {
    itemReceivedTotalQuantity: formatQty(next),
    itemLeft: orderedNum == null
      ? (currentLeft ?? null)
      : formatQty(Math.max(0, orderedNum - next)),
  };
}

/** Site staff can record a delivery only for the site they are assigned to. */
export function employeeCanRecordDelivery(role, employeeSiteId, boqSiteId) {
  if (role !== 'E') return true;
  return Boolean(employeeSiteId && boqSiteId && employeeSiteId === boqSiteId);
}
