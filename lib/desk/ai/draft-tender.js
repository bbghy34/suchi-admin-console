import { prisma } from '@/lib/prisma';
import { SOURCE_REGISTER } from '../constants';
import { tenderDataFromFields, validateTender } from '../tender-fields';
import { geminiReply, usableGeminiKey } from './gemini';

function mentions(text, phrase) {
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function matchSource(hint, note) {
  const blob = `${hint || ''}\n${note || ''}`;
  const id = String(hint || '').trim().toLowerCase();
  const byId = SOURCE_REGISTER.find((source) => source.id === id);
  if (byId) return byId;
  return (
    SOURCE_REGISTER.find((source) => mentions(blob, source.displayName) || mentions(blob, source.id)) ||
    SOURCE_REGISTER.find((source) => source.state && mentions(blob, source.state)) ||
    null
  );
}

function keywordsFromTitle(title) {
  const words = String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  return [...new Set(words)].slice(0, 6).join(',');
}

function parseJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanDraft(parsed, note) {
  const source = matchSource(parsed?.sourceId || parsed?.source, note);
  const title = String(parsed?.title || '').trim();
  const keywords = String(parsed?.searchKeywords || '').trim() || keywordsFromTitle(title);
  const allIndia = source?.allIndia === true || parsed?.allIndia === true;
  return {
    sourceId: source?.id || '',
    title,
    searchKeywords: keywords,
    state: allIndia ? '' : String(parsed?.state || source?.state || '').trim(),
    allIndia: allIndia ? 'true' : '',
    placeOfWork: String(parsed?.placeOfWork || '').trim(),
    bidSubmissionEnd: String(parsed?.bidSubmissionEnd || '').trim(),
    estimatedValue: parsed?.estimatedValue == null ? '' : String(parsed.estimatedValue),
    emdAmount: parsed?.emdAmount == null ? '' : String(parsed.emdAmount),
    tenderFee: parsed?.tenderFee == null ? '' : String(parsed.tenderFee),
    portalTenderId: String(parsed?.portalTenderId || '').trim(),
    description: String(parsed?.description || note || '').trim().slice(0, 2000),
    category: String(parsed?.category || '').trim(),
  };
}

/**
 * Turn the user's own description into tender fields.
 * Missing facts stay empty. Nothing is looked up on a portal.
 */
export async function draftTender(note, apiKey) {
  const text = String(note || '').trim();
  if (text.length < 8) {
    return {
      reply: 'Describe the tender: title, source or state, place of work, bid end, and keywords.',
      record: null,
    };
  }
  const key = usableGeminiKey(apiKey) || usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!key) {
    return {
      reply: 'A Gemini key is set on the server before a description can be turned into a tender. The placeholder in the chat is not a working key.',
      record: null,
    };
  }

  const sources = SOURCE_REGISTER.map((source) => `${source.id} — ${source.displayName}${source.state ? `, ${source.state}` : ''}${source.allIndia ? ', All India' : ''}`).join('\n');
  const system = `Turn one pasted notice into JSON only, no markdown.
{"title":"","sourceId":"","searchKeywords":"","state":"","allIndia":false,"placeOfWork":"","bidSubmissionEnd":"","estimatedValue":null,"emdAmount":null,"tenderFee":null,"portalTenderId":"","description":"","category":""}
sourceId is one id below, or "" if the note names no source. bidSubmissionEnd is YYYY-MM-DDTHH:mm India time, or "" if the note has no bid end. searchKeywords are comma-separated words from the note.
Copy only facts in the note. Leave a field empty rather than guessing. Do not search the web. Do not invent an id, amount, or date. Keep earnest money and security deposit separate.
Sources:
${sources}`;

  const result = await geminiReply({ apiKey: key, system, messages: [{ role: 'user', text }] });
  if (!result.text) {
    return { reply: `Gemini did not draft a tender. ${result.error}`, record: null };
  }
  const parsed = parseJson(result.text);
  if (!parsed) return { reply: 'Gemini did not return tender fields. Try the description again.', record: null };

  const fields = cleanDraft(parsed, text);
  const source = fields.sourceId ? await prisma.source.findUnique({ where: { id: fields.sourceId } }) : null;
  const problems = validateTender(fields, source, { fileCount: 1 });
  const sourceName = source?.displayName || 'Source not matched';
  const reply = problems.length
    ? `This is not saved yet.\n${sourceName}: ${fields.title || 'Untitled'}\nStill needed: ${problems.join(' ')}`
    : `Ready to add.\n${sourceName}: ${fields.title}\nBid end ${fields.bidSubmissionEnd}. Keywords ${fields.searchKeywords}.`;

  return {
    reply,
    record: { fields, sourceName, problems, note: text },
  };
}

export function tenderColumns(fields) {
  return tenderDataFromFields(fields);
}
