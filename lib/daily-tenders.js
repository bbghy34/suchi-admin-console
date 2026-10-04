const TEXT_FIELDS = [
  ['portalLink', 'Portal link', true],
  ['titleAndRefNo', 'Title and ref no', true],
  ['tenderId', 'Tender ID', true],
  ['organisationChain', 'Organisation chain', true],
  ['emdMoneyOffice', 'EMD money office', false],
  ['preQualification', 'Pre qualification/eligibility Criteria', true],
  ['productCategory', 'Product category', true],
  ['sdMoneyOffice', 'SD money office', false],
  ['subCategory', 'Sub category', true],
];

const DATE_FIELDS = [
  ['ePublishedDate', 'e-Published date', true],
  ['closingDate', 'Closing date', true],
  ['openingDate', 'Opening date', true],
  ['emdDate', 'EMD date', false],
  ['sdIssueDate', 'SD issue date', false],
  ['sdExpireDate', 'SD expire date', false],
];

const BIGINT_FIELDS = [
  ['emdAmount', 'EMD amount', true],
  ['tenderValue', 'Tender value', true],
  ['tenderFee', 'Tender fee', false],
  ['sdMoney', 'SD money', false],
];

const DOC_FIELDS = [
  ['tenderDetails', 'Tender details', false],
  ['emdDoc', 'EMD doc', true],
  ['tenderDocs', 'Tender docs', false],
  ['sdDocs', 'SD docs', true],
  ['corrigendum', 'Corrigendum', false],
  ['tAck', 'TAck', false],
];

export const MONEY_THROUGH_OPTIONS = [
  ['online', 'Online'],
  ['offline', 'Offline'],
];

export const MONEY_MODE_OPTIONS = [
  ['cheque', 'Cheque'],
  ['bank_guarantee', 'Bank Guarantee'],
  ['demand_draft', 'Demand Draft'],
  ['fixed_deposit', 'Fixed Deposit'],
];

const CHOICE_FIELDS = [
  ['emdThrough', 'EMD through', MONEY_THROUGH_OPTIONS],
  ['emdMode', 'EMD mode', MONEY_MODE_OPTIONS],
  ['sdThrough', 'SD through', MONEY_THROUGH_OPTIONS],
  ['sdMode', 'SD mode', MONEY_MODE_OPTIONS],
];

const DOC_URL_PREFIX = '/api/files/daily-tender-docs/';
const MAX_DOCS = 20;

export const TENDER_COPY_FIELDS = [
  ...TEXT_FIELDS.map(([name]) => name),
  ...DATE_FIELDS.map(([name]) => name),
  ...BIGINT_FIELDS.map(([name]) => name),
  ...CHOICE_FIELDS.map(([name]) => name),
  ...DOC_FIELDS.map(([name]) => name),
  'isWin',
  'status',
];

function fail(message) {
  return { ok: false, message };
}

function parseText(value, label, required) {
  const text = String(value ?? '').trim();
  if (!text) {
    return required ? fail(`${label} is required.`) : { ok: true, value: null };
  }
  return { ok: true, value: text };
}

function parseDate(value, label, required) {
  const text = String(value ?? '').trim();
  if (!text) {
    return required ? fail(`${label} is required.`) : { ok: true, value: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fail(`${label} must be a date.`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return fail(`${label} must be a real date.`);
  }
  return { ok: true, value: date };
}

function parseBigIntField(value, label, required) {
  const text = String(value ?? '').trim();
  if (!text) {
    return required ? fail(`${label} is required.`) : { ok: true, value: null };
  }
  if (!/^\d+$/.test(text)) return fail(`${label} must be a whole number.`);
  try {
    return { ok: true, value: BigInt(text) };
  } catch {
    return fail(`${label} is too large.`);
  }
}

function parseChoice(value, label, options) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return { ok: true, value: null };
  if (options.some(([key]) => key === text)) return { ok: true, value: text };
  return fail(`${label} must be one of: ${options.map(([, name]) => name).join(', ')}.`);
}

function emptyDocs(nullable) {
  return { ok: true, value: nullable ? null : [] };
}

function parseDocField(value, label, nullable) {
  if (value === null || value === undefined || value === '' || value === '{}' || value === '[]') {
    return emptyDocs(nullable);
  }
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fail(`${label} must be a list of uploaded files.`);
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
    return emptyDocs(nullable);
  }
  if (!Array.isArray(parsed)) return fail(`${label} must be a list of uploaded files.`);
  if (parsed.length > MAX_DOCS) return fail(`${label} can include up to ${MAX_DOCS} files.`);

  const docs = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return fail(`${label} has an invalid file.`);
    }
    const name = String(item.name || item.filename || '').trim().slice(0, 180);
    const url = String(item.url || '').trim();
    if (!name || !url.startsWith(DOC_URL_PREFIX) || url.includes('..') || url.includes('\\')) {
      return fail(`${label} can only include files uploaded on this form.`);
    }
    const size = Number(item.size);
    docs.push({
      name,
      url,
      size: Number.isFinite(size) && size >= 0 ? size : null,
      mimeType: typeof item.mimeType === 'string' ? item.mimeType.slice(0, 120) : null,
    });
  }
  if (docs.length === 0) return emptyDocs(nullable);
  return { ok: true, value: docs };
}

export function presentDocs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object' && typeof item.name === 'string' && typeof item.url === 'string');
}

export function parseTenderId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

export function parseTenderBody(body) {
  if (!body || typeof body !== 'object') return fail('Request body is required.');
  const data = {};

  for (const [name, label, required] of TEXT_FIELDS) {
    const parsed = parseText(body[name], label, required);
    if (!parsed.ok) return parsed;
    data[name] = parsed.value;
  }
  for (const [name, label, required] of DATE_FIELDS) {
    const parsed = parseDate(body[name], label, required);
    if (!parsed.ok) return parsed;
    data[name] = parsed.value;
  }
  for (const [name, label, required] of BIGINT_FIELDS) {
    const parsed = parseBigIntField(body[name], label, required);
    if (!parsed.ok) return parsed;
    data[name] = parsed.value;
  }
  for (const [name, label, options] of CHOICE_FIELDS) {
    const parsed = parseChoice(body[name], label, options);
    if (!parsed.ok) return parsed;
    data[name] = parsed.value;
  }
  for (const [name, label, nullable] of DOC_FIELDS) {
    const parsed = parseDocField(body[name], label, nullable);
    if (!parsed.ok) return parsed;
    data[name] = parsed.value;
  }

  data.isWin = parseWin(body.isWin);
  if (!data.isWin.ok) return data.isWin;
  data.isWin = data.isWin.value;
  const status = parseStatus(body.status);
  if (!status.ok) return status;
  data.status = status.value;
  return { ok: true, data };
}

function parseStatus(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: 'pending' };
  const text = String(value).trim().toLowerCase();
  if (text === 'pending' || text === 'saved' || text === 'reject') return { ok: true, value: text };
  return fail('Status must be pending, saved, or reject.');
}

function parseWin(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const text = String(value).trim().toLowerCase();
  if (text === 'win') return { ok: true, value: 'win' };
  if (text === 'loss') return { ok: true, value: 'loss' };
  if (text === 'cancelled') return { ok: true, value: 'cancelled' };
  return fail('Result must be win, loss, cancelled, or empty.');
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function presentTender(row) {
  return {
    id: row.id.toString(),
    portalLink: row.portalLink,
    ePublishedDate: dateOnly(row.ePublishedDate),
    closingDate: dateOnly(row.closingDate),
    openingDate: dateOnly(row.openingDate),
    titleAndRefNo: row.titleAndRefNo,
    tenderId: row.tenderId,
    organisationChain: row.organisationChain || '',
    tenderDetails: presentDocs(row.tenderDetails),
    emdAmount: row.emdAmount.toString(),
    emdDoc: presentDocs(row.emdDoc),
    emdDate: dateOnly(row.emdDate),
    resultDate: dateOnly(row.resultDate),
    emdMoneyOffice: row.emdMoneyOffice,
    emdThrough: row.emdThrough || null,
    emdMode: row.emdMode || null,
    preQualification: row.preQualification,
    tenderValue: row.tenderValue.toString(),
    tenderFee: row.tenderFee == null ? null : row.tenderFee.toString(),
    productCategory: row.productCategory,
    tenderDocs: presentDocs(row.tenderDocs),
    sdMoney: row.sdMoney == null ? null : row.sdMoney.toString(),
    sdDocs: presentDocs(row.sdDocs),
    sdIssueDate: dateOnly(row.sdIssueDate),
    sdExpireDate: dateOnly(row.sdExpireDate),
    sdMoneyOffice: row.sdMoneyOffice,
    sdThrough: row.sdThrough || null,
    sdMode: row.sdMode || null,
    corrigendum: presentDocs(row.corrigendum),
    subCategory: row.subCategory,
    tAck: presentDocs(row.tAck),
    isWin: row.isWin,
    status: row.status || 'pending',
  };
}

export function tenderCopyData(row) {
  const data = {};
  for (const field of TENDER_COPY_FIELDS) data[field] = row[field];
  return data;
}
