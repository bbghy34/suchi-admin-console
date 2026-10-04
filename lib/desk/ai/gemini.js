import { GEMINI_KEY_PLACEHOLDER } from './prompts';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/**
 * Generation settings per model family. Gemini 3 replaced thinkingBudget with
 * thinkingLevel (low, medium, high; default medium) and deprecated sampling
 * settings such as temperature, so those are only sent to older 2.x models.
 * `low` keeps search reading and web search fast; answers stay grounded by the
 * prompt and the cited sources, not by temperature.
 */
const LEGACY_MODEL = /^gemini-(?:1|2)\./.test(MODEL);
export function generationConfig({ maxOutputTokens, thinking = 'low', temperature = 0.2, json = null }) {
  const config = LEGACY_MODEL
    ? { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } }
    : { maxOutputTokens, thinkingConfig: { thinkingLevel: thinking } };
  if (json) {
    config.responseMimeType = 'application/json';
    if (json.schema) config.responseJsonSchema = json.schema;
  }
  return config;
}

/** A pasted or server key that is not the placeholder. Never log the return value. */
export function usableGeminiKey(value) {
  const key = String(value || '').trim();
  if (!key || key === GEMINI_KEY_PLACEHOLDER) return '';
  if (/^your[_-]?gemini/i.test(key)) return '';
  if (key.length < 10 || key.length > 300) return '';
  if (/\s/.test(key)) return '';
  return key;
}

export function geminiKeyStatus() {
  const server = usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return {
    configured: !!server,
    model: MODEL,
    placeholder: GEMINI_KEY_PLACEHOLDER,
  };
}

/**
 * One Gemini generateContent call.
 * Flow: desk route builds the tender brief, then this sends that brief plus the chat.
 */
export async function geminiReply({ apiKey, system, messages, timeoutMs = 45000, inputLimit = 4000, outputLimit = 2048, thinking = 'low', json = null }) {
  const key = usableGeminiKey(apiKey);
  if (!key) return { text: null, error: 'No Gemini API key.' };

  const contents = [];
  for (const message of messages) {
    const text = String(message?.text || '').trim();
    if (!text) continue;
    const role = message.role === 'assistant' ? 'model' : 'user';
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts[0].text += `\n${text}`;
    else contents.push({ role, parts: [{ text: text.slice(0, inputLimit) }] });
  }
  if (!contents.length || contents[0].role !== 'user') {
    return { text: null, error: 'Ask a question first.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: generationConfig({ maxOutputTokens: outputLimit, thinking, temperature: 0.2, json }),
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || `Gemini returned ${res.status}.`;
      return { text: null, error: message.slice(0, 300) };
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part?.text || '').join('').trim();
    if (!text) {
      const block = data?.promptFeedback?.blockReason;
      return { text: null, error: block ? `Gemini blocked that question (${block}).` : 'Gemini returned no text.' };
    }
    return { text, error: null };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { text: null, error: aborted ? 'Gemini took too long. Try a shorter question.' : 'Gemini could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Gemini for one JSON object. Used by search. Does not invent tender rows.
 * The API enforces JSON (and the schema when one is given); the text parsing
 * below stays as a fallback for models or providers without structured output.
 */
export async function geminiJSON({ apiKey, system, user, timeoutMs = 20000, inputLimit, outputLimit, schema = null }) {
  const result = await geminiReply({
    apiKey,
    system: `${system}\nReturn only one JSON object. No markdown.`,
    messages: [{ role: 'user', text: user }],
    timeoutMs,
    inputLimit, outputLimit,
    json: { schema },
  });
  if (!result.text) return { data: null, error: result.error };
  const raw = result.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return { data: JSON.parse(raw), error: null };
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { data: JSON.parse(raw.slice(start, end + 1)), error: null };
      } catch {
        return { data: null, error: 'Gemini did not return JSON.' };
      }
    }
    return { data: null, error: 'Gemini did not return JSON.' };
  }
}

/**
 * Gemini with public web search. Returns the answer text and the pages Google actually cited.
 * Callers must not treat a title or fact as real unless it is tied to one of these links.
 */
export async function geminiGrounded({ apiKey, system, user, timeoutMs = 60000 }) {
  const key = usableGeminiKey(apiKey);
  if (!key) return { text: null, chunks: [], supports: [], error: 'No Gemini API key.' };
  const startedAt = Date.now();
  const metrics = {model: MODEL, searchQueryCount: 0, sourceCount: 0, grounded: false, outcome: 'failed'};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: String(user || '').slice(0, 2000) }] }],
          tools: [{ google_search: {} }],
          // Room for a full list of cited notices; thinking tokens count toward the cap.
          generationConfig: generationConfig({ maxOutputTokens: 8192, thinking: 'low', temperature: 0.1 }),
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || `Gemini returned ${res.status}.`;
      return { text: null, chunks: [], supports: [], error: message.slice(0, 300) };
    }
    const candidate = data?.candidates?.[0] || {};
    const text = (candidate.content?.parts || []).map((part) => part?.text || '').join('').trim();
    const meta = candidate.groundingMetadata || {};
    const chunks = (meta.groundingChunks || [])
      .map((chunk, originalChunkIndex) => ({
        originalChunkIndex,
        title: String(chunk?.web?.title || '').trim(),
        uri: String(chunk?.web?.uri || '').trim(),
      }))
      .filter((chunk) => /^https?:\/\//i.test(chunk.uri));
    const webSearchQueries = Array.isArray(meta.webSearchQueries) ? meta.webSearchQueries.filter(query => typeof query === 'string' && query.trim()) : [];
    Object.assign(metrics, {searchQueryCount: new Set(webSearchQueries).size, sourceCount: chunks.length, grounded: chunks.length > 0, outcome: 'success'});
    return { text, chunks, supports: meta.groundingSupports || [], webSearchQueries,
      searchEntryPoint: meta.searchEntryPoint || null, metrics: {...metrics, elapsedMs: Date.now()-startedAt}, error: null };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      text: null,
      chunks: [],
      supports: [],
      error: aborted ? 'The online search took too long.' : 'The online search could not be reached.',
    };
  } finally {
    clearTimeout(timer);
    // Counts prove whether grounding ran without logging prompts, queries, credentials or source URLs.
    console.info('gemini_grounding', JSON.stringify({...metrics, elapsedMs: Date.now()-startedAt}));
  }
}
