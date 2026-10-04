import { bool, num, str } from './api';
import { parseISTInput } from './ist';
import { normalizeKeywords } from './keyword-text';
import { collectUploadProblems } from './upload-checks';

/** Map form fields to Tender columns. Shared by create and edit. */
export function tenderDataFromFields(f) {
  const allIndia = bool(f.allIndia);
  const state = allIndia ? null : str(f.state);
  const data = {
    sourceId: str(f.sourceId),
    title: str(f.title),
    state,
    allIndia,
    placeOfWork: str(f.placeOfWork),
    placeOfWorkState: str(f.placeOfWorkState) || (allIndia ? null : state),
    portalTenderId: str(f.portalTenderId),
    referenceNo: str(f.referenceNo),
    orgChain: str(f.orgChain),
    category: str(f.category),
    workCategory: str(f.workCategory),
    scheme: normalizeScheme(f.scheme, f.schemeOther),
    estimatedValue: num(f.estimatedValue),
    emdAmount: num(f.emdAmount),
    emdMode: str(f.emdMode),
    tenderFee: num(f.tenderFee),
    publishedAt: parseISTInput(f.publishedAt),
    docSaleEnd: parseISTInput(f.docSaleEnd),
    bidSubmissionEnd: parseISTInput(f.bidSubmissionEnd),
    bidOpeningAt: parseISTInput(f.bidOpeningAt),
    bidOpeningPlace: str(f.bidOpeningPlace),
    preBidAt: parseISTInput(f.preBidAt),
    preBidPlace: str(f.preBidPlace),
    periodOfWorkDays: num(f.periodOfWorkDays),
    bidValidityDays: num(f.bidValidityDays),
    location: str(f.location),
    district: str(f.district),
    pinCode: str(f.pinCode),
    nodalOfficer: str(f.nodalOfficer),
    nodalPhone: str(f.nodalPhone),
    sourceUrl: str(f.sourceUrl),
    description: str(f.description),
    searchKeywords: normalizeKeywords(f.searchKeywords) || null,
    gemBidNumber: str(f.gemBidNumber),
    gemBuyer: str(f.gemBuyer),
    gemConsigneeState: str(f.gemConsigneeState),
    gemRa: str(f.gemRa),
    uploadAnywayReason: str(f.uploadAnywayReason),
  };
  if (data.periodOfWorkDays != null) data.periodOfWorkDays = Math.round(data.periodOfWorkDays);
  if (data.bidValidityDays != null) data.bidValidityDays = Math.round(data.bidValidityDays);
  if (data.gemConsigneeState && !data.state && !data.allIndia) data.state = data.gemConsigneeState;
  if (!data.portalTenderId && data.gemBidNumber) data.portalTenderId = data.gemBidNumber;
  return data;
}

function normalizeScheme(scheme, other) {
  const s = str(scheme);
  if (!s || s.toLowerCase() === 'none') return null;
  if (s.toLowerCase() === 'pmgsy') return 'PMGSY';
  if (s.toLowerCase() === 'other') return str(other);
  return s;
}

/** Hard requirements before save. `fields` are the raw form values. */
export function validateTender(fields, source, opts = {}) {
  return collectUploadProblems(fields, { source, ...opts });
}

/** Strongly prompted fields, listed as missing until filled. */
export function missingPrompts(t, source) {
  const missing = [];
  const isGem = source?.kind === 'GEM';
  const check = (cond, label) => {
    if (!cond) missing.push(label);
  };
  if (isGem) {
    check(t.gemBidNumber, 'Bid number');
    check(t.gemBuyer, 'Buyer');
    check(t.gemConsigneeState, 'Consignee state');
  } else {
    check(t.portalTenderId, 'Tender id');
    check(t.referenceNo, 'Reference number / NIT number');
    check(t.orgChain, 'Organisation chain');
  }
  check(t.category, 'Category (Goods, Services, Works)');
  check(t.workCategory, 'Work category');
  check(t.estimatedValue != null, 'Estimated tender value');
  check(t.emdAmount != null || t.emdMode === 'Exempted', 'EMD amount and form');
  check(t.tenderFee != null, 'Tender fee');
  check(t.publishedAt, 'Published date');
  check(t.docSaleEnd, 'Document sale or download end');
  check(t.bidOpeningAt, 'Bid opening date');
  check(t.periodOfWorkDays != null, 'Period of work (days)');
  check(t.bidValidityDays != null, 'Bid validity (days)');
  check(t.location || t.district, 'Location or district');
  check(t.nodalOfficer, 'Nodal officer');
  check(t.sourceUrl, 'Source URL of this tender');
  check(t.description, 'Short work description');
  return missing;
}
