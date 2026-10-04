// Optional model calls prefer Gemini, with OpenAI as an alternative provider.
// Without either key, callers retain their deterministic fallback.

import { geminiJSON, geminiReply, usableGeminiKey } from './gemini';
const geminiKey = () => usableGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
export function modelConfigured() { return !!(geminiKey() || process.env.OPENAI_API_KEY); }

export async function chatJSON({ system, user, timeoutMs = 20000 }) {
  if (!modelConfigured()) return null;
  if (geminiKey()) {
    const result=await geminiJSON({apiKey:geminiKey(),system,user,timeoutMs,inputLimit:180000,outputLimit:8192});
    if(result.error)throw new Error(result.error);
    return result.data;
  }
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Model call failed: ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? JSON.parse(content) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatText({ system, user, timeoutMs = 45000 }) {
  if (!modelConfigured()) return null;
  if (geminiKey()) {
    const result=await geminiReply({apiKey:geminiKey(),system,messages:[{role:'user',text:user}],timeoutMs,inputLimit:180000,outputLimit:8192});
    if(result.error)throw new Error(result.error);
    return result.text;
  }
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Model call failed: ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timer);
  }
}
