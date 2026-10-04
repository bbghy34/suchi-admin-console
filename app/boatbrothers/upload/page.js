import { redirect } from 'next/navigation';
import { getCurrentPerson } from '@/lib/desk/auth';
import { prisma } from '@/lib/prisma';
import { getWorkCategories } from '@/lib/desk/settings';
import { asJson } from '@/lib/desk/json';
import { PageTitle } from '@/components/desk/ui';
import { TenderForm } from '@/components/desk/TenderForm';
import { UploadList } from '@/components/desk/UploadList';
import { isCentralSource } from '@/lib/desk/constants';
import { placeLabel } from '@/lib/desk/format';
import { searchKeywordsByTender } from '@/lib/desk/keywords';

export const dynamic = 'force-dynamic';

export default async function HiddenTenderUploadPage({ searchParams }) {
  const person = await getCurrentPerson();
  if (!person?.isAdmin) redirect('/login?redirect=/boatbrothers/upload');
  const params = await searchParams;
  const [sources, workCategories, tenders, keywordsById] = await Promise.all([
    prisma.source.findMany({ orderBy: { order: 'asc' } }),
    getWorkCategories(),
    prisma.tender.findMany({
      include: {
        source: { select: { id: true, displayName: true } },
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    searchKeywordsByTender(),
  ]);
  const rows = tenders.map((t) => ({
    id: t.id,
    title: t.title,
    isSample: t.isSample,
    sourceId: t.sourceId,
    sourceName: t.source?.displayName || t.sourceId,
    state: t.state,
    placeOfWorkState: t.placeOfWorkState,
    gemConsigneeState: t.gemConsigneeState,
    place: placeLabel(t),
    estimatedValue: t.estimatedValue,
    bidSubmissionEnd: t.bidSubmissionEnd,
    portalTenderId: t.portalTenderId,
    referenceNo: t.referenceNo,
    fileCount: t._count.documents,
    central: !!(t.allIndia || isCentralSource(t.sourceId)),
    searchKeywords: keywordsById[t.id] || '',
  }));
  return (
    <div className="tender-desk rounded-xl bg-ink-50 p-3 text-ink-900 sm:p-4">
      <PageTitle kicker="Admin upload">New tender</PageTitle>
      <p className="mb-4 text-sm text-ink-700">
        A save needs a source, a title, search keywords, a state or a place of work, the bid end, and one document. Keywords become the search filter. The desk inbox is alerted when this saves.
      </p>
      <TenderForm
        sources={asJson(sources)}
        workCategories={workCategories}
        sourceId={params.sourceId || ''}
        person={asJson(person)}
      />
      <UploadList rows={asJson(rows)} sources={asJson(sources.filter((s) => s.kind !== 'PLATFORM'))} />
    </div>
  );
}
