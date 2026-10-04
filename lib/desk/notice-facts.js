const HELD = new Set(['SUBMITTED', 'HELD', 'RENEWAL_DUE', 'REFUND_APPLIED']);
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?[\s./-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s./-]+\d{4}\b/i;
const YEAR_NEAR = /(?:experience|similar works?|completed works?|work experience)[^\n]{0,90}?(\d{1,2})\s*(?:years|year|yrs|yr)\b/gi;
const YEAR_BEFORE = /(\d{1,2})\s*(?:years|year|yrs|yr)\b[^\n]{0,50}?(?:experience|similar works?|completed works?)/gi;

/** Issuing department is the first named part of the organisation chain. */
export function departmentLabel(orgChain, gemBuyer) {
  const raw = String(orgChain || gemBuyer || '').trim();
  if (!raw) return '';
  const part = raw.split(/\s*(?:\||\/|·|>)\s*/)[0].trim();
  return part;
}

/**
 * Facts copied from uploaded text, corrigendum fields, instruments, and refund applications.
 * A line is returned only when that text states it.
 */
export function readNoticeFacts({ documents = [], applications = [], instruments = [], tender = {} } = {}) {
  const packs = (documents || []).map((doc) => ({
    doc,
    text: [doc.extractedText, doc.changeNote, doc.previousValue, doc.updatedValue].filter(Boolean).join('\n'),
  }));
  const experience = unique(packs.flatMap(({ text }) => experiencePhrases(text)));
  const eligibility = unique(packs.flatMap(({ text }) => eligibilityLines(text))).slice(0, 8);
  const postponements = packs.flatMap(({ doc, text }) => sentences(text, /postpon|deferred|put off/i).map((line) => note(doc, line)));
  const extensions = packs.flatMap(({ doc, text }) => sentences(text, /extend|extension|revised (?:bid|date)|date of submission.{0,40}(?:revised|changed)/i).map((line) => note(doc, line)));
  const completion = (documents || [])
    .filter((doc) => doc.type === 'Completion certificate')
    .map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      date: tender.completionDate || doc.docDate || null,
      authority: tender.completionAuthority || null,
      number: tender.completionCertNo || null,
    }));
  const emdHeld = heldSum(instruments, 'EMD');
  const sdHeld = heldSum(instruments, 'SD');
  const refunds = (applications || []).map((app) => ({
    kind: app.kind,
    status: app.status,
    officeName: app.officeName || '',
    sentOn: app.sentOn || null,
    releasedOn: app.releasedOn || null,
  }));
  return {
    department: departmentLabel(tender.orgChain, tender.gemBuyer),
    experience,
    eligibility,
    postponements: uniqueBy(postponements, (item) => item.line),
    extensions: uniqueBy(extensions, (item) => item.line),
    completion,
    emdHeld,
    sdHeld,
    refunds,
  };
}

export function experiencePhrases(text) {
  const source = String(text || '');
  const found = [];
  for (const re of [YEAR_NEAR, YEAR_BEFORE]) {
    re.lastIndex = 0;
    let match = re.exec(source);
    while (match) {
      const years = Number(match[1]);
      if (years >= 1 && years <= 40) found.push(`${years} ${years === 1 ? 'year' : 'years'}`);
      match = re.exec(source);
    }
  }
  return unique(found);
}

function eligibilityLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12 && line.length <= 280)
    .filter((line) => /eligib|pre-?qual|turnover|experience|contractor class|similar work|solvency/i.test(line));
}

function sentences(text, pattern) {
  return String(text || '')
    .split(/(?<=[.])\s+|\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12 && line.length <= 320)
    .filter((line) => pattern.test(line) && DATE_RE.test(line));
}

function note(doc, line) {
  return { line, fileName: doc.fileName || '', documentId: doc.id || null };
}

function heldSum(instruments, category) {
  return (instruments || [])
    .filter((item) => item.category === category && HELD.has(item.status) && item.status !== 'REFUND_APPLIED')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function uniqueBy(list, key) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = key(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}
