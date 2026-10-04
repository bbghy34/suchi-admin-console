import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getFirmName } from '@/lib/desk/settings';
import { formatISTDate } from '@/lib/desk/format';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

export default async function PrintApplicationPage({ params }) {
  const { id } = await params;
  const application = await prisma.refundApplication.findUnique({
    where: { id },
    include: { instruments: true, tender: { include: { documents: true, source: true } } },
  });
  if (!application) notFound();
  const firmName = await getFirmName();
  const enclosed = application.tender.documents.filter((d) =>
    ['Completion certificate', 'Security Deposit proof', 'EMD proof', 'Refund letter'].includes(d.type)
  );

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-[15px] leading-relaxed text-ink-950">
      <PrintButton backHref={`/tenders/desk/applications/${application.id}`} />
      <p className="mb-6 text-sm text-ink-500">{firmName}</p>
      <pre className="whitespace-pre-wrap font-sans">{application.letterText}</pre>
      <h2 className="mt-8 text-sm font-semibold">Enclosed</h2>
      <ul className="list-disc pl-5 text-sm">
        {enclosed.map((d) => (
          <li key={d.id}>
            {d.type}: {d.fileName}
            {d.docDate ? ` (${formatISTDate(d.docDate)})` : ''}
          </li>
        ))}
        {(application.instrumentsSnapshot ? JSON.parse(application.instrumentsSnapshot) : application.instruments).map((i) => (
          <li key={`i-${i.id}`}>
            {i.form} copy{i.number ? ` ${i.number}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
