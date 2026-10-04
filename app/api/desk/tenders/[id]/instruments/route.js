import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody } from '@/lib/desk/api';
import { instrumentDataFromFields, validateInstrument } from '@/lib/desk/instrument-fields';
import { prepareDocument } from '@/lib/desk/tender-service';
import { INSTRUMENT_STATUS_LABEL } from '@/lib/desk/constants';

/** Add instrument: EMD or Security Deposit, never a third category. */
export const POST = handler(async (req, { params }) => {
  const person = await requireRole('ACCOUNTS', 'ADMIN');
  const tender = await prisma.tender.findUnique({ where: { id: params.id }, include: { instruments: true } });
  if (!tender) return fail(404, 'Tender not found.');
  const { fields, files } = await readBody(req);
  const data = instrumentDataFromFields(fields);
  const problem = validateInstrument(data, tender, { siblings: tender.instruments });
  if (problem) return fail(400, problem);

  const instrumentId = randomUUID();
  let document = null;
  const proof = files.find((f) => f.field === 'proof');
  if (proof) {
    document = { id: randomUUID(), ...await prepareDocument({
      tenderId: tender.id,
      file: proof.file,
      type: data.category === 'SD' ? 'Security Deposit proof' : 'EMD proof',
      docDate: data.instrumentDate,
      person,
      silent: true,
    }) };
    data.proofDocumentId = document.id;
  }
  await prisma.$transaction([
    prisma.tender.update({ where: { id: tender.id, updatedAt: tender.updatedAt }, data: { updatedAt: new Date() } }),
    ...(document ? [prisma.document.create({ data: document })] : []),
    prisma.instrument.create({ data: { ...data, id: instrumentId, tenderId: tender.id } }),
    prisma.activity.create({ data: {
    tenderId: tender.id,
    personId: person.id,
    action: 'money entered',
    detail: `${data.category === 'SD' ? 'Security Deposit' : 'EMD'} ${data.form.toLowerCase()} ${data.number || ''} for ${data.amount}, status ${INSTRUMENT_STATUS_LABEL[data.status]}`.replace(/\s+/g, ' '),
    } }),
  ]);
  return ok({ instrumentId });
});
