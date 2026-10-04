import { prisma } from '@/lib/prisma';
import { HttpError } from './auth';
import { HELD_STATUSES } from './constants';
import { parseISTInput } from './ist';

export const REFUND_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['ACKNOWLEDGED', 'RELEASED', 'REJECTED'],
  ACKNOWLEDGED: ['RELEASED', 'REJECTED'],
  RELEASED: [],
  REJECTED: [],
};

export function refundChange(app, fields) {
  const status = fields.status || app.status;
  const data = {};
  if (typeof fields.letterText === 'string' && fields.letterText.trim()) data.letterText = fields.letterText.trim();
  if (status === app.status) return { status, data, instrumentData: null };
  if (!REFUND_TRANSITIONS[app.status]?.includes(status)) throw new HttpError(400, `Cannot change ${app.status} to ${status}.`);
  const cancellingDraft = app.status === 'DRAFT' && status === 'REJECTED';
  if (!app.instruments.length && !cancellingDraft) throw new HttpError(409, 'This application has no instruments. Open the current application.');
  const allowed = app.status === 'DRAFT' ? HELD_STATUSES.filter((s) => s !== 'REFUND_APPLIED') : ['REFUND_APPLIED'];
  if (!cancellingDraft && app.instruments.some((i) => !allowed.includes(i.status))) throw new HttpError(409, 'An instrument changed. Review its status before continuing.');
  data.status = status;
  if (!app.instrumentsSnapshot) data.instrumentsSnapshot = JSON.stringify(app.instruments);
  let instrumentData = null;
  const dateField = { SUBMITTED: 'sentOn', ACKNOWLEDGED: 'ackOn', RELEASED: 'releasedOn' }[status];
  if (dateField) {
    data[dateField] = fields[dateField] ? parseISTInput(fields[dateField]) : new Date();
    if (!data[dateField]) throw new HttpError(400, 'Enter a valid application date.');
    const previous = status === 'ACKNOWLEDGED' ? app.sentOn : status === 'RELEASED' ? (app.ackOn || app.sentOn) : null;
    // Date inputs represent the whole IST day, so allow the same calendar date.
    if (previous && data[dateField].getTime() + 86400000 <= previous.getTime()) throw new HttpError(400, 'The application date cannot precede the previous step.');
  }
  if (status === 'SUBMITTED') instrumentData = { status: 'REFUND_APPLIED', refundedOn: null };
  if (status === 'RELEASED') instrumentData = { status: 'REFUNDED', refundedOn: data.releasedOn };
  if (status === 'REJECTED') {
    if (!String(fields.rejectNote || '').trim()) throw new HttpError(400, 'Explain why the office rejected this application.');
    data.rejectNote = String(fields.rejectNote).trim();
    instrumentData = app.status === 'DRAFT' ? { applicationId: null } : { status: 'HELD', refundedOn: null, applicationId: null };
  }
  return { status, data, instrumentData };
}

/** Batch transactions work with pooled Postgres; no network or file work inside. */
export async function saveRefundChange(app, change, personId, document = null) {
  const { status, data, instrumentData } = change;
  const operations = [
    prisma.tender.update({ where: { id: app.tenderId, updatedAt: app.tender.updatedAt }, data: { updatedAt: new Date() } }),
    ...(document ? [prisma.document.create({ data: document })] : []),
    prisma.refundApplication.update({ where: { id: app.id, updatedAt: app.updatedAt }, data }),
  ];
  // Guard even acknowledgements against instruments being reattached/edited.
  if (status !== app.status) for (const i of app.instruments) {
    operations.push(prisma.instrument.update({
      where: { id: i.id, applicationId: app.id, updatedAt: i.updatedAt, status: i.status },
      data: instrumentData || { updatedAt: new Date() },
    }));
  }
  if (app.kind === 'SD' && status !== app.status && !(app.status === 'DRAFT' && status === 'REJECTED')) {
    operations.push(prisma.tender.updateMany({
      where: { id: app.tenderId, stage: { not: 'CLOSED' }, instruments: { some: { category: 'SD', status: 'REFUND_APPLIED' } } },
      data: { stage: 'SD_APPLIED' },
    }));
    operations.push(prisma.tender.updateMany({
      where: { id: app.tenderId, stage: 'SD_APPLIED', instruments: { none: { category: 'SD', status: 'REFUND_APPLIED' }, some: { category: 'SD', status: { notIn: ['REFUNDED', 'EXEMPTED', 'FORFEITED'] } } } },
      data: { stage: 'COMPLETED' },
    }));
    operations.push(prisma.tender.updateMany({
      where: { id: app.tenderId, stage: { not: 'CLOSED' }, instruments: { some: { category: 'SD', status: 'REFUNDED' }, none: { category: 'SD', status: { notIn: ['REFUNDED', 'EXEMPTED', 'FORFEITED'] } } } },
      data: { stage: 'SD_RELEASED' },
    }));
  }
  operations.push(prisma.activity.create({ data: {
    tenderId: app.tenderId, personId,
    action: status === app.status ? 'letter edited' : 'refund status changed',
    detail: `${app.officeName}: ${app.status} → ${status}${data.rejectNote ? ': ' + data.rejectNote : ''}`,
  } }));
  await prisma.$transaction(operations);
}
