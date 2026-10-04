import { formatINR } from './format';
import { formatIST } from './ist';

export const NOT_AVAILABLE = 'Not Available';

function present(value) {
  if (value == null) return NOT_AVAILABLE;
  const text = String(value).trim();
  if (!text || text === '—' || text === 'Not found in the uploaded documents.') return NOT_AVAILABLE;
  return text;
}

function sectionText(summary, key) {
  const section = summary?.sections?.find((item) => item.key === key);
  return present(section?.text);
}

/**
 * The Bid Details record. The tender page and every export use this object.
 * Missing facts stay "Not Available". Nothing is guessed.
 */
export function buildBidDetails(tender, summary = null) {
  const money = (value) => present(value == null || value === '' ? null : formatINR(value));
  const when = (value) => present(value ? formatIST(value) : null);
  const days = (value) => (value == null || value === '' ? NOT_AVAILABLE : `${value} days`);
  const authority = tender.orgChain || tender.gemBuyer || tender.source?.displayName;
  const location = tender.allIndia
    ? ['All India', tender.placeOfWork].filter(Boolean).join(', ')
    : [tender.placeOfWork, tender.district, tender.state || tender.placeOfWorkState || tender.gemConsigneeState].filter(Boolean).join(', ');

  const groups = [
    {
      name: 'Tender',
      fields: [
        ['Title', present(tender.title)],
        ['Authority', present(authority)],
        ['Source', present(tender.source?.displayName)],
        ['Location', present(location)],
        ['Category', present(tender.category)],
        ['Work category', present(tender.workCategory)],
        ['Scheme', present(tender.scheme)],
        ['Tender id', present(tender.portalTenderId || tender.gemBidNumber || tender.referenceNo)],
        ['Reference', present(tender.referenceNo)],
        ['Description', present(tender.description)],
        ['What the work is', sectionText(summary, 'work')],
      ],
    },
    {
      name: 'Eligibility',
      fields: [
        ['Eligibility', sectionText(summary, 'eligibility')],
        ['Technical documents', sectionText(summary, 'technical')],
        ['Certificates named', sectionText(summary, 'certificates')],
      ],
    },
    {
      name: 'Financial',
      fields: [
        ['Estimated value', money(tender.estimatedValue)],
        ['EMD', money(tender.emdAmount)],
        ['EMD mode', present(tender.emdMode)],
        ['Tender fee', money(tender.tenderFee)],
        ['Financial documents', sectionText(summary, 'financial')],
        ['EMD as written', sectionText(summary, 'emd')],
        ['Tender fee as written', sectionText(summary, 'fee')],
        ['Security Deposit as written', sectionText(summary, 'sd')],
        ['Awarded value', money(tender.awardedValue)],
      ],
    },
    {
      name: 'Timeline',
      fields: [
        ['Published', when(tender.publishedAt)],
        ['Document sale end', when(tender.docSaleEnd)],
        ['Pre-bid', when(tender.preBidAt)],
        ['Pre-bid place', present(tender.preBidPlace)],
        ['Bid submission end', when(tender.bidSubmissionEnd)],
        ['Bid opening', when(tender.bidOpeningAt)],
        ['Bid opening place', present(tender.bidOpeningPlace)],
        ['Period of work', days(tender.periodOfWorkDays)],
        ['Bid validity', days(tender.bidValidityDays)],
        ['Dates as written', sectionText(summary, 'dates')],
      ],
    },
  ];

  return {
    tenderId: tender.id,
    title: present(tender.title),
    groups,
  };
}

export function bidDetailRows(details) {
  const rows = [];
  for (const group of details.groups || []) {
    for (const [field, value] of group.fields) rows.push([group.name, field, value]);
  }
  return rows;
}
