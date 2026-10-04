'use client';

import { citedClosingStatus } from '@/lib/desk/portal-import/search-availability.mjs';
import { SuggestedSearches } from '@/components/desk/SuggestedSearches';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpRight, Briefcase, Building2, Check, ChevronDown, Download, FileText, Globe2, Info, Loader2, MapPin, Paperclip, Search, SearchX, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/desk/api';
import { SearchBox } from '@/components/desk/SearchBox';
import { OfficialTenderImport } from '@/components/desk/OfficialTenderImport';
import { TenderTable } from '@/components/desk/TenderTable';
import { Chip, DeadlineBadge, Empty, SampleBadge, Skeleton, StageBadge } from '@/components/desk/ui';
import { daysUntil } from '@/lib/desk/format';
import { HeroLogoCloud } from '@/components/desk/HeroLogoCloud';
import { FileTypeIcon } from '@/components/desk/FileTypeIcon';
import { readSearchCache, writeSearchCache } from '@/components/desk/search-cache';
import { sourceName } from '@/lib/desk/ai/interpreter';
import { ALL_STATES, NE_STATES, STAGE_LABEL, STAGES, TENDER_CATEGORIES } from '@/lib/desk/constants';
import { formatINR, placeLabel } from '@/lib/desk/format';
import { addDaysKey, formatIST, formatISTDate, istAt, istDateKey } from '@/lib/desk/ist';

const AMOUNT_BANDS = [
  { value: '', label: 'Any amount' },
  { value: ':5000000', label: 'Under ₹50 lakh' },
  { value: '5000000:20000000', label: '₹50 lakh – ₹2 crore' },
  { value: '20000000:100000000', label: '₹2 crore – ₹10 crore' },
  { value: '100000000:', label: 'Above ₹10 crore' },
];

export function SearchResults({ query, savedFilters = '' }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(null);
  const [refining, setRefining] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [org, setOrg] = useState('');
  const [dept, setDept] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (savedFilters) params.set('filters', savedFilters);
    const cacheKey = params.toString();
    // A refresh of the same search shows the last answer at once instead of searching again.
    const cached = readSearchCache(cacheKey);
    if (cached) {
      setData(cached);
      setFilters(cached.filters);
      setOrg(cached.filters?.organization || '');
      setDept(cached.filters?.department || '');
      setRefining(false);
      return () => { live = false; };
    }
    setData(null);
    setFilters(null);
    setRefining(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Search timed out', 'TimeoutError')), 180000);
    api(`/api/desk/search?${params.toString()}`, {signal:controller.signal})
      .then((d) => {
        if (!live) return;
        // Do not keep a result that says official downloads are not set up:
        // once an admin adds the key, the next search must see it.
        if (!d.online?.incomplete && d.officialRetrieval?.configured !== false) writeSearchCache(cacheKey, d);
        setData(d);
        setFilters(d.filters);
        setOrg(d.filters?.organization || '');
        setDept(d.filters?.department || '');
      })
      .catch((err) => {
        if (live) setError(controller.signal.reason?.name === 'TimeoutError' ? 'The search is taking longer than expected. Please retry; the official portal may be temporarily slow.' : err.message);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (live) setRefining(false);
      });
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, savedFilters]);

  // Keep a submitted search stable. Explicit filter edits update the URL below;
  // writing inferred filters back here re-ran Gemini and replaced clickable results.

  function drop(mutator) {
    const next = mutator({ ...(filters || data?.filters || {}) });
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('filters', JSON.stringify(persistableFilters(next)));
    router.replace(`/tenders/desk/search?${params.toString()}`);
  }

  const returnTo = searchHref(query, savedFilters);

  const f = filters || data?.filters;
  // Suggestions are only offered on a fresh search; once the user picks filters they own the list.
  const suggested = savedFilters ? [] : (data?.filters?.suggested || []);
  const chips = [];
  if (f?.states?.length) {
    for (const s of f.states) {
      chips.push({
        key: `st-${s}`,
        label: s,
        remove: () => drop((x) => ({ ...x, states: x.states.filter((n) => n !== s), ne: false })),
      });
    }
  }
  if (f?.sources?.length) {
    for (const s of f.sources) {
      chips.push({
        key: `src-${s}`,
        label: sourceName(s),
        remove: () => drop((x) => ({ ...x, sources: x.sources.filter((n) => n !== s) })),
      });
    }
  }
  if (f?.scheme) {
    chips.push({
      key: 'scheme',
      label: `Scheme ${f.scheme}`,
      remove: () => drop((x) => ({ ...x, scheme: null })),
    });
  }
  if (f?.closing_within_days != null) {
    const end = formatISTDate(istAt(addDaysKey(istDateKey(), f.closing_within_days)));
    chips.push({
      key: 'close',
      label: `Closing through ${end}`,
      remove: () => drop((x) => ({ ...x, closing_within_days: null })),
    });
  }
  if (f?.money === 'sd_held') {
    chips.push({
      key: 'money',
      label: 'Security Deposit still held',
      remove: () => drop((x) => ({ ...x, money: null })),
    });
  }
  if (f?.central) {
    chips.push({
      key: 'central',
      label: 'Central',
      remove: () => drop((x) => ({ ...x, central: false })),
    });
  }
  if (f?.amount_min != null || f?.amount_max != null) {
    chips.push({
      key: 'amount',
      label: amountChip(f.amount_min, f.amount_max),
      remove: () => drop((x) => ({ ...x, amount_min: null, amount_max: null })),
    });
  }
  if (f?.department) {
    chips.push({
      key: 'dept',
      label: f.department,
      remove: () => drop((x) => ({ ...x, department: null })),
    });
  }
  if (f?.organization) {
    chips.push({
      key: 'org',
      label: f.organization,
      remove: () => drop((x) => ({ ...x, organization: null })),
    });
  }
  if (f?.stage) {
    chips.push({
      key: 'stage',
      label: STAGE_LABEL[f.stage] || f.stage,
      remove: () => drop((x) => ({ ...x, stage: null })),
    });
  }
  if (f?.category) {
    chips.push({
      key: 'category',
      label: f.category,
      remove: () => drop((x) => ({ ...x, category: null })),
    });
  }
  for (const [key, label] of [
    ['has_documents', 'Documents'],
    ['has_pq', 'PQ'],
    ['has_boq', 'BOQ'],
    ['has_corrigendum', 'Corrigendum'],
    ['has_experience', 'Experience stated'],
    ['has_postponement', 'Bid postponed'],
    ['has_extension', 'Date extended'],
  ]) {
    if (f?.[key]) {
      chips.push({
        key,
        label,
        remove: () => drop((x) => ({ ...x, [key]: false })),
      });
    }
  }
  for (const kw of f?.keywords || []) {
    chips.push({
      key: `kw-${kw}`,
      label: kw,
      remove: () => drop((x) => ({ ...x, keywords: (x.keywords || []).filter((n) => n !== kw) })),
    });
  }

  function setRegion(value) {
    drop((x) => {
      const next = { ...x, states: [], ne: false, central: false };
      if (value === 'ne') {
        next.states = [...NE_STATES];
        next.ne = true;
      } else if (value === 'central') {
        next.central = true;
      } else if (value) {
        next.states = [value];
      }
      return next;
    });
  }

  function setAmount(value) {
    const [min, max] = String(value).split(':');
    drop((x) => ({
      ...x,
      amount_min: min === '' || min == null ? null : Number(min),
      amount_max: max === '' || max == null ? null : Number(max),
    }));
  }

  function addKeyword(e) {
    e.preventDefault();
    const word = keyword.trim();
    if (!word) return;
    setKeyword('');
    drop((x) => ({ ...x, keywords: [...new Set([...(x.keywords || []), word.toLowerCase()])] }));
  }

  function applyDept(e) {
    e.preventDefault();
    const value = dept.trim();
    drop((x) => ({ ...x, department: value || null }));
  }

  function applyOrg(e) {
    e.preventDefault();
    const value = org.trim();
    drop((x) => ({ ...x, organization: value || null }));
  }

  const [moreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const deskCount = data?.rows?.length || 0;
  const webCount = data?.online?.rows?.length || 0;
  const showDesk = tab !== 'web';
  const showWeb = tab !== 'desk';
  const moreCount = [f?.department, f?.organization, f?.stage, ...(f?.keywords || []), ...DOC_TOGGLES.map(([key]) => f?.[key])].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <section className={`d-card d-hero ${query ? 'p-5 sm:p-6' : 'p-5 sm:p-8'}`}>
        <div className="d-aurora" aria-hidden="true" />
        <HeroLogoCloud />
        {query ? null : <span className="d-badge d-badge-accent mb-4"><Sparkles size={12} aria-hidden="true" /> AI tender search</span>}
        {query ? (
          <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-mat-on"><Sparkles size={18} aria-hidden="true" className="text-[var(--md-primary-hover)]" /> <span className="d-gradient-text">AI tender search</span></h1>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight text-mat-on sm:text-[34px] sm:leading-[42px]">Find your next <span className="d-gradient-text">opportunity</span></h1>
        )}
        {query ? null : <p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-mat-muted">Describe the work, place or department. We search your desk and public notices, then bring the official documents into one place.</p>}
        <SearchBox initial={query} autoFocus busy={refining} />
        <SuggestedSearches />
        {query ? null : <ol className="mt-7 grid gap-3 border-t border-[var(--md-border)] pt-5 sm:grid-cols-3" aria-label="How tender search works">
          {HOW_IT_WORKS.map(([Icon, title, text], i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--d-accent-soft)] text-[var(--md-primary-hover)]"><Icon size={15} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-mat-on">{i + 1}. {title}</span>
                <span className="block text-xs leading-5 text-mat-dim">{text}</span>
              </span>
            </li>
          ))}
        </ol>}
      </section>

      <section aria-label="Refine results" className="d-card d-toolbar">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-mat-dim"><SlidersHorizontal size={14} aria-hidden="true" /> Refine</span>
          <select aria-label="Region" className="d-select min-w-0 flex-1 basis-32" value={regionValue(f)} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Any region</option>
            <option value="ne">Northeast</option>
            <option value="central">Central</option>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select aria-label="Value" className="d-select min-w-0 flex-1 basis-32" value={amountValue(f)} onChange={(e) => setAmount(e.target.value)}>
            {amountValue(f) && !AMOUNT_BANDS.some((b) => b.value === amountValue(f)) ? (
              <option value={amountValue(f)}>{amountChip(f.amount_min, f.amount_max)}</option>
            ) : null}
            {AMOUNT_BANDS.map((b) => (
              <option key={b.label} value={b.value}>{b.label}</option>
            ))}
          </select>
          <select
            aria-label="Closing date"
            className="d-select min-w-0 flex-1 basis-32"
            value={f?.closing_within_days ?? ''}
            onChange={(e) => drop((x) => ({ ...x, closing_within_days: e.target.value === '' ? null : Number(e.target.value) }))}
          >
            <option value="">Any deadline</option>
            <option value="7">Within 7 days</option>
            <option value="15">Within 15 days</option>
            <option value="30">Within 30 days</option>
          </select>
          <select aria-label="Tender type" className="d-select min-w-0 flex-1 basis-32" value={f?.category || ''} onChange={(e) => drop((x) => ({ ...x, category: e.target.value || null }))}>
            <option value="">Any type</option>
            {TENDER_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button type="button" aria-pressed={!!f?.include_closed} onClick={() => drop((x) => ({ ...x, include_closed: !x.include_closed }))} className={`d-btn ${f?.include_closed ? 'd-btn-primary' : 'd-btn-outline'}`}>
            Include closed
          </button>
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)} className="d-btn d-btn-ghost ml-auto">
            More filters{moreCount ? <span className="d-tab-count">{moreCount}</span> : null}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {moreOpen ? (
          <div className="d-fade-in grid gap-4 border-t border-[var(--md-border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <form onSubmit={applyDept}>
              <span className="mb-1.5 block text-xs font-medium text-mat-muted">Department</span>
              <div className="flex gap-2">
                <input className="d-input w-full" aria-label="Department" list="desk-departments" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Issuing department" />
                <datalist id="desk-departments">
                  {(data?.departments || []).map((name) => <option key={name} value={name} />)}
                </datalist>
                <button type="submit" className="d-btn d-btn-outline">Apply</button>
              </div>
            </form>
            <form onSubmit={applyOrg}>
              <span className="mb-1.5 block text-xs font-medium text-mat-muted">Organization</span>
              <div className="flex gap-2">
                <input className="d-input w-full" aria-label="Organization" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Authority or buyer" />
                <button type="submit" className="d-btn d-btn-outline">Apply</button>
              </div>
            </form>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-mat-muted">Status</span>
              <select className="d-select w-full" value={f?.stage || ''} onChange={(e) => drop((x) => ({ ...x, stage: e.target.value || null }))}>
                <option value="">Any status</option>
                {STAGES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <form onSubmit={addKeyword}>
              <span className="mb-1.5 block text-xs font-medium text-mat-muted">Keyword</span>
              <div className="flex gap-2">
                <input className="d-input w-full" aria-label="Add keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="bridge, PMGSY, IOCL" />
                <button type="submit" className="d-btn d-btn-outline" disabled={!keyword.trim()}>Add</button>
              </div>
            </form>
            <div className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1.5 block text-xs font-medium text-mat-muted">Papers include</span>
              <div className="flex flex-wrap gap-2">
                {DOC_TOGGLES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={!!f?.[key]}
                    onClick={() => drop((x) => ({ ...x, [key]: !x[key] }))}
                    className={`d-pill ${f?.[key] ? '!border-[var(--md-primary)] !bg-[var(--d-accent-soft)] !text-mat-on' : ''}`}
                  >
                    {f?.[key] ? <Check size={12} aria-hidden="true" /> : null}
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-mat-dim">Filters apply to saved tenders. Public notices are matched by region and department; confirm their dates and documents on the official portal.</p>
            </div>
          </div>
        ) : null}

        {chips.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--md-border)] px-3 py-2.5">
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-mat-dim"><Sparkles size={13} aria-hidden="true" className="text-[var(--md-primary-hover)]" /> Matching</span>
            {chips.map((c) => (
              <Chip key={c.key} onRemove={c.remove}>{c.label}</Chip>
            ))}
            {chips.length > 1 ? (
              <button type="button" onClick={() => drop(() => ({}))} className="px-2 text-xs font-medium text-mat-dim underline-offset-4 hover:text-mat-on hover:underline">
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        {suggested.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--md-border)] px-3 py-2.5">
            <span className="mr-1 text-xs font-medium text-mat-dim">Narrow it with AI suggestions</span>
            {suggested.map((item) => (
              <button
                key={`${item.key}:${item.label}`}
                type="button"
                onClick={() => drop((x) => ({ ...x, [item.key]: item.value, ...(item.key === 'states' ? { ne: item.label === 'Northeast states' } : {}) }))}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--md-border-strong)] px-2.5 py-1 text-xs text-mat-muted transition-colors hover:border-[var(--md-primary-hover)] hover:text-mat-on"
              >
                <span aria-hidden="true">+</span> {item.key === 'sources' ? sourceName(item.value[item.value.length - 1]) : item.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {error ? (
        <div role="alert" className="d-card flex items-start gap-3 !border-red-500/30 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-400"><AlertTriangle size={18} aria-hidden="true" /></span>
          <div className="text-sm">
            <p className="font-semibold text-mat-on">Search could not finish</p>
            <p className="mt-1 text-mat-muted">{error}</p>
            <p className="mt-2 text-mat-dim">Try a shorter description, or search by work and location.</p>
          </div>
        </div>
      ) : null}

      {!data && !error ? (
        <div className="space-y-3">
          <SearchThinking key={`${query}:${savedFilters}`} query={query} />
          {[0, 1, 2].map((i) => <ResultSkeleton key={i} delay={i * 90} />)}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-4">
          {resultNote(data.filters?.explanation || f?.explanation) ? (
            <p className="text-sm text-mat-muted">{resultNote(data.filters?.explanation || f?.explanation)}</p>
          ) : null}
          {data.online?.note ? (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-[var(--md-surface2)] px-3.5 py-3 text-sm text-mat-muted"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {data.online.note}</p>
          ) : null}
          {deskCount || webCount ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={tab} onChange={setTab} items={[
                  ['all', 'All results', deskCount + webCount],
                  ['desk', 'On your desk', deskCount],
                  ['web', 'Discovered online', webCount],
                ]} />
                {refining ? <span className="inline-flex items-center gap-2 text-xs text-mat-dim"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Updating…</span> : null}
              </div>

              <div className="w-full">
              <div className="min-w-0 space-y-4">
              {showDesk && (deskCount || tab === 'desk' || !webCount) ? (
                <section aria-label="Saved on your desk" className="space-y-3">
                  {tab === 'all' ? <SectionLabel icon={Briefcase} title="Saved on your desk" count={deskCount} /> : null}
                  {deskCount ? (
                    data.kind === 'projects' ? <TenderTable rows={data.rows} kind={data.kind} returnTo={returnTo} /> : <ResultCards rows={data.rows} returnTo={returnTo} />
                  ) : (
                    <p className="rounded-xl border border-dashed border-[var(--md-border)] px-4 py-5 text-sm text-mat-dim">No tender on this desk matches.</p>
                  )}
                </section>
              ) : null}

              {/* Stay mounted on the desk tab (just hidden) so a running download keeps its progress. */}
              {webCount || tab === 'web' ? (
                <section aria-label="Discovered online" hidden={!showWeb} className="space-y-3 pt-2">
                  {tab === 'all' ? <SectionLabel icon={Globe2} title="Discovered online" count={webCount} /> : null}
                  <p className="max-w-3xl text-xs leading-5 text-mat-dim">These are search leads. Dates, details and download availability are confirmed when you retrieve the official notice. Older notices may no longer offer downloads.</p>
                  {webCount ? <OnlineCards rows={data.online.rows} returnTo={returnTo} query={query} capability={data.officialRetrieval} /> : <p className="rounded-xl border border-dashed border-[var(--md-border)] px-4 py-5 text-sm text-mat-dim">No public notice matched.</p>}
                </section>
              ) : null}
              </div>

              </div>
            </>
          ) : (
            <Empty icon={SearchX} title={data.online?.incomplete ? 'Official portal check incomplete' : data.empty ? 'No tender matches this search' : `No tender matches “${query || 'this filter'}”`}>
              {data.online?.incomplete ? 'The portal did not finish responding. Retry this search shortly; matching tenders may still be available.' : 'Try a broader description, or remove a filter.'}
              {data.realCount === 0 ? (
                <>
                  {' '}No fetched tenders yet.{' '}
                  <button type="button" className="font-medium text-[var(--md-primary-hover)] underline" onClick={() => router.push('/tenders/desk/fetch')}>
                    Today’s fetch
                  </button>
                </>
              ) : null}
            </Empty>
          )}
        </div>
      ) : null}
    </div>
  );
}


const HOW_IT_WORKS = [
  [Globe2, 'Find a notice', 'Your desk and public portals'],
  [ShieldCheck, 'Get official files', 'CAPTCHAs handled for you'],
  [FileText, 'Review and select', 'Everything in one place'],
];

const DOC_TOGGLES = [
  ['has_documents', 'Documents'],
  ['has_pq', 'PQ'],
  ['has_boq', 'BOQ'],
  ['has_corrigendum', 'Corrigendum'],
  ['has_experience', 'Experience stated'],
  ['has_postponement', 'Bid postponed'],
  ['has_extension', 'Date extended'],
];

/** Feeds the cursor position to the card's spotlight gradient. */
function spotlight(e) {
  const card = e.target.closest?.('.d-spot');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - box.left}px`);
  card.style.setProperty('--my', `${e.clientY - box.top}px`);
}

function Tabs({ value, onChange, items }) {
  const wrap = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector('[aria-selected="true"]');
    if (el) setPos({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.map((item) => item[2]).join(',')]);
  return (
    <div ref={wrap} className="d-tabs" role="tablist" aria-label="Result sources">
      {pos ? <span className="d-tab-indicator" style={pos} aria-hidden="true" /> : null}
      {items.map(([key, label, count]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className="d-tab">
          {label} <span className="d-tab-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

const THINKING = [
  ['Understanding your request', 'Work, place, value and deadlines'],
  ['Searching your Tender Desk', 'Saved and fetched tenders'],
  ['Scanning public notices', 'Government portals and the web'],
];

/** Live "AI is working" panel: shows what the search covers, never fake completion. */
function SearchThinking({ query }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="d-card d-rise overflow-hidden p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--d-accent-soft)] text-[var(--md-primary-hover)]">
          <Sparkles size={17} aria-hidden="true" className="animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="d-shimmer-text text-sm font-semibold">Searching tenders{query ? ` for “${query}”` : ''}</p>
          <p className="mt-0.5 text-xs text-mat-dim">Checking current official notices and gathering search references. Some portals can take up to two minutes.</p>
        </div>
        <span className="d-kbd tabular-nums">{seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`}</span>
      </div>
      <ul className="mt-5 grid gap-4 sm:grid-cols-3">
        {THINKING.map(([title, text], i) => (
          <li key={title} className="d-rise" style={{ animationDelay: `${150 + i * 120}ms` }}>
            <p className="text-xs font-medium text-mat-on">{title}</p>
            <p className="mb-2 text-[11px] text-mat-dim">{text}</p>
            <div className="d-track" style={{ '--delay': `${i * 200}ms` }} />
          </li>
        ))}
      </ul>
      {seconds >= 45 ? <p className="mt-4 text-xs text-mat-dim">Still checking the official portal. We allow slower responses to finish. You can change the query; only your latest search will be shown.</p> : null}
    </div>
  );
}

function SectionLabel({ icon: Icon, title, count }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mat-dim">
      <Icon size={14} aria-hidden="true" /> {title} <span className="d-tab-count normal-case tracking-normal">{count}</span>
    </h2>
  );
}

function ResultSkeleton({ delay = 0 }) {
  return (
    <div className="d-card d-rise p-5" style={{ animationDelay: `${delay}ms` }}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2.5 h-3 w-1/3" />
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}
      </div>
    </div>
  );
}

function ResultCards({ rows, returnTo }) {
  return (
    <ul className="space-y-3" onMouseMove={spotlight}>
      {rows.map((row, i) => {
        const href = tenderHref(row.id, returnTo);
        const region = placeLabel(row) || row.state || '';
        const left = row.bidSubmissionEnd ? daysUntil(row.bidSubmissionEnd) : null;
        const urgency = left == null || left < 0 ? '' : left <= 3 ? 'd-urgent-danger' : left <= 7 ? 'd-urgent-warn' : '';
        return (
          <li key={row.id} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }} className={`d-card d-card-hover d-spot d-rise group p-5 ${urgency}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <StageBadge stage={row.stage} />
                  <DeadlineBadge value={row.bidSubmissionEnd} />
                  <SampleBadge on={row.isSample} />
                </div>
                <a href={href} className="text-[15px] font-semibold leading-6 text-mat-on decoration-[var(--md-primary)] underline-offset-4 hover:underline">{row.title}</a>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mat-dim">
                  {row.department ? <span className="inline-flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> {row.department}</span> : null}
                  {region ? <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {region}</span> : null}
                  {row.sourceName ? <span className="inline-flex items-center gap-1"><Globe2 size={12} aria-hidden="true" /> {row.sourceName}</span> : null}
                </p>
              </div>
              <a href={href} className="d-btn d-btn-outline group-hover:border-[var(--md-primary)]">View <ArrowRight size={14} aria-hidden="true" /></a>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--md-surface2)] p-3 text-sm sm:grid-cols-4">
              <Fact label="Value" value={row.estimatedValue == null ? '—' : formatINR(row.estimatedValue)} strong />
              <Fact label="EMD" value={row.emdAmount == null ? '—' : formatINR(row.emdAmount)} />
              <Fact label="Bid end" value={row.bidSubmissionEnd ? formatIST(row.bidSubmissionEnd) : '—'} />
              <Fact label="Published" value={row.publishedAt ? formatIST(row.publishedAt) : '—'} />
            </dl>
            <details className="group/d mt-3 text-sm leading-6 text-mat-muted">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-mat-dim hover:text-mat-on">
                <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open/d:rotate-180" /> Eligibility and project details
              </summary>
              <div className="mt-2 space-y-1">
                <p className="line-clamp-3"><span className="text-mat-dim">Eligibility · </span>{row.eligibility || 'Not in the papers'}</p>
                <p><span className="text-mat-dim">Experience · </span>{row.experience?.length ? row.experience.join(', ') : 'Not in the papers'}</p>
                {row.postponements?.length ? <p><span className="text-mat-dim">Bid postponed · </span>{row.postponements.map((item) => item.line).join(' ')}</p> : null}
                {row.extensions?.length ? <p><span className="text-mat-dim">Extension · </span>{row.extensions.map((item) => item.line).join(' ')}</p> : null}
                <p>
                  <span className="text-mat-dim">EMD still held · </span>{row.emdHeld > 0 ? formatINR(row.emdHeld) : 'None'}
                  <span className="text-mat-dim"> · Security deposit still held · </span>{row.sdHeld > 0 ? formatINR(row.sdHeld) : 'None'}
                </p>
                <p><span className="text-mat-dim">Completion certificate · </span>{completionText(row.completion)}</p>
                <p>
                  <span className="text-mat-dim">EMD return · </span>{refundText(row.refunds, 'EMD')}
                  <span className="text-mat-dim"> · Security deposit return · </span>{refundText(row.refunds, 'SD')}
                </p>
              </div>
            </details>
            <DownloadRow files={row.files} />
          </li>
        );
      })}
    </ul>
  );
}

const SOURCE_BADGES = {
  notice: ['d-badge-neutral', 'Supported official notice'],
  'portal-detail': ['d-badge-neutral', 'Supported official portal'],
  'portal-id': ['d-badge-neutral', 'Supported official portal'],
  'official-file': ['d-badge-ok', 'Official file link'],
  portal: ['d-badge-neutral', 'Official portal'],
  'official-page': ['d-badge-neutral', 'Official website'],
  aggregator: ['d-badge-warn', 'Copy on a tender listing site'],
};

/** How close the result is to a file the desk can save. */
function SourceBadge({ row }) {
  const badge = SOURCE_BADGES[row.sourceKind];
  if (!badge) return null;
  return <span className={`d-badge ${badge[0]}`}>{row.retrievable ? <Download size={11} aria-hidden="true" /> : null}{badge[1]}</span>;
}

function hostOf(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function pathOf(link) {
  try { return new URL(link).pathname; } catch { return String(link || ''); }
}

function decodeName(name) {
  try { return decodeURIComponent(String(name || 'Document')); } catch { return String(name || 'Document'); }
}

/** Site logo, or the file's own type for a direct official file; a monogram when neither loads. */
function ResultVisual({ row }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(row.link);
  const file = /\.(pdf|docx?|xlsx?|zip)$/i.test((() => { try { return new URL(row.link).pathname; } catch { return ''; } })());
  const mono = monogram(host);
  return (
    <span className="d-result-visual" data-kind={row.sourceKind || 'other'} aria-hidden="true">
      {file ? <FileTypeIcon fileName={pathOf(row.link)} size={34} />
        : !failed && host ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} />
        : <span className="text-[11px] font-bold tracking-wide">{mono}</span>}
      {row.retrievable ? <span className="d-result-visual-dot"><Download size={9} /></span> : null}
    </span>
  );
}

const MONOGRAMS = [
  [/^(eprocure|etenders)\.gov\.in$/, 'CPPP'], [/gem\.gov\.in$/, 'GeM'], [/^assamtenders/, 'AS'], [/^tripuratenders/, 'TR'],
  [/^arunachaltenders/, 'AR'], [/^manipurtenders/, 'MN'], [/^meghalayatenders/, 'ML'], [/^mizoramtenders/, 'MZ'],
  [/^nagalandtenders/, 'NL'], [/^wbtenders/, 'WB'], [/^pmgsytenders/, 'PMGSY'], [/^iocletenders/, 'IOCL'],
  [/^eprocurentpc/, 'NTPC'], [/^coalindiatenders/, 'CIL'], [/^defproc/, 'DEF'], [/sikkim\.gov\.in$/, 'SK'],
];

function monogram(host) {
  const hit = MONOGRAMS.find(([re]) => re.test(host));
  if (hit) return hit[1];
  const name = host.split('.')[0] || '?';
  return (name.length <= 5 ? name : name.slice(0, 3)).toUpperCase();
}

function ClosingChip({ text }) {
  return (
    <span className="hidden shrink-0 flex-col items-end rounded-lg border border-[var(--md-border)] px-2.5 py-1.5 text-right sm:flex">
      <span className="text-[10px] font-medium uppercase tracking-wider text-mat-dim">Closes</span>
      <span className="text-xs font-semibold text-mat-on">{text}</span>
    </span>
  );
}

function CopyLink({ href }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="d-btn d-btn-ghost !h-8 !px-2.5 !text-xs" onClick={async () => {
      try { await navigator.clipboard.writeText(href); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ }
    }}>
      {done ? <Check size={13} aria-hidden="true" /> : <Paperclip size={13} aria-hidden="true" />} {done ? 'Copied' : 'Copy link'}
    </button>
  );
}

function OnlineCards({ rows, query, capability, returnTo }) {
  return (
    <ul className="space-y-3" onMouseMove={spotlight}>
      {rows.map((row, i) => {
        const facts = citedMetrics(row.detail);
        const blurb = plainCite(row.detail);
        const split = splitTitle(onlineTitle(row, blurb));
        const title = split.title;
        if (!facts.authority && split.authority) facts.authority = split.authority;
        if (!facts.reference && split.reference) facts.reference = split.reference;
        const metrics = [
          facts.value ? ['Value', facts.value] : null,
          facts.emd ? ['EMD', facts.emd] : null,
          facts.tenderId ? ['Tender ID', facts.tenderId] : null,
          facts.reference ? ['Reference', facts.reference] : null,
        ].filter(Boolean);
        return (
          <li key={row.link} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }} className="d-card d-card-hover d-spot d-rise d-result p-5">
            <div className="flex items-start gap-4">
              <ResultVisual row={row} />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {SOURCE_BADGES[row.sourceKind] ? <SourceBadge row={row} /> : <span className="d-badge d-badge-accent"><Globe2 size={11} aria-hidden="true" /> Web lead</span>}
                  <span className="text-xs text-mat-dim">{row.site || 'Public source'}</span>
                </div>
                <a href={row.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-[15px] font-semibold leading-6 text-mat-on decoration-[var(--md-primary)] underline-offset-4 hover:underline">
                  {title} <ArrowUpRight size={14} className="inline text-mat-dim" aria-label="Opens source in a new tab" />
                </a>
                {[facts.authority, facts.location].some(Boolean) ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mat-dim">
                    {facts.authority && facts.authority !== title ? <span className="inline-flex items-center gap-1"><Building2 size={12} aria-hidden="true" /> {facts.authority}</span> : null}
                    {facts.location && facts.location !== facts.authority && facts.location !== title ? <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {facts.location}</span> : null}
                  </p>
                ) : null}
              </div>
              {facts.closing ? <ClosingChip text={facts.closing} /> : null}
            </div>
            {facts.closing ? <p className="mt-2 text-xs text-mat-muted sm:hidden"><span className="text-mat-dim">Closes · </span>{facts.closing}</p> : null}
            {citedClosingStatus(row)?.past ? <p className="mt-2 text-xs text-amber-700" role="note">Closing date passed · from the search citation. Files may still be available; the official notice must be checked.</p> : null}
            {metrics.length ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-[var(--md-surface2)] px-4 py-3 text-sm sm:flex sm:flex-wrap sm:gap-x-10">
                {metrics.map(([label, value], i) => <Fact key={label} label={label} value={value} strong={i === 0 && label === 'Value'} />)}
              </dl>
            ) : null}
            {row.eligibility ? <p className="mt-3 text-sm leading-6 text-mat-muted"><span className="text-mat-dim">Eligibility · </span>{plainCite(row.eligibility)}</p> : null}
            {blurb ? (
              <details className="group/d mt-3 text-sm text-mat-muted">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-mat-dim hover:text-mat-on">
                  <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open/d:rotate-180" /> Read search evidence
                </summary>
                <blockquote className="mt-2 border-l-2 border-[var(--md-primary)] pl-3 leading-6">{blurb}</blockquote>
                <p className="mt-2 text-xs text-mat-dim">This excerpt comes from search references. Retrieve the official files to confirm the details.</p>
              </details>
            ) : null}
            {row.documents?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.documents.map((doc) => (
                  <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer" className="d-pill min-w-0 max-w-full overflow-hidden">
                    <FileTypeIcon fileName={pathOf(doc.url)} size={16} /> <span className="min-w-0 truncate">{decodeName(doc.name)}</span>
                  </a>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <a href={row.link} target="_blank" rel="noreferrer" className="d-btn d-btn-ghost !h-8 !px-2.5 !text-xs"><ArrowUpRight size={13} aria-hidden="true" /> Open source</a>
              <CopyLink href={row.link} />
            </div>
            <OfficialTenderImport key={`${query}:${row.link}`} row={row} query={query} capability={capability} returnTo={returnTo} />
          </li>
        );
      })}
    </ul>
  );
}

function DownloadRow({ files }) {
  if (!files?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--md-border)] pt-3">
      {files.map((file) => (
        <a
          key={file.id}
          className="d-pill"
          href={`/api/desk/documents/${file.id}?download=1`}
          download={file.fileName}
        >
          <FileTypeIcon fileName={file.fileName} size={16} /> {file.type}
        </a>
      ))}
    </div>
  );
}

function resultNote(text) {
  const note = String(text || '').replace(/^Gemini read this search\.\s*/i, '').trim();
  if (/no open tender matched/i.test(note)) return 'No open tender matched. Closed tenders already on this desk are included.';
  return '';
}

function searchHref(query, savedFilters) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (savedFilters) params.set('filters', savedFilters);
  const text = params.toString();
  return text ? `/tenders/desk/search?${text}` : '/tenders/desk/search';
}

function tenderHref(id, returnTo) {
  return `/tenders/desk/tenders/${id}?from=${encodeURIComponent(returnTo || '/tenders/desk/search')}`;
}

function persistableFilters(filters) {
  return {
    states: filters.states || [],
    sources: filters.sources || [],
    work_categories: filters.work_categories || [],
    scheme: filters.scheme || null,
    closing_within_days: filters.closing_within_days ?? null,
    money: filters.money || null,
    keywords: filters.keywords || [],
    central: !!filters.central,
    ne: !!filters.ne,
    amount_min: filters.amount_min ?? null,
    amount_max: filters.amount_max ?? null,
    include_closed: !!filters.include_closed,
    organization: filters.organization || null,
    department: filters.department || null,
    has_experience: !!filters.has_experience,
    has_postponement: !!filters.has_postponement,
    has_extension: !!filters.has_extension,
    stage: filters.stage || null,
    category: filters.category || null,
    has_documents: !!filters.has_documents,
    has_boq: !!filters.has_boq,
    has_pq: !!filters.has_pq,
    has_corrigendum: !!filters.has_corrigendum,
    via: filters.via || null,
  };
}

function citedMetrics(detail) {
  const text = String(detail || '');
  return {
    authority: citedField(text, 'Issuing Authority') || citedField(text, 'Department'),
    location: citedField(text, 'Location'),
    value: citedField(text, 'Estimated Value') || citedField(text, 'Tender Value'),
    emd: citedField(text, 'EMD'),
    tenderId: citedField(text, 'Tender ID'),
    reference: citedField(text, 'Tender Reference No'),
    closing: citedField(text, 'Closing Date') || citedField(text, 'Bid Submission End Date') || citedField(text, 'Last Date(?: of Submission)?') || citedField(text, 'Due Date'),
  };
}

function squeeze(text) {
  return String(text || '').replace(/\s+/g, ' ').replace(/(.{12,}?)\s+\1/g, '$1').trim();
}

function onlineTitle(row, blurb) {
  const title = String(row.title || '').trim();
  const host = !title || title === row.site || /^[\w.-]+\.[a-z]{2,}$/i.test(title);
  if (!host && !/^\d/.test(title)) return title;
  const source = String(row.detail || blurb || '').replace(/[*`]/g, '').replace(/\s+/g, ' ');
  const named = source.match(/(?:Tender\s+)?(?:Title|Name of (?:the )?Work|Work Description)\s*:\s*([^.]{12,160}?)(?=\s+(?:Tender ID|Tender Reference|Reference|Issuing|Department|Organisation|Organization|Location|Closing|EMD|Estimated)\b|[.]|$)/i);
  if (named) return squeeze(named[1]).split(/\s+(?:Tender ID|Tender Reference|Issuing|Department)\s*:/i)[0];
  const work = source.match(/(?:Construction|Repair|Improvement|Supply|Widening|Resurfacing|Upgradation)[^.]{12,160}/i);
  if (work) return squeeze(work[0]).split(/\s+(?:Tender ID|Tender Reference|Issuing|Department)\s*:/i)[0];
  try {
    const slug = new URL(row.link).pathname.split('/').filter(Boolean).pop() || '';
    if (slug.includes('-') && /road|repair|construction|supply|tender/i.test(slug)) {
      const words = slug.replace(/20\d{2}.*$/, '').replace(/-/g, ' ').trim();
      if (words.length > 12) return words.charAt(0).toUpperCase() + words.slice(1);
    }
  } catch { /* retain the source title */ }
  return 'Tender notice on ' + (row.site || title || 'public source');
}

/** Search titles often carry "… Portal: X Authority: Y" tails; keep the work, lift the authority. */
function splitTitle(raw) {
  const text = String(raw || '').replace(/\s*\(\[[^\]]*\]?\(?[^)]*\)?\)?/g, '').replace(/\s+/g, ' ').trim();
  const authority = (text.match(/\bAuthority\s*:\s*([^:]+?)(?=\s+\w+\s*:|$)/i) || [])[1] || '';
  const reference = (text.match(/\bTender Ref(?:erence)?(?:\s+(?:Number|No\.?))?\s*:\s*(\S+)/i) || [])[1] || '';
  const title = text.split(/\s+(?:Portal|Authority|Department|Tender ID|Tender Ref(?:erence)?(?:\s+(?:Number|No\.?))?|Location|Organi[sz]ation(?:\s+Chain)?)\s*:/i)[0].replace(/[\s,;:(\[-]+$/, '').trim();
  return { title: title || text, authority: authority.trim(), reference: reference.replace(/[,;]+$/, '') };
}

function citedField(text, label) {
  const pattern = new RegExp(`(?:\\*\\*\\s*)?${label}\\s*\\.?\\s*:\\**\\s*\`?([^\\n*\`]{1,80})`, 'i');
  const match = String(text || '').match(pattern);
  if (!match) return '';
  let value = match[1].replace(/\s+/g, ' ').replace(/[`,*]+$/g, '').trim();
  if (/value|emd|fee/i.test(label)) {
    const money = value.match(/₹\s?[\d,]+(?:\.\d+)?(?:\s*(?:crore|cr|lakh))?/i);
    return money ? money[0].replace(/\s+/g, '') : '';
  }
  value = value.split(/ (?:Tender|EMD|Portal|Reference|Location|Estimated)\b/i)[0].split('₹')[0].trim();
  return value.length > 72 ? `${value.slice(0, 69)}…` : value;
}

function plainCite(detail) {
  let text = String(detail || '')
    .replace(/`+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/(.{16,}?)\s+\1/g, '$1');
  if (text.length < 24) return '';
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function completionText(files) {
  if (!files?.length) return 'Not uploaded';
  return files.map((file) => {
    const when = file.date ? formatISTDate(file.date) : '';
    return [file.fileName, when].filter(Boolean).join(', ');
  }).join('; ');
}

function refundText(refunds, kind) {
  const rows = (refunds || []).filter((refund) => refund.kind === kind);
  if (!rows.length) return 'No return application';
  return rows.map((refund) => {
    const when = refund.sentOn ? `sent ${formatISTDate(refund.sentOn)}` : '';
    const released = refund.releasedOn ? `released ${formatISTDate(refund.releasedOn)}` : '';
    return [refund.status, refund.officeName, when, released].filter(Boolean).join(' · ');
  }).join('; ');
}

function Fact({ label, value, strong }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-mat-dim">{label}</dt>
      <dd title={typeof value === 'string' ? value : undefined} className={`mt-0.5 break-words tabular-nums ${strong ? 'text-base font-semibold text-mat-on' : 'text-mat-on'}`}>{value}</dd>
    </div>
  );
}

function regionValue(f) {
  if (!f) return '';
  if (f.central && !f.states?.length) return 'central';
  if (f.ne || (f.states?.length === NE_STATES.length && NE_STATES.every((s) => f.states.includes(s)))) return 'ne';
  if (f.states?.length === 1) return f.states[0];
  return '';
}

function amountValue(f) {
  if (f?.amount_min == null && f?.amount_max == null) return '';
  return `${f.amount_min ?? ''}:${f.amount_max ?? ''}`;
}

function amountChip(min, max) {
  if (min != null && max != null) return `${formatINR(min)} – ${formatINR(max)}`;
  if (min != null) return `${formatINR(min)} and above`;
  return `Up to ${formatINR(max)}`;
}
