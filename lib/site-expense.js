const ITEM_NAME_MAX = 200;
const REMARKS_MAX = 2000;

export function parseItemName(value, { required = true } = {}) {
  if (value === undefined) return { ok: true, skip: true };
  const name = String(value ?? '').trim();
  if (!name) {
    if (!required) return { ok: true, skip: true };
    return { ok: false, message: 'Item name is required.' };
  }
  if (name.length > ITEM_NAME_MAX) {
    return { ok: false, message: `Item name must be ${ITEM_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, value: name };
}

const PRICE_MAX_DIGITS = 12;

/** Strip grouping commas and a leading rupee sign. */
export function normalizePriceInput(value) {
  return String(value ?? '').trim().replace(/,/g, '').replace(/^₹\s*/, '');
}

/**
 * Whole rupees, greater than zero.
 * Returns an empty string when the value is acceptable.
 */
export function priceError(value, { required = true, allowZero = false } = {}) {
  if (value === undefined) return '';
  const raw = normalizePriceInput(value);
  if (!raw) return required ? 'Price is required.' : '';
  if (raw.startsWith('-')) return 'Price cannot be negative.';
  if (raw.includes('.')) return 'Enter whole rupees only. Paise are not allowed.';
  if (!/^\d+$/.test(raw)) return 'Price must contain digits only.';
  if (/^0+$/.test(raw) && !allowZero) return 'Price must be greater than 0.';
  if (raw.length > PRICE_MAX_DIGITS) return `Price cannot be more than ${PRICE_MAX_DIGITS} digits.`;
  return '';
}

/** Whole rupees. Commas and a leading rupee sign are ignored. */
export function parsePrice(value, { required = true } = {}) {
  if (value === undefined) return { ok: true, skip: true };
  if (!required && normalizePriceInput(value) === '') return { ok: true, skip: true };
  const message = priceError(value, { required });
  if (message) return { ok: false, message };
  return { ok: true, value: BigInt(normalizePriceInput(value)) };
}

export function parseRemarks(value) {
  if (value === undefined) return { ok: true, skip: true };
  if (value === null) return { ok: true, value: null };
  const text = String(value).trim();
  if (!text) return { ok: true, value: null };
  if (text.length > REMARKS_MAX) {
    return { ok: false, message: `Remarks must be ${REMARKS_MAX} characters or fewer.` };
  }
  return { ok: true, value: text };
}

export function priceRangeError(minValue, maxValue) {
  const min = normalizePriceInput(minValue);
  const max = normalizePriceInput(maxValue);
  if (!min || !max) return '';
  if (priceError(min, { allowZero: true }) || priceError(max, { allowZero: true })) return '';
  if (BigInt(min) > BigInt(max)) return 'Minimum price cannot be greater than maximum price.';
  return '';
}

export function parsePriceBound(value, label) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { ok: true, value: null };
  const message = priceError(trimmed, { allowZero: true });
  if (message) return { ok: false, message: message.replace(/^Price/, label) };
  return { ok: true, value: BigInt(normalizePriceInput(trimmed)) };
}

export const expenseInclude = {
  site: {
    select: {
      id: true,
      name: true,
      projectId: true,
      project: { select: { id: true, name: true } },
    },
  },
};
