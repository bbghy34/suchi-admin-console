import { ALL_STATES, isNEState, NE_STATES } from './constants';
import { parseISTInput } from './ist';
import { normalizeKeywords } from './keyword-text';

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}

const MONEY = [
  ['estimatedValue', 'Estimated tender value'],
  ['emdAmount', 'EMD amount'],
  ['tenderFee', 'Tender fee'],
];

const DAYS = [
  ['periodOfWorkDays', 'Period of work'],
  ['bidValidityDays', 'Bid validity'],
];

/**
 * Problems that block a save. `fields` are the raw form values.
 * A new tender needs source, title, keywords, a place, the bid end, and one file.
 */
export function collectUploadProblems(fields, { source, fileCount = 0, hasExistingFiles = false, workCategories = [] } = {}) {
  const problems = [];
  const title = str(fields.title);
  const keywords = normalizeKeywords(fields.searchKeywords);
  const allIndia = fields.allIndia === true || fields.allIndia === 'true';
  const state = allIndia ? null : str(fields.state);
  const place = str(fields.placeOfWork);
  const bidEndRaw = str(fields.bidSubmissionEnd);
  const bidEnd = parseISTInput(fields.bidSubmissionEnd);

  if (!str(fields.sourceId) || !source) problems.push('Pick a source.');
  if (!title) problems.push('Enter the title.');
  else if (title.length < 3) problems.push('The title needs at least 3 characters.');

  if (!keywords) {
    if (str(fields.searchKeywords)) problems.push('Each search keyword needs at least two characters, separated by commas.');
    else if (!hasExistingFiles) problems.push('Enter at least one search keyword, separated by commas.');
  }

  if (!allIndia && !state && !str(fields.gemConsigneeState)) problems.push('Pick a state, or tick All India and give the place of work.');
  if (allIndia && !place) problems.push('All India tenders need a place of work.');
  if (state && !ALL_STATES.includes(state)) problems.push('That state is not in the list.');

  if (!bidEndRaw) problems.push('Enter the bid submission end.');
  else if (!bidEnd) problems.push('Bid submission end is not a valid date and time.');

  if (!fileCount && !hasExistingFiles) problems.push('Choose at least one document file.');

  for (const [key, label] of MONEY) {
    const raw = str(fields[key]);
    if (!raw) continue;
    const value = num(fields[key]);
    if (value == null) problems.push(`${label} must be a number.`);
    else if (value < 0) problems.push(`${label} cannot be negative.`);
  }
  for (const [key, label] of DAYS) {
    const raw = str(fields[key]);
    if (!raw) continue;
    const value = num(fields[key]);
    if (value == null || value < 0 || Math.round(value) !== value) problems.push(`${label} must be a whole number of days.`);
  }

  for (const [key, label] of [
    ['publishedAt', 'Published date'],
    ['docSaleEnd', 'Document sale or download end'],
    ['bidOpeningAt', 'Bid opening date'],
    ['preBidAt', 'Pre-bid meeting'],
  ]) {
    if (str(fields[key]) && !parseISTInput(fields[key])) problems.push(`${label} is not a valid date and time.`);
  }

  const pin = str(fields.pinCode);
  if (pin && !/^\d{6}$/.test(pin)) problems.push('Pin code must be 6 digits.');
  const phone = str(fields.nodalPhone);
  if (phone && (phone.replace(/\D/g, '').length < 7 || phone.length > 20)) problems.push('Nodal officer phone needs at least 7 digits.');

  if (source?.kind === 'GEM') {
    if (!str(fields.gemBidNumber)) problems.push('GeM bids need the bid number.');
    if (!str(fields.gemBuyer)) problems.push('GeM bids need the buyer.');
    const consignee = str(fields.gemConsigneeState);
    if (!consignee) problems.push('GeM bids need the consignee state.');
    else if (!isNEState(consignee)) {
      problems.push(`GeM bids are kept only for the Northeast (${NE_STATES.join(', ')}).`);
    }
  }

  const work = str(fields.workCategory);
  if (work && workCategories.length && !workCategories.includes(work) && !str(fields.uploadAnywayReason)) {
    problems.push(`“${work}” is outside the firm’s work categories. Tick Upload anyway and give a one-line reason.`);
  }

  return problems;
}
