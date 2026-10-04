import { HELD_STATUSES } from './constants';
import { addDaysKey, istAt, istDateKey } from './ist';

export function isHeld(instrument) {
  return HELD_STATUSES.includes(instrument.status);
}

export function heldTotal(instruments, category) {
  return instruments.filter((i) => i.category === category && isHeld(i)).reduce((a, i) => a + (i.amount || 0), 0);
}

export function sumWhere(instruments, pred) {
  return instruments.filter(pred).reduce((a, i) => a + (i.amount || 0), 0);
}

export function refundOfficeComplete(i) {
  return !!(i.refundOfficeName && i.refundOfficeDept && i.refundOfficeAddress && i.refundOfficeDistrict && i.refundOfficeState && i.refundOfficerName);
}

export function refundOfficeKey(i) {
  return [i.refundOfficeName, i.refundOfficeDept, i.refundOfficeAddress, i.refundOfficeDistrict, i.refundOfficeState, i.refundOfficerName]
    .map((s) => (s || '').trim().toLowerCase())
    .join('|');
}

export const MISSING = {
  certificate: 'Upload the completion certificate.',
  completionDate: 'Enter the completion date.',
  office: 'Add the office you will get the Security Deposit back from.',
  instrument: 'Enter the Security Deposit instrument.',
  refunded: 'This Security Deposit is already refunded.',
  emdOffice: 'Add the office you will get the EMD back from.',
  emdInstrument: 'Enter the EMD instrument.',
  emdRefunded: 'This EMD is already refunded.',
};

/**
 * The gate for "Apply for security money". Returns the missing-item sentences
 * in the product wording; an empty list means the button is enabled.
 */
export function securityMoneyGate(tender, instruments, documents, now = new Date()) {
  const missing = [];
  if(tender.sdReleaseEligibleAt && new Date(tender.sdReleaseEligibleAt)>now) missing.push('Security Deposit is not due for release yet. Check the recorded release eligibility date.');
  const hasCert = documents.some((d) => d.type === 'Completion certificate');
  if (!hasCert) missing.push(MISSING.certificate);
  if (!tender.completionDate) missing.push(MISSING.completionDate);
  const sd = instruments.filter((i) => i.category === 'SD');
  const sdHeld = sd.filter((i) => isHeld(i) && i.status !== 'REFUND_APPLIED');
  if (!sd.length) {
    missing.push(MISSING.instrument);
  } else if (!sdHeld.length) {
    const applied = sd.filter((i) => i.status === 'REFUND_APPLIED');
    if (!applied.length) missing.push(MISSING.refunded);
    else missing.push('A refund application already includes every held Security Deposit.');
  } else if (sdHeld.some((i) => !refundOfficeComplete(i))) {
    missing.push(MISSING.office);
  }
  return { missing, enabled: missing.length === 0, heldInstruments: sdHeld };
}

/** The gate for "Apply for EMD refund" on a lost bid. */
export function emdRefundGate(tender, instruments) {
  const missing = [];
  const emd = instruments.filter((i) => i.category === 'EMD');
  const held = emd.filter((i) => isHeld(i) && i.status !== 'REFUND_APPLIED');
  if (!emd.length) missing.push(MISSING.emdInstrument);
  else if (!held.length) {
    const applied = emd.filter((i) => i.status === 'REFUND_APPLIED');
    missing.push(applied.length ? 'A refund application already includes every held EMD.' : MISSING.emdRefunded);
  } else if (held.some((i) => !refundOfficeComplete(i))) missing.push(MISSING.emdOffice);
  return { missing, enabled: missing.length === 0, heldInstruments: held };
}

/** Group held instruments by refund office; one application per office. */
export function groupByOffice(instruments) {
  const groups = new Map();
  for (const i of instruments) {
    const key = refundOfficeKey(i);
    if (!groups.has(key)) groups.set(key, { key, office: officeFrom(i), instruments: [] });
    groups.get(key).instruments.push(i);
  }
  return [...groups.values()];
}

export function officeFrom(i) {
  return {
    officeName: i.refundOfficeName || '',
    officeDept: i.refundOfficeDept || '',
    officeAddress: i.refundOfficeAddress || '',
    officeDistrict: i.refundOfficeDistrict || '',
    officeState: i.refundOfficeState || '',
    officerName: i.refundOfficerName || '',
    phone: i.refundOfficePhone || '',
    email: i.refundOfficeEmail || '',
  };
}

/** Guess the refund office name from the last part of the organisation chain. */
export function suggestOfficeName(orgChain) {
  if (!orgChain) return '';
  const parts = String(orgChain).split(/\|\|| \/ |\/|>|→|,|;/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Next 8:00 AM IST reminder among 30, 15, and 7 days before a bank guarantee expires. */
export function nextExpiryReminder(expiryDate, now = new Date()) {
  if (!expiryDate) return null;
  const expKey = istDateKey(expiryDate);
  if (!expKey) return null;
  for (const n of [30, 15, 7]) {
    const scheduled = istAt(addDaysKey(expKey, -n), 8, 0);
    if (scheduled > now) return scheduled;
  }
  return null;
}
