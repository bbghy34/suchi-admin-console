import { prisma } from '@/lib/prisma';
import { INSTRUMENT_CATEGORIES, INSTRUMENT_STATUS_LABEL, STAGE_LABEL } from '../constants';
import { formatINR } from '../format';
import { formatIST } from '../ist';
import { CHAT_SYSTEM } from './prompts';

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function money(value) {
  return value == null ? 'not on record' : formatINR(value);
}

function rowLine(tender) {
  const sample = tender.isSample ? 'SAMPLE' : 'real';
  const place = tender.allIndia ? 'All India' : [tender.placeOfWork, tender.state].filter(Boolean).join(', ') || 'place not on record';
  return [
    sample,
    tender.title,
    `stage ${STAGE_LABEL[tender.stage] || tender.stage}`,
    `source ${tender.source?.displayName || '—'}`,
    place,
    `bid end ${formatIST(tender.bidSubmissionEnd)}`,
    tender.bidOpeningAt ? `opening ${formatIST(tender.bidOpeningAt)}` : 'opening not on record',
    `estimated ${money(tender.estimatedValue)}`,
    `EMD ${money(tender.emdAmount)}${tender.emdMode ? ` (${tender.emdMode})` : ''}`,
    `tender fee ${money(tender.tenderFee)}`,
    `keywords ${tender.searchKeywords || 'none'}`,
  ].join(' | ');
}

function fileLine(doc) {
  const status = doc.textStatus === 'TEXT' ? 'text read' : doc.textStatus === 'IMAGE' ? 'photo, text not read' : 'text not read';
  return `${doc.fileName} (${doc.type || 'file'}, ${status})`;
}

/**
 * Records the chatbot is allowed to use. Sample rows stay marked Sample.
 */
export async function loadDeskBrief(tenderId) {
  const tenders = await prisma.tender.findMany({
    orderBy: { bidSubmissionEnd: 'asc' },
    take: 20,
    include: {
      source: { select: { displayName: true } },
      documents: { select: { fileName: true, type: true, textStatus: true, extractedText: true } },
      instruments: { select: { category: true, amount: true, status: true } },
    },
  });

  let focus = tenderId ? tenders.find((tender) => tender.id === tenderId) : null;
  if (tenderId && !focus) {
    focus = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        source: { select: { displayName: true } },
        documents: { select: { fileName: true, type: true, textStatus: true, extractedText: true } },
        instruments: { select: { category: true, amount: true, status: true } },
      },
    });
    if (focus) tenders.unshift(focus);
  }

  const lines = tenders.map((tender) => {
    const files = tender.documents.map(fileLine).join('; ') || 'no files';
    const instruments = tender.instruments
      .map((item) => `${INSTRUMENT_CATEGORIES[item.category] || item.category} ${formatINR(item.amount)} (${INSTRUMENT_STATUS_LABEL[item.status] || item.status})`)
      .join('; ');
    let block = `- ${rowLine(tender)}\n  files: ${files}`;
    if (instruments) block += `\n  instruments: ${instruments}`;
    if (focus && tender.id === focus.id) {
      const text = tender.documents
        .filter((doc) => doc.textStatus === 'TEXT' && doc.extractedText)
        .map((doc) => `${doc.fileName}: ${clip(doc.extractedText, 1800)}`)
        .join('\n');
      if (text) block += `\n  extracted text:\n${clip(text, 6000)}`;
      if (tender.description) block += `\n  description: ${clip(tender.description, 500)}`;
    }
    return block;
  });

  const text = lines.length
    ? `Desk records (${tenders.length}). The open tender is ${focus ? focus.title : 'none'}.\n${lines.join('\n')}`
    : 'No tenders are saved on this desk.';

  return { focusId: focus?.id || null, focusTitle: focus?.title || null, rows: tenders, text };
}

export function systemWithBrief(brief) {
  return `${CHAT_SYSTEM}\n\n${brief.text}`;
}

function listRows(rows, render) {
  if (!rows.length) return 'No tenders are saved on this desk.';
  return rows.map(render).join('\n');
}

/** Answers the default prompts from saved records when Gemini is not configured. */
export function replyFromRecords(promptId, brief) {
  const rows = brief.rows || [];
  const now = Date.now();
  if (promptId === 'closing') {
    const upcoming = rows.filter((tender) => new Date(tender.bidSubmissionEnd).getTime() >= now);
    const list = (upcoming.length ? upcoming : rows).slice(0, 6);
    const lead = upcoming.length ? 'Closing soonest:' : 'Every saved bid end is already past. Closest on record:';
    return `${lead}\n${listRows(list, (tender) => `• ${tender.isSample ? '[Sample] ' : ''}${tender.title} — bid end ${formatIST(tender.bidSubmissionEnd)}, ${STAGE_LABEL[tender.stage] || tender.stage}`)}`;
  }
  if (promptId === 'dates') {
    return listRows(rows.slice(0, 8), (tender) => {
      const place = tender.allIndia ? 'All India' : [tender.placeOfWork, tender.state].filter(Boolean).join(', ') || 'place not on record';
      const opening = tender.bidOpeningAt ? formatIST(tender.bidOpeningAt) : 'opening not on record';
      return `• ${tender.isSample ? '[Sample] ' : ''}${tender.title} — bid end ${formatIST(tender.bidSubmissionEnd)}, opening ${opening}, ${place}, estimated ${money(tender.estimatedValue)}`;
    });
  }
  if (promptId === 'money') {
    return listRows(rows.slice(0, 8), (tender) => {
      const emdHeld = tender.instruments.filter((item) => item.category === 'EMD');
      const sdHeld = tender.instruments.filter((item) => item.category === 'SD');
      const emd = emdHeld.length
        ? emdHeld.map((item) => `${formatINR(item.amount)} (${INSTRUMENT_STATUS_LABEL[item.status] || item.status})`).join(', ')
        : money(tender.emdAmount);
      const sd = sdHeld.length
        ? sdHeld.map((item) => `${formatINR(item.amount)} (${INSTRUMENT_STATUS_LABEL[item.status] || item.status})`).join(', ')
        : 'no Security Deposit instrument on record';
      return `• ${tender.isSample ? '[Sample] ' : ''}${tender.title}\n  EMD: ${emd}\n  Security Deposit: ${sd}`;
    });
  }
  if (promptId === 'unread') {
    const files = rows.flatMap((tender) =>
      tender.documents
        .filter((doc) => doc.textStatus !== 'TEXT')
        .map((doc) => `• ${tender.title} — ${doc.fileName} (${doc.textStatus === 'IMAGE' ? 'photo, text not read' : 'text not read'})`)
    );
    return files.length ? files.slice(0, 20).join('\n') : 'Every uploaded file on this list has readable text, or no files are saved.';
  }
  if (promptId === 'portals') {
    return 'Daily fetch stays manual. Paste a notice from the official desk. GeM is only a Northeast consignee. Coal India stays on the Northeast filter. GePNIC is the notice format, not a daily inbox.';
  }
  if (promptId === 'eligibility') {
    const target = rows.find((tender) => tender.id === brief.focusId) || rows[0];
    if (!target) return 'No tenders are saved on this desk.';
    const files = target.documents.length
      ? target.documents.map((doc) => `• ${doc.fileName} (${doc.textStatus === 'TEXT' ? 'text read' : 'text not read'})`).join('\n')
      : '• No files uploaded';
    return `${target.isSample ? '[Sample] ' : ''}${target.title}\nFiles:\n${files}\nEligibility wording is in those files. With a Gemini key, the chat can read the extracted text. Without a key, this desk does not guess eligibility.`;
  }
  return null;
}
