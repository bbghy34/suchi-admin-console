import { getCurrentPerson } from '@/lib/desk/auth';
import { canWorkFetch } from '@/lib/desk/fetch-day';
import { fetchPageData } from '@/lib/desk/desk';
import { asJson } from '@/lib/desk/json';
import { formatISTDate } from '@/lib/desk/format';
import { PageTitle } from '@/components/desk/ui';
import { FetchBoard } from './FetchBoard';

export const dynamic = 'force-dynamic';

export default async function FetchPage() {
  const person = await getCurrentPerson();
  const { day, assignment, streak, lastBySource } = await fetchPageData();
  const canWork = canWorkFetch(person, assignment);

  return (
    <div>
      <PageTitle
        kicker={`${formatISTDate(new Date())} IST`}
        aside={
          <p className="text-sm text-ink-600">
            Assigned: <strong>{assignment.assignee?.name || '—'}</strong>
            {assignment.override ? ' (override)' : ''} · Backup: {assignment.backup?.name || '—'}
          </p>
        }
      >
        Daily portal review
      </PageTitle>
      <p className="mb-4 max-w-3xl text-sm text-ink-700">
        Check each assigned official portal, save new tenders and their documents, then record the outcome below. Use “No new tender” when the portal has been checked and nothing new was found. Download progress is tracked separately in Downloads.
      </p>
      <FetchBoard
        day={asJson(day)}
        assignment={asJson({
          assignee: assignment.assignee ? { id: assignment.assignee.id, name: assignment.assignee.name } : null,
          backup: assignment.backup ? { id: assignment.backup.id, name: assignment.backup.name } : null,
          override: assignment.override,
        })}
        streak={streak}
        lastBySource={asJson(lastBySource)}
        canWork={canWork}
        personId={person.id}
      />
    </div>
  );
}
