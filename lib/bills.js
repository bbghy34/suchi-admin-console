const AMOUNT_MAX_DIGITS = 12;
const PARTY_MAX = 200;
const DOC_MAX = 500;
const PHONE_MAX = 20;
const BILL_NO_MAX = 40;

export function normalizeBillNoInput(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^\x21-\x7E]/g, '')
    .slice(0, BILL_NO_MAX);
}

export function parseBillNo(value) {
  const raw = normalizeBillNoInput(value);
  if (!raw) {
    return {
      ok: false,
      message: 'Bill number is required. Use capital letters, digits, and special characters.',
    };
  }
  if (!/^[\x21-\x7E]+$/.test(raw) || /[a-z]/.test(raw)) {
    return { ok: false, message: 'Bill number must use capital letters, digits, and special characters.' };
  }
  return { ok: true, value: raw };
}

export function normalizeAmountInput(value) {
  return String(value ?? '').trim().replace(/,/g, '').replace(/^₹\s*/, '');
}

/**
 * Whole rupees. Returns an empty string when the value is acceptable.
 */
export function amountError(value, label, { required = true, allowZero = false } = {}) {
  if (value === undefined || value === null) return required ? `${label} is required.` : '';
  const raw = normalizeAmountInput(value);
  if (!raw) return required ? `${label} is required.` : '';
  if (raw.startsWith('-')) return `${label} cannot be negative.`;
  if (raw.includes('.')) return `${label} must be whole rupees. Paise are not allowed.`;
  if (!/^\d+$/.test(raw)) return `${label} must contain digits only.`;
  if (/^0+$/.test(raw) && !allowZero) return `${label} must be greater than 0.`;
  if (raw.length > AMOUNT_MAX_DIGITS) return `${label} cannot be more than ${AMOUNT_MAX_DIGITS} digits.`;
  return '';
}

export function parseAmount(value, label, options = {}) {
  const message = amountError(value, label, options);
  if (message) return { ok: false, message };
  if (value === undefined || value === null || normalizeAmountInput(value) === '') {
    return { ok: true, skip: true };
  }
  return { ok: true, value: BigInt(normalizeAmountInput(value)) };
}

export function parseDateField(value, label, { required = true } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return required ? { ok: false, message: `${label} is required.` } : { ok: true, value: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: `${label} must be a valid date.` };
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    return { ok: false, message: `${label} must be a valid date.` };
  }
  return { ok: true, value: date };
}

export function parsePartyName(value) {
  const name = String(value ?? '').trim();
  if (!name) return { ok: false, message: 'Party name is required.' };
  if (name.length > PARTY_MAX) return { ok: false, message: `Party name must be ${PARTY_MAX} characters or fewer.` };
  return { ok: true, value: name };
}

export function parseGst(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return { ok: true, value: null };
  if (!/^[0-9A-Z]{15}$/.test(raw)) {
    return { ok: false, message: 'GST must be 15 letters and digits.' };
  }
  return { ok: true, value: raw };
}

export function parsePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, message: 'Phone number is required.' };
  const compact = raw.replace(/[\s()-]/g, '');
  if (compact.length > PHONE_MAX || !/^\+?\d{6,15}$/.test(compact)) {
    return { ok: false, message: 'Enter a valid phone number.' };
  }
  return { ok: true, value: compact };
}

export const TREASURY_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
export const TREASURY_IMAGE_MAX = 10;
export const TREASURY_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function billDocExtension(filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || '';
  return ext;
}

function imageNoun(label) {
  const noun = String(label || 'Treasury bill image').trim() || 'Treasury bill image';
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

function imageNounLower(label) {
  const noun = imageNoun(label);
  return noun.charAt(0).toLowerCase() + noun.slice(1);
}

/** Empty string when one bill image is acceptable. `anyFile` lifts the image-only rule. */
export function treasuryImageError(file, label = 'Treasury bill image', { anyFile = false } = {}) {
  const noun = imageNoun(label);
  if (!file) return `${noun} is required.`;
  if (!file.size) return `${noun} is empty.`;
  const ext = billDocExtension(file.name);
  if (!anyFile && !TREASURY_IMAGE_EXTENSIONS.includes(ext)) {
    return 'Use a .jpg, .jpeg, .png, .webp, or .gif image.';
  }
  if (file.size > TREASURY_IMAGE_MAX_BYTES) return `Each ${imageNounLower(label)} must be 20MB or smaller.`;
  return '';
}

/**
 * Empty string when the saved images plus the new files are an acceptable set.
 * existingCount is how many images are already kept.
 */
export function treasuryImagesError(files, { existingCount = 0, label = 'Treasury bill image', required = true, anyFile = false } = {}) {
  const list = Array.isArray(files) ? files : [];
  const total = existingCount + list.length;
  const lower = imageNounLower(label);
  if (total < 1) return required ? `At least one ${lower} is required.` : '';
  if (total > TREASURY_IMAGE_MAX) {
    return `You can attach up to ${TREASURY_IMAGE_MAX} ${lower}s.`;
  }
  for (const file of list) {
    const message = treasuryImageError(file, label, { anyFile });
    if (message) return message;
  }
  return '';
}

export function treasuryImageName(filename, label = 'Treasury bill image', { anyFile = false } = {}) {
  const name = String(filename || '').trim().replace(/[\\/]/g, '');
  if (!name) return { ok: false, message: `${imageNoun(label)} is required.` };
  const ext = billDocExtension(name);
  if (!anyFile && !TREASURY_IMAGE_EXTENSIONS.includes(ext)) {
    return { ok: false, message: 'Use a .jpg, .jpeg, .png, .webp, or .gif image.' };
  }
  if (name.length > DOC_MAX) return { ok: false, message: 'File name is too long.' };
  return { ok: true, value: name };
}

/** Stored treasury bill images as { name, path }. */
export function parseTreasuryBillDocs(value) {
  const list = Array.isArray(value) ? value : [];
  const docs = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim();
    const path = String(item.path || '').trim();
    if (!name && !path) continue;
    docs.push({ name: name || 'Treasury bill image', path });
  }
  return docs;
}

export function treasuryBillDocLabel(value) {
  return parseTreasuryBillDocs(value).map((item) => item.name).filter(Boolean).join(', ');
}

export function paymentExceedsBill(payment, amount) {
  const paid = parseAmount(payment, 'Bill payment', { allowZero: true });
  const bill = parseAmount(amount, 'Bill amount');
  if (!paid.ok || !bill.ok || paid.skip || bill.skip) return '';
  if (paid.value > bill.value) return 'Bill payment cannot exceed the bill amount.';
  return '';
}

function moneyNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function slicesOrEmpty(slices) {
  return slices.filter((slice) => slice.value > 0);
}

/**
 * Payment and BOQ completion against one project's budget.
 * Integer money is passed as bigint. Budget is the Project.budget float, or null.
 */
export function buildBillSummary({ budget, received, billed, paid, paymentCount = 0, billCount = 0 }) {
  const receivedN = moneyNumber(received);
  const billedN = moneyNumber(billed);
  const paidN = moneyNumber(paid);
  const budgetN = budget == null || budget === '' ? null : Number(budget);
  const budgetKnown = budgetN != null && Number.isFinite(budgetN);
  const hasBudget = budgetKnown && budgetN > 0;

  const stillToReceive = hasBudget ? Math.max(budgetN - receivedN, 0) : null;
  const paymentOverflow = hasBudget ? Math.max(receivedN - budgetN, 0) : 0;
  const paymentPercent = hasBudget ? (receivedN / budgetN) * 100 : null;

  const unpaidN = Math.max(billedN - paidN, 0);
  const boqOverpaid = Math.max(paidN - billedN, 0);
  const boqPaidPercent = billedN > 0 ? (paidN / billedN) * 100 : null;

  let paymentSlices = [];
  if (hasBudget) {
    if (receivedN <= 0) paymentSlices = [{ key: 'remaining', label: 'Remaining', value: budgetN }];
    else if (receivedN >= budgetN) paymentSlices = [{ key: 'received', label: 'Received', value: receivedN }];
    else {
      paymentSlices = [
        { key: 'received', label: 'Received', value: receivedN },
        { key: 'remaining', label: 'Remaining', value: budgetN - receivedN },
      ];
    }
  }

  let boqSlices = [];
  if (billedN > 0 || paidN > 0) {
    if (paidN <= 0) boqSlices = [{ key: 'unpaid', label: 'Unpaid', value: billedN }];
    else if (unpaidN <= 0) boqSlices = [{ key: 'paid', label: 'Paid', value: paidN }];
    else {
      boqSlices = [
        { key: 'paid', label: 'Paid', value: paidN },
        { key: 'unpaid', label: 'Unpaid', value: unpaidN },
      ];
    }
  }

  return {
    budget: budgetKnown ? budgetN : null,
    hasBudget,
    received: receivedN,
    stillToReceive,
    paymentOverflow,
    paymentPercent,
    boqBilled: billedN,
    boqPaid: paidN,
    boqUnpaid: unpaidN,
    boqOverpaid,
    boqPaidPercent,
    paymentCount,
    billCount,
    donuts: {
      payment: {
        emptyBudget: !hasBudget,
        percent: paymentPercent == null ? null : Math.min(100, paymentPercent),
        truePercent: paymentPercent,
        overflow: paymentOverflow,
        slices: slicesOrEmpty(paymentSlices),
      },
      boqPayment: {
        empty: billedN <= 0 && paidN <= 0,
        percent: boqPaidPercent == null ? null : Math.min(100, boqPaidPercent),
        truePercent: boqPaidPercent,
        overflow: boqOverpaid,
        slices: slicesOrEmpty(boqSlices),
      },
    },
  };
}

export const paymentInclude = {
  project: { select: { id: true, name: true, budget: true } },
};

export const billInclude = {
  ...paymentInclude,
  party: { select: { id: true, name: true, phoneNo: true, gst: true } },
};
