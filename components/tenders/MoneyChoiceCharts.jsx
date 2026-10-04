'use client';

import { Banknote, CircleDashed, PiggyBank, ScrollText, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { MONEY_MODE_OPTIONS, MONEY_THROUGH_OPTIONS } from '@/lib/daily-tenders';

const NOT_SET = { key: 'none', label: 'Not set', color: '#90a4ae', icon: CircleDashed };

const THROUGH_STYLE = {
  online: { color: '#26a69a', icon: Wifi },
  offline: { color: '#ffa726', icon: WifiOff },
};

const MODE_STYLE = {
  cheque: { color: '#5c6bc0', icon: Banknote },
  bank_guarantee: { color: '#ab47bc', icon: ShieldCheck },
  demand_draft: { color: '#29b6f6', icon: ScrollText },
  fixed_deposit: { color: '#66bb6a', icon: PiggyBank },
};

function toSlices(options, styles) {
  const style = (key) => styles[key] || NOT_SET;
  return [...options.map(([key, label]) => ({ key, label, color: style(key).color, icon: style(key).icon })), NOT_SET];
}

export const THROUGH_SLICES = toSlices(MONEY_THROUGH_OPTIONS, THROUGH_STYLE);
export const MODE_SLICES = toSlices(MONEY_MODE_OPTIONS, MODE_STYLE);

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

function sumField(rows, field) {
  return rows.reduce((total, row) => {
    try {
      return total + BigInt(row[field] || 0);
    } catch {
      return total;
    }
  }, 0n);
}

export function optionLabel(slices, value) {
  return slices.find((slice) => slice.key === value)?.label || '—';
}

export function matchesChoice(value, filter) {
  if (filter === 'all') return true;
  if (filter === 'none') return !value;
  return value === filter;
}

/** Count and money per option. `field` holds the option, `amountField` the money to total. */
export function sliceTotals(rows, field, slices, amountField) {
  return slices.map((slice) => {
    const matched = rows.filter((row) => (slice.key === 'none' ? !row[field] : row[field] === slice.key));
    return { ...slice, count: matched.length, amount: sumField(matched, amountField) };
  });
}

function SliceIcon({ slice, size = 28 }) {
  const Icon = slice.icon;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: `${slice.color}22`, color: slice.color }}
      aria-hidden="true"
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

export function DonutCard({ title, hint, slices, selected, onSelect, loading, emptyText = 'Nothing to chart.', wide = false }) {
  const size = 160;
  const stroke = 20;
  const focusGrow = 6;
  const radius = (size - stroke - focusGrow) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const shown = slices.filter((slice) => slice.count > 0);
  const gap = shown.length > 1 ? 3 : 0;
  const focus = selected === 'all' ? null : slices.find((slice) => slice.key === selected);
  const centerCount = focus ? focus.count : total;
  let offset = 0;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex min-h-[44px] items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>{title}</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--md-dim)' }}>{hint}</p>
          </div>
          {focus ? (
            <button type="button" onClick={() => onSelect(focus.key)} className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: 'rgba(92,107,192,0.15)', color: 'var(--md-on)' }}>
              {focus.label} · clear
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid flex-1 items-center justify-items-center gap-6 sm:grid-cols-[160px_minmax(0,1fr)] sm:justify-items-stretch">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title} chart`}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--md-border)" strokeWidth={stroke} />
              {shown.map((slice) => {
                const length = (slice.count / total) * circumference;
                const dash = Math.max(length - gap, 0.5);
                const dim = focus && focus.key !== slice.key;
                const segment = (
                  <circle
                    key={slice.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={focus?.key === slice.key ? stroke + focusGrow : stroke}
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    onClick={() => onSelect(slice.key)}
                    className="cursor-pointer transition-all duration-200"
                    style={{ opacity: dim ? 0.25 : 1 }}
                  >
                    <title>{`${slice.label}: ${slice.count} · ${formatAmount(slice.amount.toString())}`}</title>
                  </circle>
                );
                offset += length;
                return segment;
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-semibold leading-none tabular-nums" style={{ color: focus ? focus.color : 'var(--md-on)' }}>
                {loading ? '…' : centerCount}
              </span>
            </div>
          </div>

          <ul className={wide ? 'grid w-full min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-4' : 'w-full min-w-0 space-y-1'}>
            {slices.map((slice) => {
              const active = focus?.key === slice.key;
              const percent = total ? Math.round((slice.count / total) * 100) : 0;
              return (
                <li key={slice.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(slice.key)}
                    disabled={!slice.count && !active}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors hover:bg-[var(--md-sidebar)] disabled:cursor-default disabled:opacity-45 ${wide ? 'py-2.5' : 'py-1.5'}`}
                    style={{
                      background: active || wide ? 'var(--md-sidebar)' : 'transparent',
                      border: `1px solid ${active ? slice.color : wide ? 'var(--md-border)' : 'transparent'}`,
                      opacity: focus && !active ? 0.6 : undefined,
                    }}
                  >
                    <span className="flex w-9 shrink-0 flex-col items-center gap-0.5">
                      <SliceIcon slice={slice} size={28} />
                      <span className="text-[10px] font-semibold leading-none tabular-nums" style={{ color: slice.color }}>{percent}%</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium" style={{ color: 'var(--md-on)' }} title={slice.label}>{slice.label}</span>
                      <span className="block truncate text-[11px] tabular-nums" style={{ color: 'var(--md-dim)' }}>{formatAmount(slice.amount.toString())}</span>
                    </span>
                    <span
                      className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-2 text-xs font-semibold tabular-nums"
                      style={{ background: slice.count ? `${slice.color}22` : 'var(--md-sidebar)', color: slice.count ? slice.color : 'var(--md-dim)' }}
                    >
                      {slice.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {!loading && total === 0 ? <p className="mt-3 text-xs" style={{ color: 'var(--md-dim)' }}>{emptyText}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ChoiceFilter({ label, value, slices, onChange }) {
  return (
    <label className="block min-w-0 text-xs font-semibold" style={{ color: 'var(--md-muted)' }}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block h-10 w-full rounded-lg px-3 text-sm outline-none"
        style={{ background: 'var(--md-sidebar)', border: '1px solid var(--md-border-strong)', color: 'var(--md-on)' }}
      >
        <option value="all">All</option>
        {slices.map((slice) => <option key={slice.key} value={slice.key}>{slice.label}</option>)}
      </select>
    </label>
  );
}

export function ChoiceBadge({ slices, value }) {
  const slice = slices.find((item) => item.key === value);
  if (!slice) return '—';
  const Icon = slice.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-medium" style={{ background: `${slice.color}1f`, color: slice.color }}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span style={{ color: 'var(--md-on)' }}>{slice.label}</span>
    </span>
  );
}
