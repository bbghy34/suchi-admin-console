'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { TENDER_ADMIN_PATH } from '@/lib/tender-portal-exchange';

export default function ManualPortalExchange() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'A';

  return (
    <section className="rounded-xl p-4" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-border)' }} aria-labelledby="portal-exchange-title">
      <h2 id="portal-exchange-title" className="text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
        Tender files
      </h2>
      <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--md-muted)' }}>
        The tender portal lists every file added for a tender. An admin adds those rows.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href="/tenders/portal"
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium"
          style={{ background: 'var(--md-surface3)', color: 'var(--md-on)', border: '1px solid var(--md-border-strong)' }}
        >
          Open tender portal
        </a>
        {isAdmin ? (
          <a
            href={TENDER_ADMIN_PATH}
            className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium"
            style={{ color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' }}
          >
            Upload tender file
          </a>
        ) : null}
      </div>
    </section>
  );
}
