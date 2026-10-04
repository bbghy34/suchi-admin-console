// Vocabulary and fixed lists used across the desk. Labels here are the words
// the firm uses; do not rename them in the interface.

export const NE_STATES = [
  'Arunachal Pradesh',
  'Assam',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Sikkim',
  'Tripura',
];

export const ALL_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

export function isNEState(state) {
  return !!state && NE_STATES.includes(state);
}

export const ROLES = {
  ADMIN: 'Admin',
  TENDER_EXECUTIVE: 'Tender Executive',
  BIDDER: 'Bidder',
  ACCOUNTS: 'Accounts',
};

export const STAGES = [
  ['UPLOADED', 'Uploaded'],
  ['SELECTED', 'Selected'],
  ['PREPARING_BID', 'Preparing bid'],
  ['BID_SUBMITTED', 'Bid submitted'],
  ['NOT_AWARDED', 'Not awarded'],
  ['GOT_THE_BID', 'Got the bid'],
  ['IN_EXECUTION', 'In execution'],
  ['COMPLETED', 'Completed'],
  ['SD_APPLIED', 'Security money applied'],
  ['SD_RELEASED', 'Security money released'],
  ['CLOSED', 'Closed'],
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const STAGE_ORDER = Object.fromEntries(STAGES.map(([k], i) => [k, i]));

/** Stages that mean the firm has the work (or had it). */
export const AWARDED_STAGES = ['GOT_THE_BID', 'IN_EXECUTION', 'COMPLETED', 'SD_APPLIED', 'SD_RELEASED', 'CLOSED'];
/** Stages where the bid is still open on the firm's side. */
export const PRE_BID_STAGES = ['UPLOADED', 'SELECTED', 'PREPARING_BID'];

export const DOCUMENT_TYPES = [
  'NIT',
  'BOQ',
  'Corrigendum',
  'Drawing',
  'General conditions',
  'Letter of acceptance',
  'Work order',
  'Completion certificate',
  'EMD proof',
  'Security Deposit proof',
  'Refund letter',
  'Other',
];

export const TENDER_CATEGORIES = ['Works', 'Goods', 'Services'];

export const DEFAULT_WORK_CATEGORIES = ['Civil works', 'Roads and bridges', 'Buildings', 'Electrical', 'Water supply'];

export const EMD_MODES = ['Demand draft', 'Bank guarantee', 'Online', 'Exempted'];

export const INSTRUMENT_CATEGORIES = {
  EMD: 'EMD',
  SD: 'Security Deposit',
};

export const INSTRUMENT_FORMS = ['Demand draft', 'Bank guarantee', 'FDR', 'Online', 'Exempted', 'Adjusted'];

export const INSTRUMENT_STATUSES = [
  ['TO_ARRANGE', 'To arrange', 'Known, not yet available.'],
  ['SUBMITTED', 'Submitted', 'Sent to the office. Counts as held.'],
  ['HELD', 'Held by office', 'The office has acknowledged it. Counts as held.'],
  ['RENEWAL_DUE', 'Renewal due', 'A guarantee will expire inside 30 days. Counts as held.'],
  ['CONVERTED_TO_SD', 'Converted to SD', 'An EMD was adjusted into a Security Deposit. Does not count as held.'],
  ['REFUND_APPLIED', 'Refund applied', 'A refund application includes this instrument. Counts as held until refunded.'],
  ['REFUNDED', 'Refunded', 'Money is back. Does not count as held.'],
  ['FORFEITED', 'Forfeited', 'The office kept it. Does not count as held. A note is required.'],
  ['EXEMPTED', 'Exempted', 'A valid exemption, amount may be zero. Does not count as held.'],
];
export const INSTRUMENT_STATUS_LABEL = Object.fromEntries(INSTRUMENT_STATUSES.map(([k, l]) => [k, l]));
export const HELD_STATUSES = ['SUBMITTED', 'HELD', 'RENEWAL_DUE', 'REFUND_APPLIED'];

export const APPLICATION_STATUSES = [
  ['DRAFT', 'Draft', 'Letter not yet treated as sent.'],
  ['SUBMITTED', 'Submitted to office', 'The firm has sent the letter to the refund office.'],
  ['ACKNOWLEDGED', 'Acknowledged', 'The office has received it.'],
  ['RELEASED', 'Released', 'Money is back.'],
  ['REJECTED', 'Rejected', 'The office refused. The firm may apply again after fixing the note.'],
];
export const APPLICATION_STATUS_LABEL = Object.fromEntries(APPLICATION_STATUSES.map(([k, l]) => [k, l]));

export const FREQUENCIES = [
  ['FREQUENT', 'Frequent', 'Every reminder on the schedule.'],
  ['QUIET', 'Quiet', 'Only the 8:00 AM IST daily digest.'],
  ['OFF', 'Off', 'Nothing new. Existing inbox items stay.'],
];

export const FETCH_OUTCOMES = {
  UPLOADED: 'Uploaded',
  NO_NEW: 'No new tender',
  COULD_NOT_OPEN: 'Could not open the portal',
};

export const SOURCE_MARK_LABEL = {
  PRIORITY: 'Priority',
  CAREFUL: 'Careful',
  STANDARD: 'Standard',
  PLATFORM: 'Platform, not a daily inbox',
};

export const SETTING_KEYS = {
  FIRM_NAME: 'firmName',
  WORK_CATEGORIES: 'workCategories',
  FETCH_ASSIGNEE: 'fetchAssigneeId',
  FETCH_BACKUP: 'fetchBackupId',
  ONLINE_SCHEDULE: 'onlineSchedule',
  ONLINE_SCHEDULE_HOUR: 'onlineScheduleHour',
  ONLINE_SCHEDULE_LAST: 'onlineScheduleLast',
  ONLINE_SCHEDULE_NOTE: 'onlineScheduleNote',
};

/** The source register, in display order. Priority rows come first. */
export const SOURCE_REGISTER = [
  {
    id: 'iocl',
    displayName: 'IOCL, all India',
    officialName: 'IndianOil e-tendering',
    url: 'https://iocletenders.nic.in/nicgep/app',
    mark: 'PRIORITY',
    intakeRule:
      'All India. Upload new tenders in the firm’s work categories. Do not require the site to be in the Northeast.',
    allIndia: true,
  },
  {
    id: 'ntpc',
    displayName: 'NTPC Limited, all India',
    officialName: 'NTPC eProcurement',
    url: 'https://eprocurentpc.nic.in/nicgep/app',
    mark: 'PRIORITY',
    intakeRule: 'All India, same rule as IOCL.',
    allIndia: true,
  },
  // Northeast group. Assam and Tripura pinned to the top of the group.
  {
    id: 'assam',
    displayName: 'Assam State Procurements Portal',
    officialName: 'eProcurement System, Government of Assam',
    url: 'https://assamtenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    intakeRule: 'All new Assam tenders in the firm’s work categories.',
    groupKey: 'NE',
    pinned: true,
    state: 'Assam',
  },
  {
    id: 'tripura',
    displayName: 'Tripura tenders',
    officialName: 'eProcurement System, Government of Tripura',
    url: 'https://tripuratenders.gov.in/nicgep/app',
    mark: 'STANDARD',
    intakeRule: 'All new Tripura tenders in the firm’s work categories.',
    groupKey: 'NE',
    pinned: true,
    state: 'Tripura',
  },
  {
    id: 'arunachal',
    displayName: 'Arunachal Pradesh',
    officialName: 'eProcurement System, Government of Arunachal Pradesh',
    url: 'https://arunachaltenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule: 'Same category rule.',
    groupKey: 'NE',
    state: 'Arunachal Pradesh',
  },
  {
    id: 'manipur',
    displayName: 'Manipur',
    officialName: 'eProcurement System, Government of Manipur',
    url: 'https://manipurtenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule: 'Same category rule.',
    groupKey: 'NE',
    state: 'Manipur',
  },
  {
    id: 'meghalaya',
    displayName: 'Meghalaya',
    officialName: 'eProcurement System, Government of Meghalaya',
    url: 'https://meghalayatenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule: 'Same category rule.',
    groupKey: 'NE',
    state: 'Meghalaya',
  },
  {
    id: 'mizoram',
    displayName: 'Mizoram',
    officialName: 'eProcurement System, Government of Mizoram',
    url: 'https://mizoramtenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule: 'Same category rule.',
    groupKey: 'NE',
    state: 'Mizoram',
  },
  {
    id: 'nagaland',
    displayName: 'Nagaland',
    officialName: 'eProcurement System, Government of Nagaland',
    url: 'https://nagalandtenders.gov.in/nicgep/app',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule: 'Same category rule.',
    groupKey: 'NE',
    state: 'Nagaland',
  },
  {
    id: 'sikkim',
    displayName: 'Sikkim',
    officialName: 'Government of Sikkim tender notices',
    url: 'https://www.sikkim.gov.in/tender',
    kind: 'NOTICE',
    mark: 'PRIORITY',
    markNote: 'as part of NE',
    intakeRule:
      'Official state noticeboard. Read the linked notice and follow its bidding portal; upload manually when the closing date and time cannot be verified.',
    groupKey: 'NE',
    state: 'Sikkim',
  },
  {
    id: 'gem',
    displayName: 'GeM portal, Northeast only',
    officialName: 'Government e-Marketplace bids',
    url: 'https://bidplus.gem.gov.in/all-bids',
    extraUrls: 'https://gem.gov.in/',
    mark: 'CAREFUL',
    intakeRule:
      'Upload a bid only when the buyer or consignee state is one of the eight Northeast states. Reject or warn on any other state. GeM is a marketplace bid, not a classic NIT: store bid number, buyer, consignee state, and RA if any.',
    kind: 'GEM',
  },
  {
    id: 'coal-india',
    allIndia: true,
    displayName: 'Coal India Limited, all India',
    officialName: 'Coal India e-tendering',
    url: 'https://coalindiatenders.nic.in/nicgep/app',
    mark: 'CAREFUL',
    intakeRule:
      'All India, in the firm’s work categories. Check relevant tenders on demand; no full national crawl is required.',
    noNewLabel: 'No new tender matching our filter',
    config: JSON.stringify({
      subsidiaries: ['ECL', 'BCCL', 'CCL', 'NCL', 'WCL', 'SECL', 'MCL', 'CMPDI'],
      subsidiariesOn: [],
    }),
  },
  {
    id: 'cppp',
    allIndia: true,
    displayName: 'Central procurement portal, all India',
    officialName: 'Central Public Procurement Portal',
    url: 'https://eprocure.gov.in/eprocure/app',
    mark: 'STANDARD',
    intakeRule: 'All India, in the firm’s work categories.',
  },
  {
    id: 'defence',
    allIndia: true,
    displayName: 'Defence e-procurement, all India',
    officialName: 'eProcurement for organisations under the Ministry of Defence',
    url: 'https://defproc.gov.in/nicgep/app',
    mark: 'STANDARD',
    intakeRule: 'All India, in the firm’s work categories.',
  },
  {
    id: 'pmgsy',
    displayName: 'PMGSY',
    officialName: 'Pradhan Mantri Gram Sadak Yojana tenders',
    url: 'https://pmgsytenders.gov.in/nicgep/app',
    mark: 'STANDARD',
    intakeRule:
      'Check the PMGSY portal and state Rural Works / PWD notices. Do not create a second card if this NIT was already uploaded from a state portal. Add the scheme tag PMGSY to the existing tender.',
    kind: 'SCHEME',
  },
  {
    id: 'nrida',
    displayName: 'National Rural Roads Development Agency',
    officialName: 'National Rural Infrastructure Development Agency (NRIDA)',
    url: 'https://pmgsy.nic.in',
    extraUrls: 'https://omms.nic.in',
    mark: 'STANDARD',
    intakeRule:
      'Read notices. If a notice points at a state NIT, link that tender and tag PMGSY. This row can be completed with “No new notice” and zero uploads. OMMAS is monitoring, not bidding.',
    kind: 'NOTICE',
    noNewLabel: 'No new notice',
  },
  {
    id: 'cpse',
    allIndia: true,
    displayName: 'E-tender for central PSUs, all India',
    officialName: 'CPPP organisation lists, plus any extra CPSE portal the admin adds',
    url: 'https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page',
    mark: 'STANDARD',
    intakeRule:
      'All India, in the firm’s categories. Skip IOCL, NTPC, Coal India, and NBCC here; those have their own rows. Link existing tenders instead of duplicating them.',
    kind: 'LIST',
  },
  {
    id: 'nbcc',
    allIndia: true,
    displayName: 'NBCC, all India',
    officialName: 'NBCC e-tendering',
    url: 'https://nbcc.enivida.com',
    extraUrls: 'https://nbccindia.in/webEnglish/Tenders\nhttps://eprocure.gov.in/eprocure/app',
    mark: 'STANDARD',
    intakeRule: 'All India, in the firm’s work categories.',
  },
  {
    id: 'west-bengal',
    displayName: 'West Bengal e-procurement',
    officialName: 'eProcurement System, Government of West Bengal',
    url: 'https://wbtenders.gov.in/nicgep/app',
    mark: 'STANDARD',
    intakeRule: 'West Bengal tenders in the firm’s work categories. This is not an NE search result.',
    state: 'West Bengal',
  },
  {
    id: 'etenders',
    allIndia: true,
    displayName: 'Central eTenders (etenders.gov.in)',
    officialName: 'Central Public Procurement Portal, eTenders instance',
    url: 'https://etenders.gov.in/eprocure/app',
    mark: 'STANDARD',
    intakeRule: 'Same rule as CPPP. Used when a search result points at etenders.gov.in.',
    isDaily: false,
  },
  {
    id: 'official-site',
    allIndia: true,
    displayName: 'Official website notice',
    officialName: 'Tender file downloaded from a government, institution or PSU website',
    url: '',
    mark: 'STANDARD',
    intakeRule: 'A single official file (PDF, DOC, XLS or ZIP) linked straight from a government, institution or PSU website. No CAPTCHA or portal session.',
    isDaily: false,
    kind: 'NOTICE',
  },
  {
    id: 'gepnic',
    displayName: 'Government e-procurement system of NIC (GePNIC)',
    officialName: 'GePNIC product home',
    url: 'https://www.gepnic.gov.in/',
    mark: 'PLATFORM',
    intakeRule:
      'No daily “open GePNIC and copy tenders” task. Use it as the common shape of a tender (organisation chain, tender id, reference number, covers, dates). When the admin adds a future GePNIC instance, it reuses this form.',
    isDaily: false,
    kind: 'PLATFORM',
  },
];

/** Central bodies. A state portal is not in this list. */
export const CENTRAL_SOURCE_IDS = ['iocl', 'ntpc', 'coal-india', 'cppp', 'defence', 'cpse', 'nbcc', 'nrida', 'gem'];

export function isCentralSource(sourceId) {
  return CENTRAL_SOURCE_IDS.includes(sourceId);
}

/** Words almost every works notice carries; they never narrow a search. */
export const GENERIC_SEARCH_WORDS = new Set([
  'government', 'govt', 'official', 'civil', 'construction', 'procurement', 'portal', 'current', 'latest', 'notice', 'notices',
]);

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'of', 'to', 'and', 'or', 'with', 'from', 'by', 'is', 'are',
  'tender', 'tenders', 'bid', 'bids', 'work', 'works', 'job', 'jobs', 'show', 'me', 'find', 'list', 'all',
  'any', 'please', 'new', 'open', 'search',
]);
