import { searchLiveOfficial } from '@/lib/desk/portal-import/live-search.mjs';
import { matchesLiveSearch, mergeLiveSearchRows, officialSearchProblem, officialSearchProblemMessage, preferCheckedPortalListings } from '@/lib/desk/portal-import/live-search-results.mjs';
import { filterPreferredSearchResults } from '@/lib/desk/portal-import/preferred-search-results.mjs';
import { applyVerifiedAvailability } from '@/lib/desk/portal-import/verified-availability.mjs';
import { rankByCitedClosing } from '@/lib/desk/portal-import/search-availability.mjs';
import { attachSavedTenders } from '@/lib/desk/portal-import/saved-search-results.mjs';
import { matchesRequestedPortal } from '@/lib/desk/portal-import/search-scope.mjs';
import { requirePerson } from '@/lib/desk/auth';
import { handler, ok } from '@/lib/desk/api';
import { runSearch } from '@/lib/desk/search';
import { onlineTenderSearch } from '@/lib/desk/ai/online-search';
import { listOnlineHits } from '@/lib/desk/online-store';
import { canUploadFetch, fetchAssigneeFor } from '@/lib/desk/fetch-day';
import { twoCaptchaKeyStatus } from '@/lib/two-captcha';
import { prisma } from '@/lib/prisma';
import { rankRows } from '@/lib/desk/portal-import/source-rank.mjs';
import { rankByFiles } from '@/lib/desk/portal-import/file-rank.mjs';

export const maxDuration = 180;

export const GET = handler(async (req) => {
  const person = await requirePerson();
  const params = new URL(req.url).searchParams;
  const q = params.get('q') || '';
  let override = null;
  const raw = params.get('filters');
  if (raw) {
    try {
      override = JSON.parse(raw);
    } catch {
      override = null;
    }
  }
  const [result, online, saved, realCount, assignment, official] = await Promise.all([
    runSearch(q, person, new Date(), override),
    q.trim() ? onlineTenderSearch(q) : Promise.resolve({ rows: [], note: '' }),
    q.trim() ? listOnlineHits(q, { states: override?.states || [], department: override?.department || '' }).catch(() => []) : Promise.resolve([]),
    prisma.tender.count({ where: { isSample: false } }),
    fetchAssigneeFor(),
    searchLiveOfficial(q, {states: Array.isArray(override?.states) ? override.states : [], deadlineMs:90000}).catch(() => ({rows:[],diagnostics:{error:'Portal check could not finish'}})),
  ]);
  const states = result.filters?.states || override?.states || [];
  const department = result.filters?.department || override?.department || '';
  const verified = (official.rows || []).filter(row => matchesLiveSearch(row, q, result.filters || override || {})).map(row => ({...row, detail:`State: ${row.state}. ${row.detail}`, saved:false}));
  const citations = (online.rows || []).filter((row) => citedMatches(row, states, department)).map((row) => ({ ...row, saved: false }));
  const live = mergeLiveSearchRows(verified, citations);
  const seen = new Set(live.map((row) => row.link));
  const cached = saved.filter((row) => !seen.has(row.link) && citedMatches(row, states, department));
  // Official portals and downloadable official files first, aggregator copies last.
  const eligible = filterPreferredSearchResults([...live, ...cached].filter(row => matchesRequestedPortal(q, row)), {includeClosed: !!result.filters?.include_closed});
  const storedRows = await attachSavedTenders(prisma, rankByCitedClosing(rankRows(eligible)));
  const currentRows = preferCheckedPortalListings(storedRows, official.diagnostics, {includeClosed: !!result.filters?.include_closed});
  const availableRows = await applyVerifiedAvailability(prisma, currentRows, {includeClosed: !!result.filters?.include_closed});
  // Notices with downloadable official files come first, then ones citing their own file.
  const rows = rankByFiles(availableRows);
  let note = online.note || '';
  if (!rows.length && (live.length || cached.length)) note = 'No matching preferred official notice remains after checking cited dates and known download availability. Try a more specific work or location, or explicitly include closed tenders.';
  if ((online.rows || []).length && !live.length && (states.length || department)) {
    note = 'Cited pages did not name this region or department, so they are not listed.';
  }
  if (!rows.length && cached.length === 0 && saved.length) {
    note = note || 'Saved public pages did not match this region or department.';
  }
  if (!rows.length && currentRows.length < storedRows.length) note = 'The current listing on the requested state portal was checked. Undated search citations from that portal are hidden because they could not be confirmed current. Other preferred portals may still have matching tenders; you can also explicitly include closed tenders.';
  const incomplete = officialSearchProblem(official.diagnostics);
  if (incomplete) note = officialSearchProblemMessage(rows.length > 0);
  const officialRetrieval = { allowed: (person.isAdmin || person.isExecutive) && canUploadFetch(person, assignment), configured: twoCaptchaKeyStatus().configured };
  return ok({ ...result, officialRetrieval, online: { rows, note, incomplete }, realCount, query: q });
});

function citedMatches(row, states, department) {
  const blob = `${row.title || ''} ${row.detail || ''} ${row.site || ''} ${row.eligibility || ''}`.toLowerCase();
  if (states?.length) {
    const named = states.some((state) => blob.includes(String(state).toLowerCase()));
    const northeast = states.length >= 8 && /\bnortheast\b|\bnorth east\b/.test(blob);
    if (!named && !northeast) return false;
  }
  if (department && !blob.includes(String(department).toLowerCase())) return false;
  return true;
}
