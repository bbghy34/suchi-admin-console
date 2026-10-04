import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody } from '@/lib/desk/api';
import { tenderDataFromFields, validateTender } from '@/lib/desk/tender-fields';
import { takeSearchKeywords, writeSearchKeywords } from '@/lib/desk/keywords';
import { findDuplicates, loadTender } from '@/lib/desk/tender-service';
import { logActivity } from '@/lib/desk/activity';
import { getWorkCategories } from '@/lib/desk/settings';
import { markSourceUploaded } from '@/lib/desk/fetch-mark';

export const GET = handler(async (req, { params }) => {
  await requireRole('TENDER_EXECUTIVE', 'ADMIN', 'BIDDER', 'ACCOUNTS');
  const tender = await loadTender(params.id);
  return ok({ tender });
});

/** Edit a tender. The fetcher who uploaded it, or an admin. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requireRole('TENDER_EXECUTIVE', 'ADMIN');
  const existing = await prisma.tender.findUnique({ where: { id: params.id }, include: { documents: true } });
  if (!existing) return fail(404, 'Tender not found.');
  const { fields } = await readBody(req);

  // A small edit: only the scheme tag (used by "Link as the same tender" for PMGSY).
  if (fields.onlyScheme) {
    const scheme = fields.scheme === 'PMGSY' ? 'PMGSY' : fields.scheme || null;
    await prisma.tender.update({ where: { id: existing.id }, data: { scheme } });
    await logActivity({ tenderId: existing.id, personId: person.id, action: 'edited', detail: `Scheme tag set to ${scheme || 'none'}` });
    if (scheme === 'PMGSY') await markSourceUploaded('pmgsy', person.id);
    return ok({ tenderId: existing.id });
  }

  const full = tenderDataFromFields(fields);
  const { data, searchKeywords } = takeSearchKeywords(full);
  const source = data.sourceId ? await prisma.source.findUnique({ where: { id: data.sourceId } }) : null;
  const workCategories = await getWorkCategories();
  const problems = validateTender(fields, source, { fileCount: 0, hasExistingFiles: existing.documents.length > 0, workCategories });
  if (problems.length) return fail(400, problems[0], { problems });

  const dupes = await findDuplicates(data, existing.id);
  if (dupes.exact) return fail(409, `Tender id ${data.portalTenderId} already exists on ${source.displayName}.`, { existingTenderId: dupes.exact.id, duplicate: 'exact' });

  await prisma.tender.update({ where: { id: existing.id }, data });
  await writeSearchKeywords(existing.id, searchKeywords);
  await logActivity({ tenderId: existing.id, personId: person.id, action: 'edited', detail: 'Tender fields edited' });
  if (data.scheme === 'PMGSY' && existing.scheme !== 'PMGSY') await markSourceUploaded('pmgsy', person.id);
  return ok({ tenderId: existing.id });
});
