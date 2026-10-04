import { prisma } from '@/lib/prisma';
import { formatINR } from './format';
import { formatISTDate } from './ist';
import { notifyMany, peopleWithRole, selectorIds } from './notify';
import { readNoticeFacts } from './notice-facts';

/** Inbox lines for a postponement, an extension, or money still held after a completion certificate. */
export async function notifyFromUpload({ tenderId, title, doc, change = {} }) {
  const people = await selectorIds(tenderId);
  if (!people.length || !doc) return;
  const facts = readNoticeFacts({
    documents: [{ ...doc, ...change }],
    tender: {},
  });
  for (const item of facts.postponements) {
    await notifyMany(people, {
      tenderId,
      kind: 'BID_POSTPONED',
      title: `Bid dates for ${title} were postponed.`,
      body: `${item.line} File: ${doc.fileName}.`,
      dedupeKey: `postpone:${tenderId}:${clip(item.line)}`,
    });
  }
  for (const item of facts.extensions) {
    await notifyMany(people, {
      tenderId,
      kind: 'BID_EXTENDED',
      title: `A date on ${title} was extended.`,
      body: `${item.line} File: ${doc.fileName}.`,
      dedupeKey: `extend:${tenderId}:${clip(item.line)}`,
    });
  }
  if (doc.type !== 'Completion certificate') return;
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: { instruments: true, applications: true },
  });
  if (!tender) return;
  const full = readNoticeFacts({
    documents: [doc],
    instruments: tender.instruments,
    applications: tender.applications,
    tender,
  });
  const accounts = await peopleWithRole('ACCOUNTS');
  const recipients = [...new Set([...people, ...accounts])];
  const when = tender.completionDate ? formatISTDate(tender.completionDate) : 'the date on the certificate';
  if (full.emdHeld > 0) {
    await notifyMany(recipients, {
      tenderId,
      kind: 'EMD_REFUND',
      title: `EMD for ${title} is still held after the completion certificate.`,
      body: `Certificate ${doc.fileName}. Completion date ${when}. EMD still held ${formatINR(full.emdHeld)}. Earnest money is separate from security deposit.`,
      dedupeKey: `emdcert:${doc.id}`,
    });
  }
  if (full.sdHeld > 0) {
    await notifyMany(recipients, {
      tenderId,
      kind: 'SD_RETURN',
      title: `Security deposit for ${title} is still held after the completion certificate.`,
      body: `Certificate ${doc.fileName}. Completion date ${when}. Security deposit still held ${formatINR(full.sdHeld)}.`,
      dedupeKey: `sdcert:${doc.id}`,
    });
  }
}

function clip(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 90);
}
