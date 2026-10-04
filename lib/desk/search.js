import { prisma } from '@/lib/prisma';
import { AWARDED_STAGES, CENTRAL_SOURCE_IDS, GENERIC_SEARCH_WORDS, HELD_STATUSES, isCentralSource, STOPWORDS } from './constants';
import { addDaysKey, istAt, istDateKey } from './ist';
import { explain, interpretQuery, interpretWithRules } from './ai/interpreter';
import { listSearchKeywords, tenderIdsForKeywords } from './keywords';
import { departmentLabel, readNoticeFacts } from './notice-facts';

function textHas(field, value) {
  return { [field]: { contains: value, mode: 'insensitive' } };
}

/** “tender”, “search”, or a blank box means: show the open library. */
function isLibraryBrowse(query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.length === 0 || words.every((word) => STOPWORDS.has(word));
}

const TENDER_INCLUDE = {
  source: { select: { id: true, displayName: true } },
  selections: { select: { personId: true, frequency: true } },
  instruments: { select: { id: true, category: true, status: true, amount: true } },
  documents: { select: { id: true, type: true, fileName: true } },
  checklist: { select: { label: true, section: true } },
};

export function buildWhere(filters, person, now = new Date()) {
  const and = [];
  if (filters.states?.length) {
    and.push({
      OR: [
        { state: { in: filters.states } },
        { placeOfWorkState: { in: filters.states } },
        { gemConsigneeState: { in: filters.states } },
      ],
    });
  }
  if (filters.sources?.length) and.push({ sourceId: { in: filters.sources } });
  if (filters.work_categories?.length) and.push({ workCategory: { in: filters.work_categories } });
  if (filters.scheme) and.push(textHas('scheme', filters.scheme));
  if (filters.central) {
    and.push({
      OR: [{ allIndia: true }, { sourceId: { in: CENTRAL_SOURCE_IDS } }],
    });
  }
  if (filters.amount_min != null && filters.amount_min !== '') {
    and.push({ estimatedValue: { gte: Number(filters.amount_min) } });
  }
  if (filters.amount_max != null && filters.amount_max !== '') {
    and.push({ estimatedValue: { lte: Number(filters.amount_max) } });
  }
  if (filters.department) {
    const department = String(filters.department).trim();
    if (department) {
      and.push({
        OR: [
          { orgChain: { contains: department, mode: 'insensitive' } },
          { gemBuyer: { contains: department, mode: 'insensitive' } },
        ],
      });
    }
  }
  if (filters.organization) {
    const org = String(filters.organization).trim();
    if (org) {
      and.push({
        OR: [
          { orgChain: { contains: org, mode: 'insensitive' } },
          { gemBuyer: { contains: org, mode: 'insensitive' } },
          { source: { displayName: { contains: org, mode: 'insensitive' } } },
        ],
      });
    }
  }
  if (filters.stage) and.push({ stage: filters.stage });
  if (filters.category) and.push({ category: filters.category });
  if (filters.has_documents) and.push({ documents: { some: {} } });
  if (filters.has_boq) and.push({ documents: { some: { type: 'BOQ' } } });
  if (filters.has_corrigendum) and.push({ documents: { some: { type: 'Corrigendum' } } });
  if (filters.has_pq) {
    and.push({
      OR: [
        { documents: { some: { type: { contains: 'PQ', mode: 'insensitive' } } } },
        { documents: { some: { fileName: { contains: 'pre-qual', mode: 'insensitive' } } } },
        { documents: { some: { fileName: { contains: 'prequal', mode: 'insensitive' } } } },
        { checklist: { some: { section: 'eligibility' } } },
      ],
    });
  }

  if (filters.money === 'sd_held') {
    and.push({ stage: { in: AWARDED_STAGES } });
    and.push({ instruments: { some: { category: 'SD', status: { in: HELD_STATUSES } } } });
    if (person && !person.isAccounts && !person.isAdmin) {
      and.push({ selections: { some: { personId: person.id } } });
    }
    return { AND: and };
  }

  if (filters.closing_within_days != null) {
    const endKey = addDaysKey(istDateKey(now), Math.max(0, filters.closing_within_days));
    and.push({ bidSubmissionEnd: { lte: istAt(addDaysKey(endKey, 1), 0, 0) } });
  }
  if (!filters.include_closed && !filters.stage) {
    and.push({ bidSubmissionEnd: { gte: now } });
    and.push({ stage: { notIn: ['NOT_AWARDED', 'CLOSED'] } });
  }
  return { AND: and };
}

export async function runSearch(query, person, now = new Date(), override = null) {
  // An explicit government ID is stronger than inferred categories/keywords.
  // Otherwise "Water Resources" can be misread as the Water supply category and
  // hide the exact imported record that the user is looking for.
  const ids = [...new Set(String(query || '').match(/\b\d{4}_[A-Za-z0-9]+_\d+_\d+\b/g) || [])];
  if (ids.length === 1) {
    const filters = {
      ...interpretWithRules('', now),
      keywords: [],
      include_closed: true,
      explanation: 'Exact government Tender ID; includes saved open and closed records.',
      via: 'exact_id',
    };
    const rows = await loadRows({ portalTenderId: { equals: ids[0], mode: 'insensitive' } }, filters);
    const facts = await attachSearchFacts(rows);
    return {
      filters,
      rows: rows.map(t => decorateRow(t, person, facts.get(t.id))),
      kind: 'tenders',
      keywordOptions: await listSearchKeywords(),
      departments: await listDepartments(),
    };
  }
  // Only what the user typed narrows a fresh search: places, portals, dates,
  // amounts, and the work words themselves. Gemini's fuller reading (work
  // category, department, scheme, inferred region) comes back as suggestions
  // the user can apply, never as a hidden default.
  let suggested = null;
  let interpreted = override;
  if (!interpreted) {
    const literal = interpretWithRules(query, now, { literal: true });
    const reading = await interpretQuery(query, now);
    suggested = suggestedFilters(reading, literal);
    interpreted = { ...literal, via: reading.via === 'gemini' ? 'gemini' : 'text' };
  }
  const filters = {
    states: [],
    sources: [],
    work_categories: [],
    scheme: null,
    closing_within_days: null,
    money: null,
    keywords: [],
    central: false,
    amount_min: null,
    amount_max: null,
    include_closed: false,
    organization: null,
    department: null,
    has_experience: false,
    has_postponement: false,
    has_extension: false,
    stage: null,
    category: null,
    has_documents: false,
    has_boq: false,
    has_pq: false,
    has_corrigendum: false,
    explanation: '',
    ...interpreted,
  };
  const known = await listSearchKeywords();
  filters.keywords = [...new Set(
    (filters.keywords || [])
      .flatMap((word) => String(word).toLowerCase().split(/[^a-z0-9]+/))
      .map((word) => word.trim())
      .filter((word) => word.length > 1 && !STOPWORDS.has(word) && (override || !GENERIC_SEARCH_WORDS.has(word)))
  )];
  filters.explanation = explain(filters, now);
  if (interpreted.via) filters.via = interpreted.via;
  if (suggested) {
    filters.suggested = suggested;
    filters.explanation = `Matched the words you typed. ${filters.explanation}${suggested.length ? ' Suggested filters are listed if you want to narrow it.' : ''}`;
  }
  const hasFilter =
    filters.states.length || filters.sources.length || filters.work_categories.length || filters.scheme ||
    filters.closing_within_days != null || filters.money || filters.keywords.length || filters.central ||
    filters.amount_min != null || filters.amount_max != null || filters.organization || filters.department || filters.stage ||
    filters.category || filters.has_documents || filters.has_boq || filters.has_pq || filters.has_corrigendum ||
    filters.has_experience || filters.has_postponement || filters.has_extension;
  if (!hasFilter && !isLibraryBrowse(query)) {
    return { filters, rows: [], kind: 'tenders', empty: true, keywordOptions: known, departments: await listDepartments() };
  }
  if (!hasFilter) {
    filters.browse = true;
    filters.explanation = 'Open tenders already in this library, soonest bid submission end first. Closed and not-awarded tenders are left out.';
  }
  const where = await whereFor(filters, person, now);
  let rows = await loadRows(where, filters);
  if (!rows.length && !override && filters.via === 'gemini' && !suggested && !isLibraryBrowse(query)) {
    const rules = interpretWithRules(query, now);
    filters.states = rules.states || [];
    filters.sources = rules.sources || [];
    filters.work_categories = rules.work_categories || [];
    filters.scheme = rules.scheme || null;
    filters.keywords = (rules.keywords || []).map((word) => String(word).trim().toLowerCase()).filter((word) => word.length > 1);
    filters.central = !!rules.central;
    // Preserve the user's open/closed scope even when category interpretation falls back.
    filters.include_closed = !!rules.include_closed;
    filters.via = 'rules';
    filters.widened = true;
    filters.explanation = `${explain(filters, now)} Gemini’s reading matched nothing already saved here, so the same phrase was matched directly without broadening the closing-date filter.`;
    rows = await loadRows(await whereFor(filters, person, now), filters);
  }
  const factsById = await attachSearchFacts(rows);
  // Saved tenders with stored files come first; closing-date order holds inside each group.
  const withFiles = (tender) => (tender.documents?.length ? 0 : 1);
  const ordered = filters.money ? rows : [...rows].sort((a, b) => withFiles(a) - withFiles(b));
  let decorated = ordered.map((tender) => decorateRow(tender, person, factsById.get(tender.id)));
  if (filters.has_experience) decorated = decorated.filter((row) => row.experience.length);
  if (filters.has_postponement) decorated = decorated.filter((row) => row.postponements.length);
  if (filters.has_extension) decorated = decorated.filter((row) => row.extensions.length);
  return {
    filters,
    rows: decorated,
    kind: filters.money ? 'projects' : 'tenders',
    keywordOptions: known,
    departments: await listDepartments(),
  };
}

/** Parts of the AI reading that the typed words did not already apply. */
function suggestedFilters(reading, applied) {
  if (!reading) return [];
  const out = [];
  const add = (key, value, label) => out.push({ key, value, label });
  const states = (reading.states || []).filter((state) => !applied.states.includes(state));
  if (states.length === 8 && reading.ne) add('states', reading.states, 'Northeast states');
  else for (const state of states) add('states', [...applied.states, state], state);
  for (const category of reading.work_categories || []) add('work_categories', [category], category);
  for (const source of (reading.sources || []).filter((id) => !applied.sources.includes(id))) add('sources', [...applied.sources, source], source);
  if (reading.scheme && reading.scheme !== applied.scheme) add('scheme', reading.scheme, `Scheme ${reading.scheme}`);
  if (reading.central && !applied.central) add('central', true, 'Central');
  if (reading.department) add('department', reading.department, reading.department);
  if (reading.closing_within_days != null && applied.closing_within_days == null) add('closing_within_days', reading.closing_within_days, `Closing within ${reading.closing_within_days} days`);
  if (reading.amount_min != null && applied.amount_min == null) add('amount_min', reading.amount_min, `From ₹${Number(reading.amount_min).toLocaleString('en-IN')}`);
  if (reading.amount_max != null && applied.amount_max == null) add('amount_max', reading.amount_max, `Up to ₹${Number(reading.amount_max).toLocaleString('en-IN')}`);
  return out.slice(0, 8);
}

export async function listDepartments() {
  const rows = await prisma.tender.findMany({
    select: { orgChain: true, gemBuyer: true },
    take: 400,
  });
  return [...new Set(rows.map((row) => departmentLabel(row.orgChain, row.gemBuyer)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function attachSearchFacts(rows) {
  const ids = rows.map((row) => row.id);
  const grouped = new Map(ids.map((id) => [id, { documents: [], applications: [] }]));
  if (!ids.length) return grouped;
  const slots = ids.map((_, index) => `$${index + 1}`).join(', ');
  let docs = [];
  let apps = [];
  try {
    docs = await prisma.$queryRawUnsafe(
      `SELECT "id", "tenderId", "type", "fileName", LEFT(COALESCE("extractedText", ''), 6000) AS "extractedText",
              "changeNote", "previousValue", "updatedValue", "docDate"
       FROM "DeskDocument" WHERE "tenderId" IN (${slots})`,
      ...ids
    );
  } catch {
    docs = [];
  }
  try {
    apps = await prisma.$queryRawUnsafe(
      `SELECT "tenderId", "kind", "status", "officeName", "sentOn", "releasedOn"
       FROM "DeskRefundApplication" WHERE "tenderId" IN (${slots})`,
      ...ids
    );
  } catch {
    apps = [];
  }
  for (const doc of docs || []) grouped.get(doc.tenderId)?.documents.push(doc);
  for (const app of apps || []) grouped.get(app.tenderId)?.applications.push(app);
  return grouped;
}

async function whereFor(filters, person, now) {
  const where = buildWhere(filters, person, now);
  if (filters.keywords.length) {
    const clauses = [];
    for (const word of filters.keywords) {
      const tagged = await tenderIdsForKeywords([word]);
      const or = [
        { title: { contains: word, mode: 'insensitive' } },
        { description: { contains: word, mode: 'insensitive' } },
        { placeOfWork: { contains: word, mode: 'insensitive' } },
        { orgChain: { contains: word, mode: 'insensitive' } },
        { gemBuyer: { contains: word, mode: 'insensitive' } },
        { workCategory: { contains: word, mode: 'insensitive' } },
        { documents: { some: { fileName: { contains: word, mode: 'insensitive' } } } },
        { documents: { some: { extractedText: { contains: word, mode: 'insensitive' } } } },
      ];
      if (tagged.length) or.push({ id: { in: tagged } });
      clauses.push({ OR: or });
    }
    where.AND.push({ AND: clauses });
  }
  return where;
}

function loadRows(where, filters) {
  return prisma.tender.findMany({
    where,
    include: TENDER_INCLUDE,
    orderBy: filters.money ? [{ updatedAt: 'desc' }] : [{ bidSubmissionEnd: 'asc' }],
    take: 200,
  });
}

function isPqDoc(doc) {
  const blob = `${doc.type || ''} ${doc.fileName || ''}`.toLowerCase();
  return /\bpq\b|pre-?qual|prequalification/.test(blob);
}

export function decorateRow(t, person, packed = null) {
  const facts = readNoticeFacts({
    documents: packed?.documents || [],
    applications: packed?.applications || [],
    instruments: t.instruments || [],
    tender: t,
  });
  const mine = person ? t.selections?.some((s) => s.personId === person.id) : false;
  const sdHeld = (t.instruments || [])
    .filter((i) => i.category === 'SD' && HELD_STATUSES.includes(i.status))
    .reduce((a, i) => a + (i.amount || 0), 0);
  const emdHeld = (t.instruments || [])
    .filter((i) => i.category === 'EMD' && HELD_STATUSES.includes(i.status))
    .reduce((a, i) => a + (i.amount || 0), 0);
  return {
    id: t.id,
    title: t.title,
    isSample: t.isSample,
    sourceId: t.sourceId,
    sourceName: t.source?.displayName,
    state: t.state,
    allIndia: t.allIndia,
    placeOfWork: t.placeOfWork,
    placeOfWorkState: t.placeOfWorkState,
    gemConsigneeState: t.gemConsigneeState,
    estimatedValue: t.estimatedValue,
    awardedValue: t.awardedValue,
    emdAmount: t.emdAmount,
    bidSubmissionEnd: t.bidSubmissionEnd,
    stage: t.stage,
    scheme: t.scheme,
    workCategory: t.workCategory,
    central: !!(t.allIndia || isCentralSource(t.sourceId)),
    portalTenderId: t.portalTenderId,
    orgChain: t.orgChain,
    gemBuyer: t.gemBuyer,
    category: t.category,
    publishedAt: t.publishedAt,
    bidOpeningAt: t.bidOpeningAt,
    authority: t.orgChain || t.gemBuyer || t.source?.displayName || null,
    department: facts.department || null,
    sourceUrl: t.sourceUrl || null,
    recordKind: (t.documents || []).some((doc) => doc.fileName === 'ai-note.txt') ? 'ai' : 'internal',
    eligibility: eligibilityText(t) || (facts.eligibility.length ? facts.eligibility.join(' ') : null),
    experience: facts.experience,
    postponements: facts.postponements,
    extensions: facts.extensions,
    completion: facts.completion,
    refunds: facts.refunds,
    files: (t.documents || []).map((doc) => ({ id: doc.id, type: doc.type, fileName: doc.fileName })),
    hasDocuments: (t.documents || []).length > 0,
    hasBoq: (t.documents || []).some((doc) => doc.type === 'BOQ'),
    hasCorrigendum: (t.documents || []).some((doc) => doc.type === 'Corrigendum'),
    hasPq: (t.documents || []).some((doc) => isPqDoc(doc)),
    selectedByMe: mine,
    selectionCount: t.selections?.length || 0,
    sdHeld,
    emdHeld,
  };
}

function eligibilityText(tender) {
  try {
    const summary = tender.summaryJson ? JSON.parse(tender.summaryJson) : null;
    const section = summary?.sections?.find((item) => item.key === 'eligibility');
    const text = String(section?.text || '').trim();
    if (text && text !== 'Not found in the uploaded documents.') return text;
  } catch {
    /* summary stays unread */
  }
  const lines = (tender.checklist || []).filter((item) => item.section === 'eligibility').map((item) => item.label).filter(Boolean);
  return lines.length ? lines.join('; ') : null;
}

export { placeLabel } from './format';
