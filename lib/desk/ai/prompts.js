/** Default questions for the tender-desk chatbot. Safe to import from the browser. */

export const GEMINI_KEY_PLACEHOLDER = 'YOUR_GEMINI_API_KEY';

export const DESK_PROMPTS = [
  {
    id: 'closing',
    label: 'Closing soon',
    text: 'Which saved tenders close soonest? Give the bid end and what is still missing.',
  },
  {
    id: 'eligibility',
    label: 'Eligibility',
    text: 'List eligibility and the documents to submit. Use the open tender when one is open, otherwise the saved tenders. Say Not available when a fact is missing.',
  },
  {
    id: 'money',
    label: 'EMD and security',
    text: 'List earnest money and security deposit separately. Do not add them together.',
  },
  {
    id: 'dates',
    label: 'Dates and place',
    text: 'List bid end, opening, place of work, and estimated value.',
  },
  {
    id: 'unread',
    label: 'Unread files',
    text: 'Which uploaded files have no readable text?',
  },
  {
    id: 'portals',
    label: 'Daily portals',
    text: 'I will paste a notice. Use only that paste. Daily desks: Northeast states, GeM for a Northeast consignee, Assam, Tripura, central procurement, defence, PMGSY, NRIDA, central PSUs, Coal India on its Northeast filter, IOCL, NTPC, NBCC, and West Bengal. GePNIC is the notice format, not a source to search.',
  },
  {
    id: 'add',
    label: 'Add a tender',
    text: '',
  },
];

export const CHAT_SYSTEM = `You answer from the desk records in this instruction. If one tender is marked open, answer about that tender and name it.
Use only those records. If a fact is missing, say Not available. Do not invent a tender, date, amount, document, or eligibility rule.
Earnest money and security deposit stay separate. Never add them or treat one as the other.
SAMPLE rows are examples, not live notices. Do not give bidding or legal advice.
Do not scrape a portal, solve a captcha, ask for a portal password, or tell anyone to submit a bid, earnest money, or security deposit on a government site.
When you use a figure or a date, name the tender it came from.`;
