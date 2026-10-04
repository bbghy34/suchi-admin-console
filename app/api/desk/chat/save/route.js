import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { fail, handler, ok } from '@/lib/desk/api';
import { takeSearchKeywords, writeSearchKeywords } from '@/lib/desk/keywords';
import { deskAudienceIds, notifyMany } from '@/lib/desk/notify';
import { addDocument, findDuplicates } from '@/lib/desk/tender-service';
import { logActivity } from '@/lib/desk/activity';
import { formatISTDate, istDateKey } from '@/lib/desk/ist';
import { canUploadFetch, fetchAssigneeFor } from '@/lib/desk/fetch-day';
import { validateTender } from '@/lib/desk/tender-fields';
import { tenderColumns } from '@/lib/desk/ai/draft-tender';

function noteFile(text) {
  const buffer = Buffer.from(text, 'utf8');
  return {
    name: 'ai-note.txt',
    type: 'text/plain',
    size: buffer.length,
    arrayBuffer: async () => buffer,
  };
}

/** Save a tender the chat drafted from the user's own description. */
export const POST = handler(async (req) => {
  const person = await requireRole('ADMIN', 'TENDER_EXECUTIVE');
  const day = await fetchAssigneeFor(istDateKey());
  if (!canUploadFetch(person, day)) return fail(403, 'Only the person assigned to today’s fetch, the backup, or an admin can save a tender from the chat.');
  const body = await req.json().catch(() => ({}));
  const fields = body.fields || {};
  const note = String(body.note || fields.description || '').trim().slice(0, 4000);
  const source = fields.sourceId ? await prisma.source.findUnique({ where: { id: String(fields.sourceId) } }) : null;
  const problems = validateTender(fields, source, { fileCount: 1 });
  if (problems.length) return fail(400, problems[0], { problems });

  const full = tenderColumns(fields);
  const { data, searchKeywords } = takeSearchKeywords(full);
  const dupes = await findDuplicates(data);
  if (dupes.exact) {
    return fail(409, `Tender id ${data.portalTenderId} is already on ${source.displayName}.`, {
      existingTenderId: dupes.exact.id,
    });
  }

  const tender = await prisma.tender.create({
    data: { ...data, stage: 'UPLOADED', createdById: person.id, description: data.description || note || null },
  });
  await writeSearchKeywords(tender.id, searchKeywords);
  const bodyText = [
    fields.title,
    source.displayName,
    fields.placeOfWork || fields.state || '',
    `Bid end ${fields.bidSubmissionEnd}`,
    note,
  ]
    .filter(Boolean)
    .join('\n');
  await addDocument({
    tenderId: tender.id,
    file: noteFile(bodyText.length >= 40 ? bodyText : `${bodyText}\nAdded from the desk chat as a text note.`),
    type: 'Other',
    person,
    silent: true,
  });
  await logActivity({
    tenderId: tender.id,
    personId: person.id,
    action: 'uploaded',
    detail: `Added from the desk chat on ${source.displayName}`,
  });
  const audience = await deskAudienceIds();
  await notifyMany(audience, {
    tenderId: tender.id,
    kind: 'TENDER_UPLOADED',
    title: `New tender uploaded: ${data.title}`,
    body: `Added from the desk chat. Bid submission ends ${formatISTDate(data.bidSubmissionEnd)}.`,
    dedupeKey: `uploaded:${tender.id}`,
  });

  return ok({ tenderId: tender.id, title: data.title });
});
