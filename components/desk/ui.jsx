import { STAGE_LABEL, SOURCE_MARK_LABEL, INSTRUMENT_STATUS_LABEL, APPLICATION_STATUS_LABEL, ROLES } from '@/lib/desk/constants';
import { cn, daysUntil } from '@/lib/desk/format';

export function CentralBadge() {
  return <span className="tender-central-badge">Central</span>;
}

export function SampleBadge({ on }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Sample
    </span>
  );
}

export function StageBadge({ stage }) {
  const label = STAGE_LABEL[stage] || stage;
  const tone = {
    UPLOADED: 'bg-ink-100 text-ink-700',
    SELECTED: 'bg-sky-100 text-sky-800',
    PREPARING_BID: 'bg-sky-100 text-sky-800',
    BID_SUBMITTED: 'bg-indigo-100 text-indigo-800',
    NOT_AWARDED: 'bg-stone-200 text-stone-700',
    GOT_THE_BID: 'bg-emerald-100 text-emerald-800',
    IN_EXECUTION: 'bg-teal-100 text-teal-800',
    COMPLETED: 'bg-teal-100 text-teal-800',
    SD_APPLIED: 'bg-amber-100 text-amber-900',
    SD_RELEASED: 'bg-emerald-100 text-emerald-800',
    CLOSED: 'bg-ink-100 text-ink-600',
  }[stage] || 'bg-ink-100 text-ink-700';
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium d-ring-inset', tone)}>{label}</span>;
}

export function MarkBadge({ mark, note }) {
  const tone = {
    PRIORITY: 'bg-desk text-white',
    CAREFUL: 'bg-amber-100 text-amber-900',
    STANDARD: 'bg-ink-100 text-ink-700',
    PLATFORM: 'bg-ink-200 text-ink-600',
  }[mark] || 'bg-ink-100';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone)}>
      {SOURCE_MARK_LABEL[mark] || mark}
      {note ? <span className="font-normal normal-case opacity-80">· {note}</span> : null}
    </span>
  );
}

export function StatusBadge({ status }) {
  const held = ['SUBMITTED', 'HELD', 'RENEWAL_DUE', 'REFUND_APPLIED'].includes(status);
  return (
    <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium', held ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-700')}>
      {INSTRUMENT_STATUS_LABEL[status] || status}
    </span>
  );
}

export function AppStatusBadge({ status }) {
  return (
    <span className="inline-flex rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
      {APPLICATION_STATUS_LABEL[status] || status}
    </span>
  );
}

export function RoleList({ roles }) {
  return (
    <span className="text-ink-600">
      {(roles || []).map((r) => ROLES[r] || r).join(', ')}
    </span>
  );
}

export function Button({ children, variant = 'primary', className, type = 'button', ...props }) {
  const styles = {
    primary: 'd-btn d-btn-primary',
    secondary: 'd-btn d-btn-outline',
    danger: 'd-btn bg-red-700 text-white hover:bg-red-800',
    ghost: 'd-btn d-btn-ghost',
  }[variant];
  return (
    <button
      type={type}
      className={cn('disabled:cursor-not-allowed', styles, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, required, children, className }) {
  return (
    <label className={cn('block text-sm', className)}>
      <span className="mb-1 block font-medium text-ink-800">
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function inputClass(extra) {
  return cn(
    'w-full rounded border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-900 shadow-sm outline-none focus:border-desk focus:ring-1 focus:ring-desk',
    extra
  );
}

export function Empty({ children, icon: Icon, title }) {
  return (
    <div className="d-fade-in flex flex-col items-center rounded-[14px] border border-dashed border-[var(--md-border)] px-6 py-10 text-center">
      {Icon ? (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--d-accent-soft)] text-[var(--md-primary-hover)]">
          <Icon size={20} aria-hidden="true" />
        </span>
      ) : null}
      {title ? <p className="text-sm font-semibold text-mat-on">{title}</p> : null}
      <div className={cn('max-w-md text-sm leading-6 text-mat-muted', title && 'mt-1')}>{children}</div>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('d-skeleton', className)} />;
}

/** Bid deadline as a countdown: red inside 3 days, amber inside a week. */
export function DeadlineBadge({ value }) {
  if (!value) return null;
  const days = daysUntil(value);
  if (days == null) return null;
  const tone = days < 0 ? 'd-badge-neutral' : days <= 3 ? 'd-badge-danger' : days <= 7 ? 'd-badge-warn' : 'd-badge-ok';
  const text = days < 0 ? 'Closed' : days === 0 ? 'Closes today' : days === 1 ? 'Closes tomorrow' : `${days} days left`;
  return (
    <span className={cn('d-badge', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', days >= 0 && days <= 3 && 'd-ping')} aria-hidden="true" />
      {text}
    </span>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p>;
}

export function WarnBox({ children }) {
  if (!children) return null;
  return <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

export function Card({ title, action, children, className }) {
  return (
    <section className={cn('d-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--md-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Chip({ children, onRemove }) {
  return (
    <span className="d-fade-in inline-flex h-7 items-center gap-1 rounded-full border border-[var(--md-border)] bg-[var(--d-accent-soft)] pl-3 pr-1 text-xs font-medium text-mat-on">
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-5 w-5 place-items-center rounded-full text-mat-dim transition-colors hover:bg-[var(--md-surface3)] hover:text-mat-on"
          aria-label={`Remove filter ${typeof children === 'string' ? children : ''}`.trim()}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      ) : <span className="w-2" />}
    </span>
  );
}

export function PageTitle({ kicker, children, aside, description }) {
  return (
    <div className="d-rise mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker ? <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-mat-dim">{kicker}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-mat-on">{children}</h1>
        {description ? <p className="mt-1 text-sm text-mat-muted">{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}
