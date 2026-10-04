import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { refundChange, saveRefundChange } from '@/lib/desk/refunds';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/desk/auth';
import { handler, ok, fail, readBody, str } from '@/lib/desk/api';
import { prepareDocument } from '@/lib/desk/tender-service';
import { notifyMany, peopleWithRole, selectorIds } from '@/lib/desk/notify';
import { APPLICATION_STATUS_LABEL } from '@/lib/desk/constants';

export const GET = handler(async (req, { params }) => {
  await requireRole('ACCOUNTS', 'ADMIN', 'BIDDER', 'TENDER_EXECUTIVE');
  const app = await prisma.refundApplication.findUnique({
    where: { id: params.id },
    include: { instruments: true, tender: { include: { documents: true, source: true } } },
  });
  if (!app) return fail(404, 'Application not found.');
  return ok({ application: app });
});

/** Validate the full transition before touching money; commit all status writes together. */
export const PATCH = handler(async (req, { params }) => {
  const person = await requireRole('ACCOUNTS', 'ADMIN');
  const app = await prisma.refundApplication.findUnique({ where: { id: params.id }, include: { instruments: true, tender: true } });
  if (!app) return fail(404, 'Application not found.');
  const { fields, files } = await readBody(req);
  const change = refundChange(app, fields);
  let document = null;
  const proof = files.find((f) => f.field === 'file');
  if (proof && change.status !== app.status && ['ACKNOWLEDGED', 'RELEASED'].includes(change.status)) {
    document = { id: randomUUID(), ...await prepareDocument({ tenderId: app.tenderId, file: proof.file,
      type: change.status === 'RELEASED' ? 'Refund letter' : 'Other',
      docDate: change.data.releasedOn || change.data.ackOn, person, silent: true }) };
    if (change.status === 'ACKNOWLEDGED') change.data.ackDocumentId = document.id;
  }
  await saveRefundChange(app, change, person.id, document);
  // A notification failure must not report a committed refund as failed.
  if (change.status !== app.status) after(async () => {
    const recipients = [...await selectorIds(app.tenderId, { frequencies: ['FREQUENT', 'QUIET'] }), ...await peopleWithRole('ACCOUNTS')];
    await notifyMany(recipients, { tenderId: app.tenderId, kind: 'REFUND_STATUS',
      title: `${app.kind === 'EMD' ? 'EMD refund' : 'Security money'}: ${APPLICATION_STATUS_LABEL[change.status]}.`,
      body: `${app.tender.title} — ${app.officeName}`, dedupeKey: `refund:${app.id}:${change.status}` });
  });
  return ok({ applicationId: app.id, status: change.status });
});
