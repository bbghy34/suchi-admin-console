import { prisma } from '@/lib/prisma';
import { requirePerson, HttpError } from '@/lib/desk/auth';
import { handler, ok, fail } from '@/lib/desk/api';
import { generateSummary, parseSummary } from '@/lib/desk/tender-service';

/** Refresh the summary over the full set of files, including any corrigendum. */
export const POST = handler(async (req, { params }) => {
  const person = await requirePerson();
  const tender = await prisma.tender.findUnique({ where: { id: params.id }, select: { id: true, summaryJson: true } });
  if (!tender) return fail(404, 'Tender not found.');
  try {
    const summary = await generateSummary(tender.id, { personId: person.id, refresh: !!tender.summaryJson });
    return ok({ summary });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return fail(500, 'The summary could not be refreshed.', { kept: !!tender.summaryJson });
  }
});

/** Poll while the summary is being written. */
export const GET = handler(async (req, { params }) => {
  await requirePerson();
  const tender = await prisma.tender.findUnique({
    where: { id: params.id },
    select: { id: true, summaryJson: true, summaryAt: true, summaryBusy: true, summaryStartedAt: true, summaryError: true },
  });
  if (!tender) return fail(404, 'Tender not found.');
  return ok({ busy: tender.summaryBusy && tender.summaryStartedAt && Date.now() - tender.summaryStartedAt.getTime() < 10 * 60000, error: tender.summaryError, summaryAt: tender.summaryAt, summary: parseSummary(tender) });
});
