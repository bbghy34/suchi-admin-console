import { notFound } from 'next/navigation';
import { currentLuitAdmin } from '@/lib/luit-admin/session';
import BrandMark from '@/components/layout/BrandMark';
import Credit from '@/components/layout/Credit';
import SignOutButton from '@/components/luit-admin/SignOutButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Luit Admin', robots: { index: false, follow: false } };

/**
 * The Luit admin panel. Reached only by its URL; nothing in the console links
 * here, and anyone else gets the ordinary not-found page. It uses the
 * console's own top bar, canvas, and card styles.
 */
export default async function LuitAdminLayout({ children }) {
  const admin = await currentLuitAdmin();
  if (!admin) notFound();
  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--md-bg)', color: 'var(--md-on)' }}>
      <header
        className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
        style={{ background: 'var(--md-surface)', borderBottom: '1px solid var(--md-border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <a href="/luit-admin" className="flex min-w-0 items-center"><BrandMark size={34} /></a>
          <span className="luit-ai-chip hidden sm:inline">ADMIN</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[12rem] truncate text-xs text-mat-dim md:inline">{admin.name}</span>
          <a href="/dashboard" className="rounded-lg border border-[var(--md-border)] px-3 py-1.5 text-xs font-medium text-mat-muted transition-colors hover:text-mat-on">
            Open console
          </a>
          <SignOutButton />
        </div>
      </header>
      <main className="console-canvas flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto min-w-0 max-w-5xl">{children}</div>
      </main>
      <footer className="px-4 pb-2.5 pt-0.5"><Credit /></footer>
    </div>
  );
}
