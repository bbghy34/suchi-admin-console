'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Shield, ShieldCheck } from 'lucide-react';
import ModuleHeader from '@/components/layout/ModuleHeader';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ChoiceBadge,
  ChoiceFilter,
  DonutCard,
  MODE_SLICES,
  THROUGH_SLICES,
  matchesChoice,
  optionLabel,
  sliceTotals,
} from '@/components/tenders/MoneyChoiceCharts';
import ExportButtons, { amountCell } from '@/components/tenders/ExportButtons';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoadingState,
  TableEmptyState,
} from '@/components/ui/Table';

const STATUS = {
  overdue: { label: 'Overdue', color: '#ef5350' },
  today: { label: 'Expires today', color: '#ffa726' },
  soon: { label: 'Expires in 7 days', color: '#f9a825' },
  upcoming: { label: 'Expires in 30 days', color: '#5c6bc0' },
  later: { label: 'Later', color: '#2e7d32' },
  none: { label: 'No expire date', color: '#90a4ae' },
};

const FILTERS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['soon', 'Due soon'],
  ['later', 'Later'],
  ['none', 'No date'],
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EXPORT_COLUMNS = [
  { label: 'Tender ID', value: (row) => row.tenderId },
  { label: 'Title and ref no', value: (row) => row.titleAndRefNo, wide: true },
  { label: 'Organisation', value: (row) => row.organisationChain },
  { label: 'Result', value: () => 'Win' },
  { label: 'SD money (INR)', value: (row) => amountCell(row.sdMoney), amount: true },
  { label: 'Issue date', value: (row) => row.sdIssueDate || '' },
  { label: 'Expire date', value: (row) => row.sdExpireDate || '' },
  { label: 'Days left', value: (row) => row.days },
  { label: 'Status', value: (row) => STATUS[row.status].label },
  { label: 'Money office', value: (row) => row.sdMoneyOffice || '' },
  { label: 'SD through', value: (row) => (row.sdThrough ? optionLabel(THROUGH_SLICES, row.sdThrough) : '') },
  { label: 'SD mode', value: (row) => (row.sdMode ? optionLabel(MODE_SLICES, row.sdMode) : '') },
  { label: 'SD docs', value: (row) => row.docs.map((doc) => doc.name).join('; ') },
];

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function daysUntil(date) {
  if (!date) return null;
  const start = Date.parse(`${localToday()}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  return Math.round((end - start) / 86400000);
}

function trackStatus(days) {
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  if (days <= 30) return 'upcoming';
  return 'later';
}

function daysLabel(days) {
  if (days == null) return 'No expire date';
  if (days === 0) return 'Expires today';
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`;
  const overdue = Math.abs(days);
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
}

function formatAmount(value) {
  if (value == null || value === '') return '—';
  try {
    const amount = BigInt(value);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return `₹${String(value)}`;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount));
  } catch {
    return '—';
  }
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function barWidth(amount, max) {
  try {
    const value = BigInt(amount || 0);
    const top = BigInt(max || 0);
    if (top <= 0n || value <= 0n) return 0;
    return Number((value * 10000n) / top) / 100;
  } catch {
    return 0;
  }
}

function sumAmounts(rows) {
  return rows.reduce((total, row) => {
    try {
      return total + BigInt(row.sdMoney || 0);
    } catch {
      return total;
    }
  }, 0n);
}

function monthCells(cursor) {
  const [year, month] = cursor.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const pad = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function monthLabel(cursor) {
  const [year, month] = cursor.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(cursor, step) {
  const [year, month] = cursor.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + step, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function prepare(row) {
  const days = daysUntil(row.sdExpireDate);
  return {
    ...row,
    days,
    status: trackStatus(days),
    docs: Array.isArray(row.sdDocs) ? row.sdDocs : [],
  };
}

export default function SdTrackingPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState(() => localToday().slice(0, 7));
  const [pickedDay, setPickedDay] = useState('');
  const [throughFilter, setThroughFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/daily-tenders/sd', { headers: authHeaders() });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.message || 'Could not load SD tracking.');
        setRows((json.data || []).filter((row) => row.isWin === 'win').map(prepare));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load SD tracking.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = localToday();
  const byDate = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.sdExpireDate) return;
      const list = map.get(row.sdExpireDate) || [];
      list.push(row);
      map.set(row.sdExpireDate, list);
    });
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => matchesChoice(row.sdThrough, throughFilter) && matchesChoice(row.sdMode, modeFilter))
      .filter((row) => {
        if (pickedDay && row.sdExpireDate !== pickedDay) return false;
        if (filter === 'overdue') return row.status === 'overdue';
        if (filter === 'soon') return row.status === 'today' || row.status === 'soon';
        if (filter === 'later') return row.status === 'upcoming' || row.status === 'later';
        if (filter === 'none') return row.status === 'none';
        return true;
      })
      .filter((row) => {
        if (!query) return true;
        return [row.tenderId, row.titleAndRefNo, row.organisationChain, row.sdMoneyOffice]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (a.days == null && b.days == null) return a.tenderId.localeCompare(b.tenderId);
        if (a.days == null) return 1;
        if (b.days == null) return -1;
        return a.days - b.days;
      });
  }, [rows, search, filter, pickedDay, throughFilter, modeFilter]);

  // Each donut follows the other donut's filter, so picking "Online" shows the modes used online.
  const throughSlices = useMemo(
    () => sliceTotals(rows.filter((row) => matchesChoice(row.sdMode, modeFilter)), 'sdThrough', THROUGH_SLICES, 'sdMoney'),
    [rows, modeFilter]
  );
  const modeSlices = useMemo(
    () => sliceTotals(rows.filter((row) => matchesChoice(row.sdThrough, throughFilter)), 'sdMode', MODE_SLICES, 'sdMoney'),
    [rows, throughFilter]
  );

  const total = sumAmounts(rows);
  const overdue = rows.filter((row) => row.status === 'overdue').length;
  const dueSoon = rows.filter((row) => row.status === 'today' || row.status === 'soon').length;
  const missingDate = rows.filter((row) => row.status === 'none').length;
  const maxAmount = rows.reduce((max, row) => {
    try {
      const amount = BigInt(row.sdMoney || 0);
      return amount > max ? amount : max;
    } catch {
      return max;
    }
  }, 0n);
  const cells = monthCells(cursor);
  const offices = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const name = row.sdMoneyOffice?.trim() || 'Office not set';
      const current = map.get(name) || { name, count: 0, amount: 0n };
      current.count += 1;
      try {
        current.amount += BigInt(row.sdMoney || 0);
      } catch {
        current.amount += 0n;
      }
      map.set(name, current);
    });
    return [...map.values()].sort((a, b) => (a.amount > b.amount ? -1 : 1));
  }, [rows]);

  return (
    <div className="space-y-4 pb-8">
      <ModuleHeader
        icon={ShieldCheck}
        title="SD Tracking"
        description="SD money, issue date, expire date, days left, money office, and documents for saved tenders marked Win."
      />

      {error ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(198,40,40,0.12)', color: '#ef5350' }}>{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary label="SD on book" value={formatAmount(total.toString())} hint={`${rows.length} win tender${rows.length === 1 ? '' : 's'}`} />
        <Summary label="Overdue" value={String(overdue)} hint="SD expire date has passed" tone={overdue ? '#ef5350' : undefined} />
        <Summary label="Expires within 7 days" value={String(dueSoon)} hint="Including expiring today" tone={dueSoon ? '#ffa726' : undefined} />
        <Summary label="No expire date" value={String(missingDate)} hint="SD money may still be recorded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DonutCard
          title="SD through"
          hint={modeFilter === 'all' ? 'How the SD was given. Select a slice to filter.' : `Within ${optionLabel(MODE_SLICES, modeFilter)}. Select a slice to filter.`}
          slices={throughSlices}
          selected={throughFilter}
          onSelect={(key) => setThroughFilter((current) => (current === key ? 'all' : key))}
          loading={loading}
          emptyText="No win tenders to chart."
        />
        <DonutCard
          title="SD mode"
          hint={throughFilter === 'all' ? 'Instrument used for the SD. Select a slice to filter.' : `Within ${optionLabel(THROUGH_SLICES, throughFilter)}. Select a slice to filter.`}
          slices={modeSlices}
          selected={modeFilter}
          onSelect={(key) => setModeFilter((current) => (current === key ? 'all' : key))}
          loading={loading}
          emptyText="No win tenders to chart."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>SD calendar</h2>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => setCursor((current) => shiftMonth(current, -1))} title="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-32 text-center text-sm font-medium" style={{ color: 'var(--md-on)' }}>{monthLabel(cursor)}</span>
                <Button variant="outline" size="icon" onClick={() => setCursor((current) => shiftMonth(current, 1))} title="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>
              Marks sit on the SD expire date. Select a day to show only those tenders.
            </p>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold" style={{ color: 'var(--md-dim)' }}>
              {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((iso, index) => {
                const marked = iso ? byDate.get(iso) || [] : [];
                const selected = iso && iso === pickedDay;
                const urgent = marked.reduce((best, row) => {
                  const order = ['overdue', 'today', 'soon', 'upcoming', 'later', 'none'];
                  return order.indexOf(row.status) < order.indexOf(best) ? row.status : best;
                }, marked[0]?.status || 'none');
                const tone = marked.length ? STATUS[urgent].color : 'transparent';
                return (
                  <button
                    key={iso || `empty-${index}`}
                    type="button"
                    disabled={!iso}
                    onClick={() => setPickedDay((current) => (current === iso ? '' : iso))}
                    className="flex h-12 flex-col items-center justify-center rounded-lg text-xs disabled:cursor-default"
                    style={{
                      color: iso === today ? '#fff' : 'var(--md-on)',
                      background: selected ? 'rgba(92,107,192,0.18)' : iso === today ? '#5c6bc0' : 'transparent',
                      border: marked.length ? `1px solid ${tone}` : '1px solid transparent',
                    }}
                    title={marked.map((row) => `${row.tenderId}: ${formatAmount(row.sdMoney)}`).join('\n')}
                  >
                    {iso ? iso.slice(-2).replace(/^0/, '') : ''}
                    {marked.length ? (
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--md-muted)' }}>
              {Object.entries(STATUS).map(([key, item]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>SD money by tender</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>Each bar is that tender’s SD money.</p>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
              {loading ? <p className="text-sm" style={{ color: 'var(--md-muted)' }}>Loading amounts…</p> : null}
              {!loading && rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--md-muted)' }}>No win tenders to chart.</p> : null}
              {rows.map((row) => (
                <div key={row.id}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-medium" style={{ color: 'var(--md-on)' }} title={row.titleAndRefNo}>
                      {row.tenderId}
                      <span className="ml-2 font-normal" style={{ color: 'var(--md-dim)' }}>{row.titleAndRefNo}</span>
                    </span>
                    <span className="shrink-0" style={{ color: 'var(--md-muted)' }}>{formatAmount(row.sdMoney)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--md-border)' }}>
                    <div className="h-2 rounded-full" style={{ width: `${barWidth(row.sdMoney, maxAmount.toString())}%`, background: STATUS[row.status].color }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>Money office</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {offices.length === 0 ? <p className="text-sm" style={{ color: 'var(--md-muted)' }}>No offices yet.</p> : null}
            {offices.map((office) => (
              <div key={office.name} className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border)' }}>
                <p className="font-medium" style={{ color: 'var(--md-on)' }}>{office.name}</p>
                <p style={{ color: 'var(--md-muted)' }}>{office.count} tender{office.count === 1 ? '' : 's'} · {formatAmount(office.amount.toString())}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_11rem_18rem]">
          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>Status</p>
            <div className="mt-1 flex min-h-10 flex-wrap items-center gap-2">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    background: filter === key ? 'var(--md-primary)' : 'var(--md-surface)',
                    color: filter === key ? '#fff' : 'var(--md-muted)',
                    border: '1px solid var(--md-border)',
                  }}
                >
                  {label}
                </button>
              ))}
              {pickedDay ? (
                <button type="button" onClick={() => setPickedDay('')} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'rgba(92,107,192,0.15)', color: 'var(--md-on)' }}>
                  {formatDate(pickedDay)} · clear
                </button>
              ) : null}
            </div>
          </div>
          <ChoiceFilter label="SD through" value={throughFilter} slices={THROUGH_SLICES} onChange={setThroughFilter} />
          <ChoiceFilter label="SD mode" value={modeFilter} slices={MODE_SLICES} onChange={setModeFilter} />
          <label className="relative block min-w-0 text-xs font-semibold sm:col-span-2 xl:col-span-1" style={{ color: 'var(--md-muted)' }}>
            Search
            <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4" style={{ color: 'var(--md-dim)' }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tender ID, title, or office"
              className="mt-1 block h-10 w-full rounded-lg pl-9 pr-3 text-sm outline-none"
              style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border-strong)', color: 'var(--md-on)' }}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs" style={{ color: 'var(--md-muted)' }}>
            {loading ? 'Loading…' : `Showing ${visible.length} of ${rows.length} tender${rows.length === 1 ? '' : 's'}. Export uses the rows shown.`}
          </p>
          <ExportButtons filename="sd-tracking" title="SD Tracking" columns={EXPORT_COLUMNS} rows={visible} disabled={loading} />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tender</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>SD money</TableHead>
              <TableHead>Issue date</TableHead>
              <TableHead>Expire date</TableHead>
              <TableHead>Days left</TableHead>
              <TableHead>Money office</TableHead>
              <TableHead>SD through</TableHead>
              <TableHead>SD mode</TableHead>
              <TableHead>SD docs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoadingState cols={10} />
            ) : visible.length === 0 ? (
              <TableEmptyState
                colSpan={10}
                icon={Shield}
                title="No SD rows"
                description={rows.length === 0 ? 'SD is tracked after a saved tender is marked Win.' : 'Nothing matches this filter.'}
              />
            ) : (
              visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium" style={{ color: 'var(--md-on)' }}>{row.tenderId}</p>
                    <p className="max-w-xs truncate text-xs" style={{ color: 'var(--md-dim)' }} title={row.titleAndRefNo}>{row.titleAndRefNo}</p>
                  </TableCell>
                  <TableCell>Win</TableCell>
                  <TableCell><span className="font-medium" style={{ color: 'var(--md-on)' }}>{formatAmount(row.sdMoney)}</span></TableCell>
                  <TableCell>{formatDate(row.sdIssueDate)}</TableCell>
                  <TableCell>{formatDate(row.sdExpireDate)}</TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: STATUS[row.status].color, background: 'var(--md-sidebar)' }}>
                      {daysLabel(row.days)}
                    </span>
                  </TableCell>
                  <TableCell>{row.sdMoneyOffice || '—'}</TableCell>
                  <TableCell><ChoiceBadge slices={THROUGH_SLICES} value={row.sdThrough} /></TableCell>
                  <TableCell><ChoiceBadge slices={MODE_SLICES} value={row.sdMode} /></TableCell>
                  <TableCell>
                    {row.docs.length === 0 ? '—' : (
                      <span className="flex flex-col gap-1">
                        {row.docs.map((doc) => (
                          <a key={doc.url} href={doc.url} className="text-xs underline" style={{ color: 'var(--md-primary)' }}>{doc.name}</a>
                        ))}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function Summary({ label, value, hint, tone }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--md-dim)' }}>{label}</p>
        <p className="mt-1 text-xl font-semibold" style={{ color: tone || 'var(--md-on)' }}>{value}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>{hint}</p>
      </CardContent>
    </Card>
  );
}
