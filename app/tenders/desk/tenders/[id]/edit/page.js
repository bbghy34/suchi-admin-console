import { notFound } from 'next/navigation';
import { getCurrentPerson } from '@/lib/desk/auth';
import { prisma } from '@/lib/prisma';
import { getWorkCategories } from '@/lib/desk/settings';
import { asJson } from '@/lib/desk/json';
import { PageTitle } from '@/components/desk/ui';
import { TenderForm } from '@/components/desk/TenderForm';
import { readSearchKeywords } from '@/lib/desk/keywords';

export const dynamic = 'force-dynamic';

export default async function EditTenderPage({ params }) {
  const { id } = await params;
  const person = await getCurrentPerson();
  const tender = await prisma.tender.findUnique({ where: { id } });
  if (!tender) notFound();
  const searchKeywords = await readSearchKeywords(id);
  const sources = await prisma.source.findMany({ orderBy: { order: 'asc' } });
  const workCategories = await getWorkCategories();
  return (
    <div>
      <PageTitle>Edit tender</PageTitle>
      <TenderForm sources={asJson(sources)} workCategories={workCategories} initial={asJson({ ...tender, searchKeywords })} person={asJson(person)} />
    </div>
  );
}
