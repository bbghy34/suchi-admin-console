import { requirePerson } from '@/lib/desk/auth';
import { handler, ok } from '@/lib/desk/api';
import { DESK_PROMPTS } from '@/lib/desk/ai/prompts';
import { geminiKeyStatus, geminiReply, usableGeminiKey } from '@/lib/desk/ai/gemini';
import { loadDeskBrief, replyFromRecords, systemWithBrief } from '@/lib/desk/ai/tender-brief';
import { draftTender } from '@/lib/desk/ai/draft-tender';

const PROMPT_IDS = new Set(DESK_PROMPTS.map((prompt) => prompt.id));

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: String(message?.text || '').trim().slice(0, 2000),
    }))
    .filter((message) => message.text);
}

/** Whether a server Gemini key is set. The key itself is never returned. */
export const GET = handler(async () => {
  await requirePerson();
  const status = geminiKeyStatus();
  return ok({ configured: status.configured, model: status.model, placeholder: status.placeholder, prompts: DESK_PROMPTS });
});

/**
 * Chat flow: signed-in desk user → saved tender records → Gemini, if a key is set.
 * A pasted key is used for this request only and is not stored.
 * Default prompts still answer from the records when no key is set.
 */
export const POST = handler(async (req) => {
  await requirePerson();
  const body = await req.json().catch(() => ({}));
  const messages = cleanMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return ok({ reply: 'Type a question or choose a prompt.', source: 'desk' });
  }

  const tenderId = typeof body.tenderId === 'string' && body.tenderId.length < 80 ? body.tenderId : null;
  const promptId = PROMPT_IDS.has(body.promptId) && body.promptId !== 'add' ? body.promptId : null;
  const pasted = usableGeminiKey(body.apiKey);
  const server = usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const apiKey = pasted || server;

  if (body.action === 'draft' || body.promptId === 'add') {
    const drafted = await draftTender(messages[messages.length - 1].text, apiKey);
    return ok({
      reply: drafted.reply,
      record: drafted.record,
      source: drafted.record ? 'gemini' : 'desk',
      configured: !!apiKey,
    });
  }

  const brief = await loadDeskBrief(tenderId);
  if (!apiKey) {
    const local = replyFromRecords(promptId, brief);
    const reply = local
      ? `${local}\n\nThis is from the desk records, not Gemini. Paste a Gemini API key to ask in your own words.`
      : 'Paste a Gemini API key to ask that. The default prompts still answer from the desk records without a key. Create a key in Google AI Studio. There is no shared default key.';
    return ok({ reply, source: 'desk', configured: false });
  }

  const result = await geminiReply({
    apiKey,
    system: systemWithBrief(brief),
    messages,
  });
  if (!result.text) {
    const local = replyFromRecords(promptId, brief);
    const reply = local
      ? `${local}\n\nGemini did not answer (${result.error}). The lines above are from the desk records.`
      : `Gemini did not answer. ${result.error}`;
    return ok({ reply, source: 'desk', configured: true });
  }
  return ok({ reply: result.text, source: 'gemini', configured: true });
});
