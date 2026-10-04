import { SuggestedSearches } from '@/components/desk/SuggestedSearches';
import Link from 'next/link';
import { getCurrentPerson } from '@/lib/desk/auth';
import { dashboardPiles, shellData } from '@/lib/desk/desk';
import { asJson } from '@/lib/desk/json';
import { formatIST } from '@/lib/desk/format';
import { ReminderList } from '@/components/desk/ReminderList';
import { SearchBox } from '@/components/desk/SearchBox';
import { TenderTable } from '@/components/desk/TenderTable';
import { Card, Empty } from '@/components/desk/ui';
import { DashboardStats } from '@/components/desk/DashboardStats';
import { Sparkles } from 'lucide-react';
import { HeroLogoCloud } from '@/components/desk/HeroLogoCloud';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const person = await getCurrentPerson();
  const [shell, piles] = await Promise.all([shellData(person), dashboardPiles(person)]);
  const fetch = shell.fetch;

  const reminders = piles.reminders || {};
  const savedCount = ['in3', 'in7', 'ago', 'saved'].reduce((n, key) => n + (reminders[key]?.length || 0), 0);
  const firstName = String(person.name || '').split(' ')[0];

  return (
    <div>
      <section className="d-card d-hero mb-4 p-5 sm:p-7">
        <div className="d-aurora" aria-hidden="true" />
        <HeroLogoCloud />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="d-badge d-badge-accent"><Sparkles size={12} aria-hidden="true" /> AI tender search</span>
          {shell.firmName ? <span className="text-xs font-medium uppercase tracking-wider text-mat-dim">{shell.firmName}</span> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-mat-on sm:text-[30px] sm:leading-9">
          {firstName ? `${greeting()}, ${firstName}. ` : ''}What tenders are you <span className="d-gradient-text">looking for?</span>
        </h1>
        <p className="mb-5 mt-1.5 text-sm text-mat-muted">Work, department, or state. For example, road construction in Assam.</p>
        <SearchBox autoFocus />
        <SuggestedSearches />
      </section>

      <DashboardStats
        in3={reminders.in3?.length || 0}
        in7={reminders.in7?.length || 0}
        saved={savedCount}
        held={piles.held.length}
        fetch={asJson(fetch)}
        streak={shell.streak}
      />

      {piles.realCount === 0 ? (
        <Empty>
          No fetched tenders yet. Save a tender from search or upload an official notice to build your library.{' '}
          {fetch.isFetcher ? (
            <Link href="/tenders/desk/fetch" className="font-medium text-desk underline">
              Open portal review.
            </Link>
          ) : (
            'Ask the assigned fetcher to complete Today’s fetch.'
          )}
          {piles.sampleCount ? ' Sample rows below are marked Sample and are not today’s fetch from a government site.' : null}
        </Empty>
      ) : null}

      <div id="reminders" className="scroll-mt-28">
        <ReminderList reminders={asJson(reminders)} />
      </div>

      {piles.held.length ? (
        <Card className="mt-6" title={`Security money still held (${piles.held.length})`}>
          <TenderTable rows={asJson(piles.held)} kind="projects" />
        </Card>
      ) : null}
      {fetch.isFetcher && fetch.complete ? (
        <p className="mt-6 text-xs text-mat-dim">
          Today’s portal review completed{fetch.finishedAt ? ` at ${formatIST(fetch.finishedAt)}` : ''}{fetch.finishedBy ? ` by ${fetch.finishedBy.name}` : ''}.
          {' '}Backup: {fetch.backup?.name || '—'}.
        </p>
      ) : null}
    </div>
  );
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
