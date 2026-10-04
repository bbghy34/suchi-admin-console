import { getCurrentPerson } from '@/lib/desk/auth';
import { myTenders } from '@/lib/desk/desk';
import { asJson } from '@/lib/desk/json';
import { formatIST } from '@/lib/desk/format';
import { TenderTable } from '@/components/desk/TenderTable';
import { DeadlineBadge, Empty, PageTitle, SampleBadge, StageBadge } from '@/components/desk/ui';
import { FREQUENCIES } from '@/lib/desk/constants';

export const dynamic = 'force-dynamic';

export default async function MyTendersPage() {
  const person = await getCurrentPerson();
  const rows = asJson(await myTenders(person));
  return (
    <div>
      <PageTitle description="Tenders you selected, with the next date on each notice.">My tenders</PageTitle>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.id} className="d-card d-card-hover d-rise px-4 py-3.5" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <StageBadge stage={row.stage} />
                <SampleBadge on={row.isSample} />
                <DeadlineBadge value={row.nextDeadline?.at} />
                <span className="d-badge d-badge-neutral ml-auto">{FREQUENCIES.find((f) => f[0] === row.frequency)?.[1]}</span>
              </div>
              <a href={`/tenders/desk/tenders/${row.id}`} className="mt-1.5 block font-medium leading-6 text-mat-on decoration-[var(--md-primary)] underline-offset-4 hover:underline">
                {row.title}
              </a>
              <p className="mt-0.5 text-xs text-mat-dim">
                {row.nextDeadline
                  ? `Next: ${row.nextDeadline.label} ${formatIST(row.nextDeadline.at)}`
                  : 'No upcoming deadline on the notice dates.'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>You have not selected a tender yet. Search the library, then press Select.</Empty>
      )}
      {rows.length ? (
        <div className="mt-4">
          <TenderTable rows={rows} />
        </div>
      ) : null}
    </div>
  );
}
