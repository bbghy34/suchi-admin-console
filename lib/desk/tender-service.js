import { luitAdminPersonIds, hideLuitAdminOnTender } from '@/lib/luit-admin/privacy.mjs';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HttpError } from './auth';
import { logActivity } from './activity';
import { notifyMany, selectorIds } from './notify';
import { extractText, isAllowedUpload, saveUpload } from './files';
import { buildChecklist, summarize } from './ai/summarizer';
import { formatIST, istDateKey } from './ist';

export const TENDER_FULL_INCLUDE = {
  source: true,
  documents: { orderBy: { uploadedAt: 'desc' }, include: { uploadedBy: { select: { id: true, name: true } } } },
  selections: { include: { person: { select: { id: true, name: true } } } },
  checklist: { orderBy: { order: 'asc' }, include: { ticks: { select: { personId: true } } } },
  instruments: { orderBy: { createdAt: 'asc' } },
  applications: { orderBy: { createdAt: 'desc' }, include: { instruments: true } },
  activities: { orderBy: { at: 'desc' }, take: 40, include: { person: { select: { id: true, name: true } } } },
};

export async function loadTender(id) {
  const t = await prisma.tender.findUnique({ where: { id }, include: TENDER_FULL_INCLUDE });
  if (!t) throw new HttpError(404, 'Tender not found.');
  const { attachCorrigendumFields } = await import('./corrigendum');
  await attachCorrigendumFields(t.id, t.documents);
  return hideLuitAdminOnTender(t, await luitAdminPersonIds(prisma));
}

/** Prepare upload bytes before a short database transaction. */
export async function prepareDocument({ tenderId, file, type, docDate, person, silent = false }) {
  if (!isAllowedUpload(file)) throw new HttpError(400, `“${file.name}” is not a PDF, Word, Excel, text, or photo file.`);
  const saved = await saveUpload(file);
  const { text, status } = await extractText(saved.buffer, saved.mime, saved.fileName);
  return {
      tenderId,
      type: type || 'Other',
      fileName: saved.fileName,
      storedName: saved.storedName,
      mime: saved.mime,
      size: saved.size,
      docDate: docDate || null,
      extractedText: text || null,
      textStatus: status,
      uploadedById: person?.id || null,
      file: { create: { bytes: saved.buffer } },
  };
}

export async function addDocument(args) {
  const { tenderId, type, person, silent = false } = args;
  const data = await prepareDocument(args);
  const doc = await prisma.document.create({ data });
  await logActivity({
    tenderId,
    personId: person?.id,
    action: type === 'Corrigendum' ? 'corrigendum' : 'document added',
    detail: `${type || 'Other'}: ${data.fileName}${data.textStatus === 'TEXT' ? '' : ' (text not read)'}`,
  });
  if (!silent) {
    const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { title: true } });
    const people = await selectorIds(tenderId);
    await notifyMany(people, {
      tenderId,
      kind: type === 'Corrigendum' ? 'CORRIGENDUM' : 'NEW_DOCUMENT',
      title: `New ${type || 'document'} on ${tender.title}.`,
      body:
        type === 'Corrigendum'
          ? `File: ${data.fileName}. Please re-read the requirement summary, then press “Refresh the summary”.`
          : `File: ${data.fileName}.`,
      dedupeKey: `doc:${doc.id}`,
    });
  }
  return doc;
}

/** Run the AI summary and rebuild the checklist lines that came from it. */
export async function generateSummary(tenderId, { personId, refresh = false } = {}) {
  const runId = randomUUID();
  const claimed = await prisma.tender.updateMany({
    where: { id: tenderId, OR: [{ summaryBusy: false }, { summaryStartedAt: null }, { summaryStartedAt: { lt: new Date(Date.now() - 10 * 60000) } }] },
    data: { summaryBusy: true, summaryError: null, summaryRunId: runId, summaryStartedAt: new Date() },
  });
  if (!claimed.count) throw new HttpError(409, 'A summary is already being refreshed. Please wait.');
  try {
    const tender = await prisma.tender.findUnique({ where: { id: tenderId }, include: { documents: true } });
    const summary = await summarize(tender, tender.documents);
    const items = buildChecklist(summary);
    const existing = await prisma.checklistItem.findMany({ where: { tenderId, fromSummary: true }, include: { ticks: true } });
    const key = (item) => `${item.section}:${item.label.trim().toLowerCase()}`;
    const byLabel = new Map(existing.map((e) => [key(e), e]));
    const keep = new Set();
    const operations = [prisma.tender.update({
      where: { id: tenderId, summaryRunId: runId },
      data: { summaryJson: JSON.stringify(summary), summaryAt: new Date(), summaryFiles: JSON.stringify(summary.files),
        summaryError: null, summaryBusy: false, summaryRunId: null, summaryStartedAt: null },
    })];
    const seen = new Set();
    for (const it of items) {
      if (seen.has(key(it))) continue;
      seen.add(key(it));
      const prev = byLabel.get(key(it));
      if (prev) {
        keep.add(prev.id);
        operations.push(prisma.checklistItem.update({ where: { id: prev.id }, data: { mandatory: it.mandatory, section: it.section, sourceFile: it.sourceFile, order: it.order } }));
      } else operations.push(prisma.checklistItem.create({ data: { tenderId, ...it, fromSummary: true } }));
    }
    const stale = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    // Check ticks at commit time as a bidder may tick a line during generation.
    if (stale.length) {
      operations.push(prisma.checklistItem.updateMany({ where: { id: { in: stale }, ticks: { some: {} } }, data: { mandatory: false } }));
      operations.push(prisma.checklistItem.deleteMany({ where: { id: { in: stale }, ticks: { none: {} } } }));
    }
    await prisma.$transaction(operations);
    await logActivity({ tenderId, personId, action: refresh ? 'summary refreshed' : 'summary generated', detail: `${summary.files.length} file(s), via ${summary.via}` });
    if (refresh) {
      const people = await selectorIds(tenderId);
      await notifyMany(people, {
        tenderId,
        kind: 'SUMMARY_UPDATED',
        title: `Document requirements were updated on ${tender.title}.`,
        body: `Summary refreshed over ${summary.files.length} file(s) at ${formatIST(new Date())}.`,
        dedupeKey: `summary:${tenderId}:${Date.now()}`,
      });
    }
    return summary;
  } catch (err) {
    console.error('generateSummary failed', err);
    await prisma.tender.updateMany({ where: { id: tenderId, summaryRunId: runId }, data: { summaryBusy: false, summaryRunId: null, summaryStartedAt: null, summaryError: 'The summary could not be refreshed.' } });
    throw err;
  }
}

/** Selection: My tenders, frequent notifications, summary, checklist. */
export async function selectTender(tenderId, person) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) throw new HttpError(404, 'Tender not found.');
  const selectionKey = { tenderId_personId: { tenderId, personId: person.id } };
  let selection = await prisma.selection.findUnique({ where: selectionKey });
  let already = Boolean(selection);
  if (!selection) {
    const notification = {
      personId: person.id, tenderId, kind: 'SELECTED',
      title: `You are watching ${tender.title}. Bid submission ends ${formatIST(tender.bidSubmissionEnd)}.`,
      body: 'Frequent notifications are on for this tender. Change them on the tender page.',
      dedupeKey: `selected:${tenderId}:${person.id}`,
    };
    try {
      [selection] = await prisma.$transaction([
        prisma.selection.create({ data: { tenderId, personId: person.id, frequency: 'FREQUENT' } }),
        prisma.tender.updateMany({ where: { id: tenderId, stage: 'UPLOADED' }, data: { stage: 'SELECTED' } }),
        prisma.activity.create({ data: { tenderId, personId: person.id, action: 'selected', detail: `${person.name} selected this tender` } }),
        prisma.notification.upsert({ where: { dedupeKey: notification.dedupeKey }, create: notification, update: {} }),
      ]);
    } catch (err) {
      // A simultaneous selection by the same person is an idempotent success.
      if (err?.code !== 'P2002') throw err;
      selection = await prisma.selection.findUnique({ where: selectionKey });
      if (!selection) throw err;
      already = true;
    }
  }
  // The summary may take a moment when a model is configured; do not block the selection.
  if (!tender.summaryJson) {
    after(() => generateSummary(tenderId, { personId: person.id }).catch((err) => console.error('Selection summary failed', err)));
  }
  return { selection, already };
}

/**
 * Same tender id on the same source blocks the save. Same reference number, or a
 * very similar title with the same value and the same bid submission end, warns.
 */
export async function findDuplicates({ sourceId, portalTenderId, referenceNo, title, estimatedValue, bidSubmissionEnd }, excludeId = null) {
  const out = { exact: null, similar: [] };
  if (sourceId && portalTenderId) {
    out.exact = await prisma.tender.findFirst({
      where: { sourceId, portalTenderId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true, title: true, sourceId: true, portalTenderId: true },
    });
  }
  const candidates = await prisma.tender.findMany({
    where: {
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      OR: [
        ...(referenceNo ? [{ referenceNo }] : []),
        ...(bidSubmissionEnd ? [{ bidSubmissionEnd }] : []),
      ],
    },
    select: { id: true, title: true, referenceNo: true, estimatedValue: true, bidSubmissionEnd: true, sourceId: true, scheme: true, source: { select: { displayName: true } } },
    take: 50,
  });
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mine = norm(title);
  for (const c of candidates) {
    if (out.exact && c.id === out.exact.id) continue;
    const reasons = [];
    if (referenceNo && c.referenceNo === referenceNo) reasons.push('same reference number');
    const sameEnd = bidSubmissionEnd && c.bidSubmissionEnd && istDateKey(c.bidSubmissionEnd) === istDateKey(bidSubmissionEnd);
    const sameValue = estimatedValue != null && c.estimatedValue != null && Math.abs(c.estimatedValue - estimatedValue) < 1;
    if (sameEnd && sameValue && similarity(mine, norm(c.title)) >= 0.6) reasons.push('very similar title with the same value and the same bid submission end');
    if (reasons.length) out.similar.push({ ...c, reasons });
  }
  return out;
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(A.size, B.size);
}

export function parseSummary(tender) {
  if (!tender?.summaryJson) return null;
  try {
    return JSON.parse(tender.summaryJson);
  } catch {
    return null;
  }
}
