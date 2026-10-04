"use client";

import { OfficialImportJobs } from '@/components/desk/OfficialImportJobs';

/** One action always creates a durable job, so navigating away is safe. */
export function OfficialTenderImport({ row, query, capability, returnTo }) {
  if (row?.existingTenderId) return <div className="mt-4 border-t border-[var(--md-border)] pt-4">
    <a className="d-btn d-btn-primary" href={`/tenders/desk/tenders/${encodeURIComponent(row.existingTenderId)}`}>Saved · Open tender</a>
    <p className="mt-2 text-xs text-mat-dim">Already saved in Tender Desk. Open it to view the stored files.</p>
  </div>;
  const blocked = !['official-file', 'notice', 'official-page'].includes(row?.sourceKind) && !capability?.configured;
  if (!capability?.allowed) return <p className="mt-4 border-t border-[var(--md-border)] pt-3 text-xs text-mat-dim">The assigned fetcher or an admin can retrieve the official files.</p>;

  return <div className="mt-4 border-t border-[var(--md-border)] pt-4">
    <OfficialImportJobs payload={{ row, query }} disabled={blocked} returnTo={returnTo} />
    {blocked ? <p className="mt-2 text-xs text-mat-dim">An admin needs to configure official retrieval on the server.</p> : null}
  </div>;
}
