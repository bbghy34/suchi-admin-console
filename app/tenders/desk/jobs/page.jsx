import { ArrowLeft, Download } from 'lucide-react';
import { OfficialImportJobsList } from '@/components/desk/OfficialImportJobs';
export const dynamic = 'force-dynamic';
export default function OfficialDownloadJobsPage() {
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header className="space-y-3">
      <a className="inline-flex items-center gap-1.5 text-sm text-mat-dim transition-colors hover:text-mat-on" href="/tenders/desk"><ArrowLeft size={14} aria-hidden="true"/>Back to Tender Desk</a>
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--d-accent-soft)] text-[var(--md-primary-hover)]"><Download size={20} aria-hidden="true"/></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-mat-on">Downloads</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-mat-muted">Each download finds the official notice, clears the portal check when asked, fetches the original files, and saves them to Tender Desk. You can leave this page; Notifications tells you when a download finishes.</p>
        </div>
      </div>
    </header>
    <OfficialImportJobsList returnTo="/tenders/desk/jobs" />
  </main>;
}
