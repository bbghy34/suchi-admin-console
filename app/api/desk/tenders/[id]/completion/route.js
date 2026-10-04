import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { prepareDocument } from '@/lib/desk/tender-service';
import { saveTenderTransition } from '@/lib/desk/tender-transition';
import { after } from 'next/server';
import { notifyMany, peopleWithRole, selectorIds } from '@/lib/desk/notify';
import { formatISTDate, parseISTInput } from '@/lib/desk/ist';
import { HELD_STATUSES } from '@/lib/desk/constants';

/** Completion record: certificate file, certificate number, completion date, issuing authority. */
export const POST = handler(async (req, { params }) => {
  const person = await requireRole('ACCOUNTS', 'ADMIN');
  const tender = await prisma.tender.findUnique({ where: { id: params.id }, include: { documents: true, instruments: true } });
  if (!tender) return fail(404, 'Tender not found.');
  if (!['GOT_THE_BID', 'IN_EXECUTION', 'COMPLETED'].includes(tender.stage)) {
    return fail(400, 'Completion is recorded on a project the firm got. Mark “Got the bid” first.');
  }
  const { fields, files } = await readBody(req);
  const completionDate = parseISTInput(fields.completionDate);
  if (!completionDate) return fail(400, 'Enter the completion date. This is the date on the certificate, not the date of upload.');
  const sdReleaseEligibleAt=parseISTInput(fields.sdReleaseEligibleAt);
  if(fields.sdReleaseEligibleAt && !sdReleaseEligibleAt)return fail(400,'Enter a valid SD release eligibility date.');
  if(sdReleaseEligibleAt && sdReleaseEligibleAt<completionDate)return fail(400,'SD release eligibility cannot precede completion.');
  const certFile = files.find((f) => f.field === 'file');
  const hasCert = tender.documents.some((d) => d.type === 'Completion certificate');
  if (!certFile && !hasCert) return fail(400, 'Upload the completion certificate.');
  const document=certFile?await prepareDocument({file:certFile.file,type:'Completion certificate',docDate:completionDate,person}):null;

  await saveTenderTransition(tender, person.id, {
      completionCertNo: str(fields.certNo),
      completionDate,
      completionAuthority: str(fields.authority),
      completionNote: str(fields.note),
      completionSavedAt: tender.completionSavedAt || new Date(),
      sdReleaseEligibleAt,
      sdReleaseConditions:str(fields.sdReleaseConditions),
      stage: ['GOT_THE_BID', 'IN_EXECUTION'].includes(tender.stage) ? 'COMPLETED' : tender.stage,
    }, {
    action: 'certificate added',
    detail: `Completion certificate ${str(fields.certNo) || ''} dated ${formatISTDate(completionDate)}`.replace(/\s+/g, ' '),
  }, document);

  const sdHeld = tender.instruments.some((i) => i.category === 'SD' && HELD_STATUSES.includes(i.status));
  if (sdHeld) after(async () => {
    try {
      const accounts = await peopleWithRole('ACCOUNTS');
      const selectors = await selectorIds(tender.id);
      for (const personId of new Set([...accounts, ...selectors])) {
        await notifyMany([personId], {
          tenderId: tender.id,
          kind: 'SD_APPLY',
          title: `${tender.title} is complete. Review the SD refund.`,
          body: `Completion certificate dated ${formatISTDate(completionDate)} is on file. Check contract release conditions${sdReleaseEligibleAt?` and eligibility from ${formatISTDate(sdReleaseEligibleAt)}`:''} before applying.`,
          dedupeKey: `sdapply:${tender.id}:0`,
        });
      }
    } catch { console.error('completion_notification_failed', { tenderId: tender.id }); }
  });
  return ok({ stage: 'COMPLETED' });
});
