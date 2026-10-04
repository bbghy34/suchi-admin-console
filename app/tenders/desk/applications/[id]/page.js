import { notFound } from 'next/navigation';
import { getCurrentPerson } from '@/lib/desk/auth';
import { prisma } from '@/lib/prisma';
import { asJson } from '@/lib/desk/json';
import { ApplicationView } from './ApplicationView';

export const dynamic = 'force-dynamic';

export default async function ApplicationPage({ params }) {
  const { id } = await params;
  const person = await getCurrentPerson();
  const application = await prisma.refundApplication.findUnique({
    where: { id },
    include: { instruments: true, tender: { include: { documents: true, source: true } } },
  });
  if (!application) notFound();
  return <ApplicationView application={asJson(application)} person={asJson(person)} />;
}
