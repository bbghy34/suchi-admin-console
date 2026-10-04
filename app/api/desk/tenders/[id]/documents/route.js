import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { addDocument } from '@/lib/desk/tender-service';
import { writeCorrigendumChange } from '@/lib/desk/corrigendum';
import { notifyFromUpload } from '@/lib/desk/notice-alerts';
import { parseISTInput } from '@/lib/desk/ist';

/** Add a document (usually a corrigendum, a letter, a proof, or a certificate). */
export const POST = handler(async (req, { params }) => {
  const person = await requireRole('TENDER_EXECUTIVE', 'ADMIN', 'BIDDER', 'ACCOUNTS');
  const tender = await prisma.tender.findUnique({ where: { id: params.id } });
  if (!tender) return fail(404, 'Tender not found.');
  const { fields, files } = await readBody(req);
  const docFiles = files.filter((f) => f.field === 'file');
  if (!docFiles.length) return fail(400, 'Pick a file first.');
  const type = str(fields.type) || 'Other';
  const docDate = parseISTInput(fields.docDate);
  const docs = [];
  for (const f of docFiles) {
    const doc = await addDocument({ tenderId: tender.id, file: f.file, type, docDate, person });
    const change = type === 'Corrigendum'
      ? { changeNote: fields.changeNote, previousValue: fields.previousValue, updatedValue: fields.updatedValue }
      : {};
    if (type === 'Corrigendum') await writeCorrigendumChange(doc.id, change);
    await notifyFromUpload({ tenderId: tender.id, title: tender.title, doc, change });
    docs.push(doc);
  }
  return ok({ documents: docs.map((d) => ({ id: d.id, fileName: d.fileName, type: d.type })) });
});
