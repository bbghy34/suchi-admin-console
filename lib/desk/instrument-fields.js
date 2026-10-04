import { HttpError } from './auth';
import { num, str } from './api';
import { parseISTInput } from './ist';
import { AWARDED_STAGES, HELD_STATUSES, INSTRUMENT_FORMS, INSTRUMENT_STATUS_LABEL, STAGE_ORDER } from './constants';
import { refundOfficeComplete } from './money';

export function instrumentDataFromFields(f) {
  const data = {
    category: str(f.category),
    form: str(f.form),
    amount: num(f.amount) ?? 0,
    inFavourOf: str(f.inFavourOf),
    bank: str(f.bank),
    branch: str(f.branch),
    number: str(f.number),
    instrumentDate: parseISTInput(f.instrumentDate),
    expiryDate: parseISTInput(f.expiryDate),
    submittedOn: parseISTInput(f.submittedOn),
    submittedToName: str(f.submittedToName),
    submittedToDept: str(f.submittedToDept),
    submittedToDistrict: str(f.submittedToDistrict),
    submittedToState: str(f.submittedToState),
    status: str(f.status) || 'TO_ARRANGE',
    note: str(f.note),
    convertedToId: str(f.convertedToId),
    refundOfficeName: str(f.refundOfficeName),
    refundOfficeDept: str(f.refundOfficeDept),
    refundOfficeAddress: str(f.refundOfficeAddress),
    refundOfficeDistrict: str(f.refundOfficeDistrict),
    refundOfficeState: str(f.refundOfficeState),
    refundOfficerName: str(f.refundOfficerName),
    refundOfficePhone: str(f.refundOfficePhone),
    refundOfficeEmail: str(f.refundOfficeEmail),
    refundedOn: parseISTInput(f.refundedOn),
  };
  for (const key of ['instrumentDate', 'expiryDate', 'submittedOn', 'refundedOn']) {
    if (f[key] && !data[key]) throw new HttpError(400, `Enter a valid ${key} date.`);
  }
  if (data.form !== 'Bank guarantee') data.expiryDate = null;
  return data;
}

/**
 * Rules for saving an instrument. EMD from selection onwards; Security
 * Deposit only after the firm got the bid. Returns a problem sentence or null.
 */
export function validateInstrument(data, tender, { siblings = [] } = {}) {
  if (!['EMD', 'SD'].includes(data.category)) return 'Choose the category first: EMD or Security Deposit.';
  if (!INSTRUMENT_FORMS.includes(data.form)) return 'Pick the form of the instrument.';
  if (!INSTRUMENT_STATUS_LABEL[data.status]) return 'Pick a status.';
  if (!Number.isFinite(data.amount)) return 'Enter a finite amount.';
  if (data.amount < 0) return 'The amount cannot be negative.';

  if (data.category === 'SD') {
    if (!AWARDED_STAGES.includes(tender.stage)) return 'Security Deposit is entered after the firm gets the bid. Mark “Got the bid” with the letter of acceptance first.';
    if (HELD_STATUSES.includes(data.status) && !refundOfficeComplete(data)) {
      return 'Before a Security Deposit can be held, fill the office we will get it back from: office name, department, address, district, state, and the officer’s name.';
    }
  } else {
    const okStage = ['SELECTED','PREPARING_BID','BID_SUBMITTED','NOT_AWARDED'].includes(tender.stage) || AWARDED_STAGES.includes(tender.stage);
    if (!okStage) return 'Select the tender or start preparing the bid before recording EMD.';
  }

  if (data.form === 'Bank guarantee' && !data.expiryDate) return 'A bank guarantee needs its expiry date.';
  if (data.status === 'FORFEITED' && !data.note) return 'A forfeited instrument needs a note saying why the office kept it.';
  if (data.status === 'CONVERTED_TO_SD') {
    if (data.category !== 'EMD') return 'Only an EMD can be converted to SD.';
    if (!data.convertedToId) return 'Point the converted EMD at the new Security Deposit instrument.';
    const target = siblings.find((s) => s.id === data.convertedToId);
    if (!target || target.category !== 'SD') return 'The converted EMD must point at a Security Deposit instrument on this tender.';
  }
  if (data.status === 'EXEMPTED' && data.form !== 'Exempted' && data.amount > 0) {
    return 'An exempted instrument should use the form “Exempted”; the amount may be zero.';
  }
  return null;
}
