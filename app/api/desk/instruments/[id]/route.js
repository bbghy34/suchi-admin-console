import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody } from '@/lib/desk/api';
import { instrumentDataFromFields, validateInstrument } from '@/lib/desk/instrument-fields';
import { prepareDocument } from '@/lib/desk/tender-service';
import { logActivity } from '@/lib/desk/activity';
import { INSTRUMENT_STATUS_LABEL } from '@/lib/desk/constants';

/** Accounts corrects an instrument. The log records the old and new status. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requireRole('ACCOUNTS', 'ADMIN');
  const existing = await prisma.instrument.findUnique({ where: { id: params.id }, include: { application: { include: { instruments: true } }, tender: { include: { instruments: true } } } });
  if (!existing) return fail(404, 'Instrument not found.');
  if (existing.application && existing.application.status !== 'REJECTED') return fail(409, existing.application.status === 'DRAFT' ? 'Cancel the draft application before correcting its instruments, then create a new draft.' : 'This instrument belongs to a refund application. Update its refund status from that application.');
  const { fields, files } = await readBody(req);
  const data = instrumentDataFromFields({ ...existing, ...fields, category: existing.category });
  // Keep dates that the form did not send.
  for (const k of ['instrumentDate', 'expiryDate', 'submittedOn', 'refundedOn']) {
    if (fields[k] === undefined) data[k] = existing[k];
  }
  if (existing.application?.status === 'REJECTED') data.applicationId = null;
  if (data.form !== 'Bank guarantee') data.expiryDate = null;
  const problem = validateInstrument(data, existing.tender, { siblings: existing.tender.instruments.filter((i) => i.id !== existing.id) });
  if (problem) return fail(400, problem);
  if (data.status === 'REFUNDED' && !data.refundedOn) data.refundedOn = new Date();

  let document = null;
  const proof = files.find((f) => f.field === 'proof');
  if (proof) {
    document = { id: randomUUID(), ...await prepareDocument({
      tenderId: existing.tenderId,
      file: proof.file,
      type: data.status === 'REFUNDED' ? 'Refund letter' : existing.category === 'SD' ? 'Security Deposit proof' : 'EMD proof',
      person,
      silent: true,
    }) };
    data.proofDocumentId = document.id;
  }
  await prisma.$transaction([
    prisma.tender.update({ where: { id: existing.tenderId, updatedAt: existing.tender.updatedAt }, data: { updatedAt: new Date() } }),
    ...(existing.application?.status === 'REJECTED' ? [prisma.refundApplication.update({ where: { id: existing.application.id, updatedAt: existing.application.updatedAt }, data: { instrumentsSnapshot: existing.application.instrumentsSnapshot || JSON.stringify(existing.application.instruments) } })] : []),
    ...(document ? [prisma.document.create({ data: document })] : []),
    prisma.instrument.update({ where: { id: existing.id, updatedAt: existing.updatedAt, applicationId: existing.applicationId }, data }),
  ]);
  const what = `${existing.category === 'SD' ? 'Security Deposit' : 'EMD'} ${existing.number || data.number || ''}`.trim();
  if (existing.status !== data.status) {
    await logActivity({
      tenderId: existing.tenderId,
      personId: person.id,
      action: 'status changed',
      detail: `${what}: ${INSTRUMENT_STATUS_LABEL[existing.status]} → ${INSTRUMENT_STATUS_LABEL[data.status]}`,
    });
  } else {
    await logActivity({ tenderId: existing.tenderId, personId: person.id, action: 'money corrected', detail: `${what} edited` });
  }
  return ok({ instrumentId: existing.id });
});
