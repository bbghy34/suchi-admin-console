import { notFound } from 'next/navigation';
import { getCurrentPerson } from '@/lib/desk/auth';
import { loadTender, parseSummary } from '@/lib/desk/tender-service';
import { missingPrompts } from '@/lib/desk/tender-fields';
import { asJson } from '@/lib/desk/json';
import { TenderView } from '@/components/desk/TenderView';

export const dynamic = 'force-dynamic';

export default async function TenderPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const person = await getCurrentPerson();
  let tender;
  try {
    tender = await loadTender(id);
  } catch {
    notFound();
  }
  return (
    <TenderView
      tender={asJson(tender)}
      person={asJson(person)}
      summary={parseSummary(tender)}
      missingFields={missingPrompts(tender, tender.source)}
      returnTo={safeSearchReturn(query?.from)}
    />
  );
}

function safeSearchReturn(from) {
  if (typeof from !== 'string' || !from.startsWith('/tenders/desk/search')) return '/tenders/desk/search';
  if (from.includes('://') || from.startsWith('//')) return '/tenders/desk/search';
  return from;
}
