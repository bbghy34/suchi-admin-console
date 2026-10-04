import { ALL_STATES, NE_STATES, STOPWORDS } from '../constants';
import { addDaysKey, daysUntil, endOfWeekKey, istAt, istDateKey, formatISTDate } from '../ist';
import { chatJSON, modelConfigured } from './model';
import { geminiJSON, usableGeminiKey } from './gemini';
import { createSearchWorkCache } from './search-work-cache.mjs';

// The same sentence on the same day reads the same; keep a Gemini reading for
// 15 minutes so repeat searches and page reloads do not pay for it again.
const reuseReading = createSearchWorkCache({ ttlMs: 15 * 60 * 1000, maxEntries: 300, cacheable: (reading) => reading?.via === 'gemini' });

export const SEARCH_SYSTEM_PROMPT = `Read one tender search sentence from an Indian construction company and return JSON only.
Your reading is offered to the user as optional filter suggestions; the search itself already matches the words they typed. Suggest only what the sentence supports.
Keys:
states (array of Indian state names or empty), sources (source ids or empty), work_categories (array or empty),
department (the buyer department or organisation named, e.g. "PWD Roads", "NHIDCL", or null),
scheme (string or null), closing_within_days (whole days from today or null), money (null or "sd_held"),
keywords (the work words as typed, separate words, no synonyms), central (boolean), amount_min (rupees or null), amount_max (rupees or null),
include_closed (boolean), explanation (one short sentence saying how you read it).

Places: Northeast, NE and "North East" mean Arunachal Pradesh, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim and Tripura; West Bengal is not Northeast. A city or district means its state (Guwahati, Jorhat, Silchar: Assam; Shillong: Meghalaya; Agartala: Tripura; Imphal: Manipur; Aizawl: Mizoram; Kohima, Dimapur: Nagaland; Itanagar: Arunachal Pradesh; Gangtok: Sikkim).
Sources: name one only when the user names that portal. GePNIC is a portal family, not a source. PMGSY is a scheme, not a state.
Work: map the work to the closest category only when it clearly fits (road, bridge, culvert: Roads and bridges; building, hostel, school, quarters: Buildings; water supply, pipeline: Water supply; electrical, substation: Electrical).
Money: "1 cr" or "1 crore" is 10000000; "1 lakh" or "1 L" is 100000. "Under/below/up to" sets amount_max; "above/over/at least" sets amount_min.
Dates: "this week", "next 7 days", "closing soon" count from today's date given below. Closed or historical tenders only when the user asks for them.
If the sentence is not a tender search, return empty filters and an explanation asking for the work and place.
Never invent a tender, an id, a value, a department or a deadline.`;

/** Enforced by the Gemini API (structured output), so the reading always parses. */
const nullable = (type) => ({ type: [type, 'null'] });
export const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    states: { type: 'array', items: { type: 'string', enum: ALL_STATES } },
    sources: { type: 'array', items: { type: 'string', enum: ['iocl', 'ntpc', 'assam', 'tripura', 'arunachal', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'sikkim', 'gem', 'coal-india', 'cppp', 'defence', 'pmgsy', 'nrida', 'cpse', 'nbcc', 'west-bengal'] } },
    work_categories: { type: 'array', items: { type: 'string', enum: ['Civil works', 'Roads and bridges', 'Buildings', 'Electrical', 'Water supply'] } },
    department: nullable('string'),
    scheme: nullable('string'),
    closing_within_days: nullable('integer'),
    money: { type: ['string', 'null'], enum: ['sd_held', null] },
    keywords: { type: 'array', items: { type: 'string' } },
    central: { type: 'boolean' },
    amount_min: nullable('number'),
    amount_max: nullable('number'),
    include_closed: { type: 'boolean' },
    explanation: { type: 'string' },
  },
  required: ['states', 'sources', 'work_categories', 'department', 'scheme', 'closing_within_days', 'money', 'keywords', 'central', 'amount_min', 'amount_max', 'include_closed', 'explanation'],
  additionalProperties: false,
};

const SOURCE_ID_NOTE = `
Valid source ids: iocl, ntpc, assam, tripura, arunachal, manipur, meghalaya, mizoram, nagaland, sikkim, gem, coal-india, cppp, defence, pmgsy, nrida, cpse, nbcc, west-bengal.
Valid work categories: Civil works, Roads and bridges, Buildings, Electrical, Water supply.`;

const SOURCE_PATTERNS = [
  ['iocl', /\b(iocl|indian\s*oil|indianoil)\b/g],
  ['ntpc', /\bntpc\b/g],
  ['coal-india', /\b(coal\s*india|\bcil\b|coal)\b/g],
  ['gem', /\bgem\b/g],
  ['nbcc', /\bnbcc\b/g],
  ['defence', /\b(defence|defense|defproc|ministry of defence)\b/g],
  ['cppp', /\b(cppp|central (public )?procurement( portal)?|eprocure)\b/g],
  ['nrida', /\b(nrida|nrrda|national rural (roads|infrastructure)[a-z ]*)\b/g],
  ['cpse', /\b(cpse|central psus?|psus?)\b/g],
];

const WORK_CATEGORY_PATTERNS = [
  ['Roads and bridges', /\b(roads?|bridges?|highways?|culverts?)\b/g],
  ['Buildings', /\b(buildings?|hostel|school building|quarters?)\b/g],
  ['Electrical', /\b(electrical|electric|electrification|substation)\b/g],
  ['Water supply', /\b(water\s*supply|water|pipeline|piped water)\b/g],
  ['Civil works', /\b(civil|civil works?)\b/g],
];

function consume(text, re) {
  let matched = false;
  const out = text.replace(re, () => {
    matched = true;
    return ' ';
  });
  return [out, matched];
}

/**
 * Deterministic reading of the query. Always available.
 * `literal` keeps work words (road, building, water) as typed text instead of
 * turning them into a work category, so a search never hides a tender that
 * was filed under a different category.
 */
export function interpretWithRules(query, now = new Date(), { literal = false } = {}) {
  let text = ` ${String(query || '').toLowerCase().replace(/[“”"']/g, ' ').replace(/\s+/g, ' ')} `;
  const result = {
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
    explanation: '',
    ne: false,
  };

  // Money status first, so "security deposit" is not read as keywords.
  let m;
  [text, m] = consume(text, /\b(security (deposit|money)|\bsd\b)( (not yet|not|still|yet) (released|refunded|back|returned))?( (held|pending|waiting|outstanding|with office))?\b/g);
  if (m) result.money = 'sd_held';
  [text, m] = consume(text, /\b(not yet|not|still) (released|refunded|returned|back)\b/g);
  if (m) result.money = 'sd_held';

  [text, m] = consume(text, /\b(including|include|with|also) (closed|expired|past|old|archived|historical)\b/g);
  if (m) result.include_closed = true;
  [text, m] = consume(text, /\b(closed|expired|past|old|archived|historical) (tenders?|bids?)\b/g);
  if (m) result.include_closed = true;

  if (/\b(?:exclude|excluding|without|omit|not)\s+(?:closed|expired|past|old|archived|historical)\b/i.test(String(query || ''))) result.include_closed = false;

  const amounts = readAmounts(text);
  text = amounts.text;
  result.amount_min = amounts.min;
  result.amount_max = amounts.max;

  // Scheme
  [text, m] = consume(text, /\bpmgsy\b/g);
  if (m) result.scheme = 'PMGSY';

  // Northeast
  [text, m] = consume(text, /\b(ne|n\.e\.|north\s*-?\s*east(ern)?( india| states| region)?|northeast( india| states| region)?)\b/g);
  if (m) {
    result.ne = true;
    result.states = [...NE_STATES];
  }

  // Sources
  for (const [id, re] of SOURCE_PATTERNS) {
    [text, m] = consume(text, re);
    if (m && !result.sources.includes(id)) result.sources.push(id);
  }

  [text, m] = consume(text, /\b(central|centre|center)( government| govt| psu| tender| tenders| portal)?\b/g);
  if (m) result.central = true;

  // States (longest names first so "West Bengal" wins over nothing).
  const sortedStates = [...ALL_STATES].sort((a, b) => b.length - a.length);
  for (const state of sortedStates) {
    const re = new RegExp(`\\b${state.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    [text, m] = consume(text, re);
    if (m && !result.states.includes(state)) result.states.push(state);
  }
  [text, m] = consume(text, /\b(wb|bengal)\b/g);
  if (m && !result.states.includes('West Bengal')) result.states.push('West Bengal');

  // Work categories
  for (const [cat, re] of literal ? [] : WORK_CATEGORY_PATTERNS) {
    [text, m] = consume(text, re);
    if (m && !result.work_categories.includes(cat)) result.work_categories.push(cat);
  }

  // Closing windows
  const todayKey = istDateKey(now);
  [text, m] = consume(text, /\b(closing |ending |due |ends? |closes? )?(this week|within the week|by sunday|this weekend)\b/g);
  if (m) result.closing_within_days = daysUntil(istAt(endOfWeekKey(now)), now);
  [text, m] = consume(text, /\b(closing |ending |due )?(next week)\b/g);
  if (m) result.closing_within_days = daysUntil(istAt(addDaysKey(endOfWeekKey(now), 7)), now);
  [text, m] = consume(text, /\b(closing |ending |due )?(this month)\b/g);
  if (m) {
    const [y, mo] = todayKey.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    result.closing_within_days = lastDay - Number(todayKey.split('-')[2]);
  }
  [text, m] = consume(text, /\b(closing |ending |due )?(today)\b/g);
  if (m) result.closing_within_days = 0;
  [text, m] = consume(text, /\b(closing |ending |due )?(tomorrow)\b/g);
  if (m) result.closing_within_days = 1;
  const nDays = text.match(/\b(?:closing |ending |due |within |in |next )?(?:in |within |next )?(\d{1,3}) ?(days?|weeks?)\b/);
  if (nDays) {
    const n = Number(nDays[1]) * (nDays[2].startsWith('week') ? 7 : 1);
    result.closing_within_days = n;
    text = text.replace(nDays[0], ' ');
  }
  [text] = consume(text, /\b(closing|ending|due|closes|ends|soon|urgent|deadline)\b/g);

  // Leftover words are keywords.
  result.keywords = text
    .split(/[^a-z0-9/-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  result.explanation = explain(result, now);
  return result;
}

export function explain(f, now = new Date()) {
  if (f.money === 'sd_held') {
    const bits = [];
    if (f.states?.length) bits.push(f.ne ? 'Northeast states only' : `state ${joinNames(f.states)}`);
    if (f.sources?.length) bits.push(`source ${f.sources.map(sourceName).join(', ')}`);
    return `Projects that got the bid and still have a Security Deposit in a held status${bits.length ? ', ' + bits.join(', ') : ''}; this is a project list, not a fresh-tender list.`;
  }
  const empty =
    !f.states?.length && !f.sources?.length && !f.work_categories?.length && !f.scheme && f.closing_within_days == null &&
    !f.keywords?.length && !f.central && f.amount_min == null && f.amount_max == null;
  if (empty) {
    return 'Nothing to filter on yet — name a state, source, scheme, or money status, for example “tender in NE”, “IOCL”, “PMGSY Meghalaya”, or “security deposit not yet released”.';
  }
  const parts = [];
  if (f.ne || (f.states?.length === 8 && NE_STATES.every((s) => f.states.includes(s)))) {
    parts.push(`Northeast states only (${NE_STATES.join(', ')})`);
  } else if (f.states?.length) {
    parts.push(`${f.states.length > 1 ? 'states' : 'state'} ${joinNames(f.states)}`);
  }
  if (f.sources?.length) {
    parts.push(`source ${joinNames(f.sources.map(sourceName))}${f.sources.length === 1 && ['iocl', 'ntpc', 'coal-india', 'cppp', 'defence', 'nbcc', 'cpse'].includes(f.sources[0]) ? ', all India' : ''}${f.sources.includes('gem') ? ' (already NE-only)' : ''}`);
  } else if (f.states?.length) {
    parts.push('any source');
  }
  if (f.work_categories?.length) parts.push(`work category ${joinNames(f.work_categories)}`);
  if (f.scheme) parts.push(`scheme ${f.scheme}`);
  if (f.closing_within_days != null) {
    const endKey = addDaysKey(istDateKey(now), f.closing_within_days);
    parts.push(
      f.closing_within_days === 0
        ? 'bid submission end today'
        : `bid submission end from today through ${formatISTDate(istAt(endKey))}`
    );
  }
  if (f.central) parts.push('central tenders only');
  if (f.amount_min != null || f.amount_max != null) parts.push(amountPhrase(f.amount_min, f.amount_max));
  if (f.keywords?.length) parts.push(`words ${f.keywords.map((word) => `“${word}”`).join(' and ')} in the title, place, organisation, description, or uploaded text`);
  parts.push(f.include_closed ? 'including closed tenders' : 'leaving out closed and not-awarded tenders');
  parts.push('soonest bid submission end first');
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function rupees(num, unit) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('cr')) return n * 10000000;
  if (u.startsWith('lakh') || u.startsWith('lac')) return n * 100000;
  return n;
}

/** Pull “above 2 crore”, “under 50 lakh”, and “between 50 lakh and 2 crore” out of the sentence. */
function readAmounts(text) {
  let min = null;
  let max = null;
  const between = text.match(/\b(?:between|from)\s+(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs)?\s+(?:and|to)\s+(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs)?\b/);
  if (between) {
    min = rupees(between[1], between[2] || between[4]);
    max = rupees(between[3], between[4] || between[2]);
    text = text.replace(between[0], ' ');
  }
  const above = text.match(/\b(?:above|over|more than|greater than)\s+(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs)?\b/);
  if (above && min == null) {
    min = rupees(above[1], above[2]);
    text = text.replace(above[0], ' ');
  }
  const under = text.match(/\b(?:under|below|less than|upto|up to)\s+(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|lacs)?\b/);
  if (under && max == null) {
    max = rupees(under[1], under[2]);
    text = text.replace(under[0], ' ');
  }
  return { text, min, max };
}

function amountPhrase(min, max) {
  const fmt = (n) => {
    if (n >= 10000000 && n % 10000000 === 0) return `₹${n / 10000000} crore`;
    if (n >= 100000 && n % 100000 === 0) return `₹${n / 100000} lakh`;
    return `₹${n}`;
  };
  if (min != null && max != null) return `estimated value ${fmt(min)} to ${fmt(max)}`;
  if (min != null) return `estimated value ${fmt(min)} and above`;
  return `estimated value up to ${fmt(max)}`;
}

function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

export function sourceName(id) {
  const names = {
    iocl: 'IOCL',
    ntpc: 'NTPC',
    assam: 'Assam portal',
    tripura: 'Tripura portal',
    arunachal: 'Arunachal Pradesh portal',
    manipur: 'Manipur portal',
    meghalaya: 'Meghalaya portal',
    mizoram: 'Mizoram portal',
    nagaland: 'Nagaland portal',
    sikkim: 'Sikkim portal',
    gem: 'GeM',
    'coal-india': 'Coal India',
    cppp: 'CPPP',
    defence: 'Defence',
    pmgsy: 'PMGSY',
    nrida: 'NRIDA',
    cpse: 'Central PSUs',
    nbcc: 'NBCC',
    'west-bengal': 'West Bengal portal',
    gepnic: 'GePNIC',
  };
  return names[id] || id;
}

/** Read the query with Gemini when a key is set, else the rules. */
export function interpretQuery(query, now = new Date()) {
  const text = String(query || '').trim().replace(/\s+/g, ' ');
  if (!text) return readQuery(query, now);
  return reuseReading(`${istDateKey(now)}|${text.toLowerCase()}`, () => readQuery(query, now));
}

async function readQuery(query, now) {
  const rules = interpretWithRules(query, now);
  const geminiKey = usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (geminiKey && String(query || '').trim()) {
    try {
      const { data, error } = await geminiJSON({
        apiKey: geminiKey,
        system: `${SEARCH_SYSTEM_PROMPT}${SOURCE_ID_NOTE}
Today is ${istDateKey(now)} (India time).`,
        user: String(query),
        schema: SEARCH_SCHEMA,
      });
      if (data && typeof data === 'object') return { ...mergeInterpreted(rules, data), via: 'gemini' };
      if (error) console.error('interpretQuery gemini returned no reading, using rules', error);
    } catch (err) {
      console.error('interpretQuery gemini failed, using rules', err?.message);
    }
  }
  if (!modelConfigured()) return { ...rules, via: 'rules' };
  try {
    const out = await chatJSON({ system: `${SEARCH_SYSTEM_PROMPT}${SOURCE_ID_NOTE}
Today is ${istDateKey(now)} (India time).`, user: String(query || '') });
    if (!out || typeof out !== 'object') return { ...rules, via: 'rules' };
    return { ...mergeInterpreted(rules, out), via: 'model' };
  } catch (err) {
    console.error('interpretQuery model failed, using rules', err?.message);
    return { ...rules, via: 'rules' };
  }
}

function mergeInterpreted(rules, out) {
  const validStates = new Set(ALL_STATES);
  const states = Array.isArray(out.states) ? out.states.filter((s) => validStates.has(s)) : [];
  const keywords = Array.isArray(out.keywords) ? out.keywords.map(String).map((word) => word.trim()).filter(Boolean) : [];
  return {
    states: states.length ? states : rules.states,
    sources: Array.isArray(out.sources) && out.sources.length ? out.sources.filter((s) => typeof s === 'string') : rules.sources,
    work_categories: Array.isArray(out.work_categories) && out.work_categories.length ? out.work_categories : rules.work_categories,
    scheme: out.scheme || rules.scheme || null,
    closing_within_days: typeof out.closing_within_days === 'number' ? out.closing_within_days : rules.closing_within_days,
    money: out.money === 'sd_held' ? 'sd_held' : rules.money,
    keywords: keywords.length ? keywords : rules.keywords,
    central: !!out.central || rules.central,
    amount_min: typeof out.amount_min === 'number' ? out.amount_min : rules.amount_min,
    amount_max: typeof out.amount_max === 'number' ? out.amount_max : rules.amount_max,
    include_closed: !!rules.include_closed, // Only an explicit user request may include closed notices.
    explanation: typeof out.explanation === 'string' && out.explanation ? out.explanation : rules.explanation,
    // Offered as a suggestion only; never applied without the user's tap.
    department: typeof out.department === 'string' && out.department.trim() ? out.department.trim().slice(0, 80) : null,
    ne: states.length === 8 && NE_STATES.every((s) => states.includes(s)),
  };
}
