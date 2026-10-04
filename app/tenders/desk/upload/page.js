import { getCurrentPerson } from '@/lib/desk/auth';
import { canUploadFetch, fetchAssigneeFor } from '@/lib/desk/fetch-day';
import { prisma } from '@/lib/prisma';
import { getWorkCategories } from '@/lib/desk/settings';
import { asJson } from '@/lib/desk/json';
import { istDateKey } from '@/lib/desk/ist';
import { PageTitle } from '@/components/desk/ui';
import { TenderForm } from '@/components/desk/TenderForm';

export const dynamic = 'force-dynamic';

export default async function DeskUploadPage({ searchParams }) {
  const person = await getCurrentPerson();
  const params = await searchParams;
  const day = await fetchAssigneeFor(istDateKey());
  const allowed = canUploadFetch(person, day);
  const [sources, workCategories] = await Promise.all([
    prisma.source.findMany({ orderBy: { order: 'asc' } }),
    getWorkCategories(),
  ]);

  return (
    <div>
      <PageTitle kicker="Daily fetch">Upload a tender</PageTitle>
      <p className="mb-4 text-sm text-ink-700">
        {day.assignee?.name || 'The assigned person'} opens the official desk, then saves the tender and at least one document here.
        Gemini can draft from a notice you paste. It does not open the portal.
      </p>
      {allowed ? (
        <TenderForm
          sources={asJson(sources)}
          workCategories={workCategories}
          sourceId={typeof params.sourceId === 'string' ? params.sourceId : ''}
          person={asJson(person)}
        />
      ) : (
        <p className="text-sm text-ink-600">
          Only {day.assignee?.name || 'the assigned fetcher'}, the backup, or an admin can upload. Change the assigned person on People.
        </p>
      )}
    </div>
  );
}
