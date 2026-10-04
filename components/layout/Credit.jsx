import { BRAND } from '@/lib/branding';

export default function Credit({ className = '' }) {
  return (
    <p className={`text-center text-[10px] leading-none tracking-wide text-[var(--md-dim)] ${className}`}>
      <a
        href={BRAND.makerUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={BRAND.creditNote}
        className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--md-muted)]"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 14h17l-2.2 3.4a2 2 0 0 1-1.7.9H7.4a2 2 0 0 1-1.7-.9z" />
          <path d="M12 4v10" />
          <path d="M12 5.5 17 12h-5" />
          <path d="M3 21c1.2 0 1.8-.8 3-.8s1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8" />
        </svg>
        <span>
          <span className="font-semibold uppercase tracking-[0.18em]">{BRAND.product}</span>, brought to you by {BRAND.maker}
        </span>
      </a>
    </p>
  );
}
