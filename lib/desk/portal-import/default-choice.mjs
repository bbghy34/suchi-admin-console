import { sourceRank } from './source-rank.mjs';
import { preferredDownloadRank } from './preferred-sources.mjs';
import { portalFor } from './identity.mjs';

const ids = text => [...new Set((String(text).match(/\b\d{4}_[a-z0-9]+_\d+_\d+\b|\bGEM\/\d{4}\/[A-Z]+\/\d+\b/gi) || []).map(v => v.toUpperCase()))];
const packages = text => [...new Set((String(text).match(/\b(?:AS|AR|MN|ML|MZ|NL|TR|SK)[-_ ]?\d{2,}(?:[-_ ]\d+)*\b/gi) || []).map(v => v.toUpperCase().replace(/[^A-Z0-9]/g,'')))];
const blob = row => [row.title,row.detail,row.evidence,row.portalTenderId,row.tenderId,row.reference].filter(Boolean).join(' ');
const generic = new Set('tender tenders notice inviting construction supply works work government department years routine maintenance including official documents download procurement road roads nit'.split(' '));
const words = text => new Set((String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter(v => !generic.has(v)));
const reference = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'');

// Only explicit closing dates contribute to round selection. No dates from IDs or snippets without a label.
function closing(candidate) {
  const explicit = candidate.closingDate || candidate.bidSubmissionEnd || candidate.downloadEnd;
  const labeled = blob(candidate).match(/(?:closing\s+date|closes|bid\s+submission\s+end\s+date|document\s+download\s+end\s+date)\s*[:–-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[- ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[- ]\d{4})/i)?.[1];
  const value = explicit || labeled;
  if (!value) return null;
  // Date-only closing is conservative: consider it closed at the beginning of that day.
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Select a default source only with identity evidence. The downloader must still verify the opened notice.
 * Returns {candidate, confidence, reason}, or null when different projects/rounds remain ambiguous.
 */
export function chooseDefaultOfficialNotice(original = {}, candidates = [], { now = Date.now() } = {}) {
  const expected = blob(original), expectedIds = ids(expected), expectedPackages = packages(expected);
  if (expectedIds.length > 1 || expectedPackages.length > 1) return null;
  const expectedRef = reference(original.reference);
  const expectedWords = words(original.title);
  const eligible = [];
  for (const candidate of candidates) {
    const link = candidate?.officialLink;
    let url, source;
    try {
      url = new URL(link);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port) continue;
      source = sourceRank({link,title:candidate.title,detail:blob(candidate)});
    } catch { continue; }
    if (!source.retrievable) continue;
    const actual = blob(candidate), actualIds = ids(actual), actualPackages = packages(actual);
    if (expectedIds.length && (actualIds.length !== 1 || actualIds[0] !== expectedIds[0])) continue;
    if (expectedPackages.length && (actualPackages.length !== 1 || actualPackages[0] !== expectedPackages[0])) continue;
    if (actualIds.length > 1) continue;
    const actualRef = reference(candidate.reference);
    const evidenceRefs = (actual.match(/[A-Za-z0-9][A-Za-z0-9_.()/-]{3,}/g) || []).map(reference);
    const containsRef = expectedRef && (actualRef === expectedRef || (!actualRef && evidenceRefs.includes(expectedRef)));
    if (expectedRef && !containsRef) continue;
    let confidence;
    if (expectedIds.length) confidence = 'exact_id';
    else if (expectedPackages.length) confidence = 'exact_package';
    else if (containsRef) confidence = 'exact_reference';
    else {
      const candidateWords = words(candidate.title);
      const shared = [...expectedWords].filter(word => candidateWords.has(word)).length;
      if (expectedWords.size < 3 || shared < 3 || shared / expectedWords.size < 0.8 || shared / Math.max(1,candidateWords.size) < 0.8) continue;
      confidence = 'strong_title';
    }
    eligible.push({ candidate, confidence, identity:actualIds.length===1?actualIds[0]:reference(candidate.reference) || link,
      closes:closing(candidate), preference:preferredDownloadRank({...source,host:url.hostname,portalId:portalFor(link)?.id}),rank:source.rank });
  }
  if (!eligible.length) return null;
  const bestConfidence = ['exact_id','exact_package','exact_reference','strong_title'].find(level => eligible.some(item => item.confidence === level));
  let choices = eligible.filter(item => item.confidence === bestConfidence);
  const identityCount = rows => new Set(rows.map(item => item.identity)).size;
  if (identityCount(choices) > 1) {
    // A package can have several rounds. Select only if every candidate has a known closing date
    // and exactly one project identity is still open. Unknown dates cannot break a tie safely.
    if (bestConfidence !== 'exact_package' || choices.some(item => item.closes === null)) return null;
    const open = choices.filter(item => item.closes > now);
    if (identityCount(open) !== 1) return null;
    choices = open;
  }
  choices.sort((a,b) => a.preference-b.preference || a.rank-b.rank);
  const {candidate,confidence} = choices[0];
  return {candidate,confidence,reason:confidence === 'exact_package' ? 'Matching package and unambiguous tender round.' : 'Matching official tender identity.'};
}
