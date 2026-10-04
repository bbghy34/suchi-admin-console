import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, bool, str } from '@/lib/desk/api';
import { tenderDataFromFields, validateTender } from '@/lib/desk/tender-fields';
import { takeSearchKeywords, writeSearchKeywords } from '@/lib/desk/keywords';
import { deskAudienceIds, notifyMany } from '@/lib/desk/notify';
import { prepareDocument, findDuplicates } from '@/lib/desk/tender-service';
import { logActivity } from '@/lib/desk/activity';
import { getWorkCategories } from '@/lib/desk/settings';
import { formatISTDate, istDateKey, parseISTInput } from '@/lib/desk/ist';
import { markSourceUploaded } from '@/lib/desk/fetch-mark';
import { canUploadFetch, fetchAssigneeFor } from '@/lib/desk/fetch-day';

/** New tender: a form, not an import. */
export const POST = handler(async (req) => {
  const person = await requireRole('ADMIN', 'TENDER_EXECUTIVE');
  const day = await fetchAssigneeFor(istDateKey());
  if (!canUploadFetch(person, day)) return fail(403, 'Only the person assigned to today’s fetch, the backup, or an admin can upload a tender.');
  const { fields, files } = await readBody(req);
  const full = tenderDataFromFields(fields);
  const { data, searchKeywords } = takeSearchKeywords(full);
  const source = data.sourceId ? await prisma.source.findUnique({ where: { id: data.sourceId } }) : null;
  const workCategories = await getWorkCategories();
  const docFiles = files.filter((f) => f.field === 'file');

  const problems = validateTender(fields, source, { fileCount: docFiles.length, workCategories });
  if (problems.length) return fail(400, problems[0], { problems });

  // Same tender id on the same source: open the existing tender instead of a duplicate.
  const dupes = await findDuplicates(data);
  if (dupes.exact) {
    return fail(409, `Tender id ${data.portalTenderId} already exists on ${source.displayName}. Opening the existing tender so you can add a document.`, {
      existingTenderId: dupes.exact.id,
      duplicate: 'exact',
    });
  }
  if (dupes.similar.length && !bool(fields.keepBoth)) {
    return fail(409, 'Another tender looks like the same notice. Choose “Link as the same tender” or “Keep both”.', {
      duplicate: 'similar',
      similar: dupes.similar.map((s) => ({ id: s.id, title: s.title, referenceNo: s.referenceNo, source: s.source?.displayName, reasons: s.reasons })),
    });
  }

  const fileTypes = [].concat(fields.fileType || []);
  const fileDates = [].concat(fields.fileDate || []);

  // Validate and extract every upload before saving the tender. A bad file must
  // not leave a tender with no documents behind. Nested writes commit together.
  const prepared=[];
  for(let i=0;i<docFiles.length;i++)prepared.push(await prepareDocument({file:docFiles[i].file,type:fileTypes[i] || 'NIT',docDate:parseISTInput(fileDates[i]),person}));
  const tender = await prisma.tender.create({
    data: { ...data, stage: 'UPLOADED', createdById: person.id,documents:{create:prepared} },
  });
  await writeSearchKeywords(tender.id, searchKeywords);
  const audience = await deskAudienceIds();
  await notifyMany(audience, {
    tenderId: tender.id,
    kind: 'TENDER_UPLOADED',
    title: `New tender uploaded: ${data.title}`,
    body: `Bid submission ends ${formatISTDate(data.bidSubmissionEnd)}. Search keywords: ${(searchKeywords || '').split(',').filter(Boolean).join(', ')}.`,
    dedupeKey: `uploaded:${tender.id}`,
  });
  await logActivity({
    tenderId: tender.id,
    personId: person.id,
    action: 'uploaded',
    detail: `Uploaded from ${source.displayName} with ${docFiles.length} file${docFiles.length === 1 ? '' : 's'}${data.uploadAnywayReason ? ` (upload anyway: ${data.uploadAnywayReason})` : ''}`,
  });

  const today = istDateKey();
  if (source.isDaily) await markSourceUploaded(source.id, person.id, today);
  if (data.scheme === 'PMGSY') await markSourceUploaded('pmgsy', person.id, today);

  return ok({ tenderId: tender.id });
});

export const GET = handler(async () => {
  await requireRole('TENDER_EXECUTIVE', 'ADMIN', 'BIDDER', 'ACCOUNTS');
  const rows = await prisma.tender.findMany({
    orderBy: { bidSubmissionEnd: 'asc' },
    select: { id: true, title: true, sourceId: true, stage: true, bidSubmissionEnd: true, isSample: true, portalTenderId: true },
  });
  return ok({ rows });
});
