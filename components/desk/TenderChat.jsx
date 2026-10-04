'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { KeyRound, SendHorizontal, Sparkles, X } from 'lucide-react';
import { DESK_PROMPTS, GEMINI_KEY_PLACEHOLDER } from '@/lib/desk/ai/prompts';

const KEY_STORAGE = 'desk-gemini-key';

function tenderIdFromPath(path) {
  const match = String(path || '').match(/^\/tenders\/desk\/tenders\/([^/]+)$/);
  // The upload form lives at /tenders/new; it is not a tender.
  return match && match[1] !== 'new' ? match[1] : null;
}

export function openDeskChat(prompt) {
  window.dispatchEvent(new CustomEvent('desk-chat', { detail: prompt || null }));
}

export function DeskChatSection() {
  return (
    <section className="mb-6 rounded-lg border border-desk/30 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Ask about these tenders</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Ask about saved tenders, or add one from a notice you paste.
          </p>
        </div>
        <button type="button" onClick={() => openDeskChat()} className="rounded bg-desk px-3 py-1.5 text-sm font-medium text-white">
          Open chat
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {DESK_PROMPTS.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => openDeskChat(prompt.id === 'add' ? { id: 'add' } : prompt)}
            className="rounded-full bg-desk-light px-3 py-1 text-xs font-medium text-desk-dark"
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Compact "Ask AI" row for the dashboard hero. */
export function DeskChatPrompts() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => openDeskChat()} className="d-pill !border-[var(--md-primary)] !text-mat-on">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3 3v-3h0A1 1 0 0 1 2 10z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        Ask AI about your tenders
      </button>
      {DESK_PROMPTS.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          onClick={() => openDeskChat(prompt.id === 'add' ? { id: 'add' } : prompt)}
          className="d-pill"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

export function TenderChat() {
  const path = usePathname();
  const tenderId = tenderIdFromPath(path);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [adding, setAdding] = useState(false);
  const [record, setRecord] = useState(null);
  const threadRef = useRef(null);
  const messagesRef = useRef([]);
  const busyRef = useRef(false);
  const apiKeyRef = useRef('');
  const tenderIdRef = useRef(null);
  const addingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    tenderIdRef.current = tenderId;
  }, [tenderId]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(KEY_STORAGE) || '';
    if (saved && saved !== GEMINI_KEY_PLACEHOLDER) setApiKey(saved);
    fetch('/api/desk/chat')
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) setConfigured(!!data.configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onOpen(event) {
      setOpen(true);
      const prompt = event.detail;
      if (prompt?.id === 'add') {
        setAdding(true);
        addingRef.current = true;
        if (prompt.prefill) setDraft(prompt.prefill);
        return;
      }
      if (prompt?.text) send(prompt);
    }
    window.addEventListener('desk-chat', onOpen);
    return () => window.removeEventListener('desk-chat', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open, busy]);

  function rememberKey(value) {
    setApiKey(value);
    if (value.trim()) window.sessionStorage.setItem(KEY_STORAGE, value.trim());
    else window.sessionStorage.removeItem(KEY_STORAGE);
  }

  async function send(prompt) {
    const text = String(prompt?.text || draft).trim();
    if (!text || busyRef.current) return;
    const drafting = prompt?.id === 'add' || (!prompt && addingRef.current);
    setDraft('');
    setOpen(true);
    if (!drafting) {
      setAdding(false);
      addingRef.current = false;
    }
    const next = [...messagesRef.current, { role: 'user', text }];
    messagesRef.current = next;
    setMessages(next);
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/desk/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(-8),
          tenderId: tenderIdRef.current,
          promptId: prompt?.id || null,
          action: drafting ? 'draft' : 'chat',
          apiKey: apiKeyRef.current.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = data.reply || data.error || 'No reply.';
      const withReply = [...next, { role: 'assistant', text: reply, source: data.source || 'desk' }];
      messagesRef.current = withReply;
      setMessages(withReply);
      if (typeof data.configured === 'boolean') setConfigured(data.configured);
      setRecord(data.record || null);
    } catch {
      const withReply = [...next, { role: 'assistant', text: 'The chat could not reach the desk.', source: 'desk' }];
      messagesRef.current = withReply;
      setMessages(withReply);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveRecord() {
    if (!record?.fields || record.problems?.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/desk/chat/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: record.fields, note: record.note }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.tenderId
        ? `Saved “${data.title}” on the tender desk.`
        : data.existingTenderId
          ? data.error
          : data.error || 'The tender was not saved.';
      const next = [...messagesRef.current, { role: 'assistant', text }];
      messagesRef.current = next;
      setMessages(next);
      if (data.tenderId || data.existingTenderId) {
        setRecord((current) => ({ ...current, savedId: data.tenderId || data.existingTenderId }));
      }
    } catch {
      const next = [...messagesRef.current, { role: 'assistant', text: 'The desk could not save that tender.' }];
      messagesRef.current = next;
      setMessages(next);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="tender-desk contents">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close Ask AI' : 'Ask AI'}
        className="d-ai-launcher"
      >
        {open ? <X size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
        <span>{open ? 'Close' : 'Ask AI'}</span>
      </button>
      {open ? (
        <div role="dialog" aria-label="Ask AI about tenders" className="d-ai-panel">
          <div className="d-ai-head">
            <span className="d-ai-mark" aria-hidden="true"><Sparkles size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-mat-on">Ask AI</p>
              <p className="truncate text-xs text-mat-dim">
                {tenderId ? 'About this tender and your desk' : 'About your saved tenders'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="d-iconbtn !h-8 !w-8" aria-label="Close Ask AI">
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <div ref={threadRef} className="min-h-40 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="py-2">
                <p className="text-sm text-mat-muted">
                  {tenderId
                    ? 'Ask about dates, eligibility, EMD or documents for this tender.'
                    : 'Ask about deadlines, eligibility or money across your saved tenders, or add a tender from a notice you paste.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {DESK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (prompt.id === 'add') {
                          setAdding(true);
                          addingRef.current = true;
                          setOpen(true);
                          return;
                        }
                        send(prompt);
                      }}
                      className="d-pill disabled:opacity-50"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`d-ai-bubble ${message.role === 'user' ? 'is-user' : ''}`}>
                  {message.role === 'user' ? message.text : <RichText text={message.text} />}
                </div>
              ))
            )}
            {record && !record.savedId ? (
              <div className="rounded-xl border border-[var(--md-border)] bg-[var(--md-surface2)] p-3 text-xs text-mat-muted">
                <p className="text-sm font-medium text-mat-on">{record.fields.title || 'Untitled'}</p>
                <p className="mt-0.5">{record.sourceName}</p>
                {record.problems?.length ? <p className="mt-1 text-amber-500">{record.problems.join(' ')}</p> : null}
                {!record.problems?.length ? (
                  <button type="button" disabled={busy} onClick={saveRecord} className="d-btn d-btn-primary mt-2 !h-8">
                    Add to desk
                  </button>
                ) : null}
              </div>
            ) : null}
            {record?.savedId ? (
              <a href={`/tenders/desk/tenders/${record.savedId}`} className="d-btn d-btn-outline !h-8">
                Open the tender
              </a>
            ) : null}
            {busy ? (
              <p className="d-ai-bubble inline-flex items-center gap-2" aria-live="polite">
                <span className="d-typing" aria-hidden="true"><i /><i /><i /></span>
                <span className="d-shimmer-text text-xs">{adding ? 'Drafting the tender…' : 'Reading your tenders…'}</span>
              </p>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-[var(--md-border)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={adding ? 'Title, source or state, place, bid end' : 'Ask about a tender…'}
              className="d-input min-w-0 flex-1"
              aria-label="Question"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="d-btn d-btn-primary !px-3" aria-label="Send">
              <SendHorizontal size={15} aria-hidden="true" />
            </button>
          </form>

          <details className="group border-t border-[var(--md-border)] px-4 py-2.5" open={!configured && !apiKey}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-mat-dim">
              <KeyRound size={12} aria-hidden="true" />
              {configured ? 'AI key set on the server' : apiKey ? 'Using your Gemini key in this browser' : 'Add a Gemini API key'}
              <span className="ml-auto group-open:hidden">Change</span>
            </summary>
            <input
              id="desk-gemini-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={GEMINI_KEY_PLACEHOLDER}
              onChange={(event) => rememberKey(event.target.value)}
              aria-label="Gemini API key"
              className="d-input mt-2 w-full"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-mat-dim">
              {configured
                ? 'Paste a key only to use a different one in this browser.'
                : 'Create a key in Google AI Studio, or set GEMINI_API_KEY on the server.'}{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-[var(--md-primary-hover)] underline">
                AI Studio
              </a>
            </p>
          </details>
        </div>
      ) : null}
    </div>
  );
}

/** Renders the small markdown subset the model uses (bold, bullets, paragraphs) without HTML injection. */
function RichText({ text }) {
  const blocks = String(text || '').split(/\n{2,}/);
  return blocks.map((block, b) => {
    const lines = block.split('\n').filter((line) => line.trim());
    const bullets = lines.length && lines.every((line) => /^\s*[-*•]\s+/.test(line));
    if (bullets) {
      return (
        <ul key={b} className="my-1 list-disc space-y-1 pl-4">
          {lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*•]\s+/, ''))}</li>)}
        </ul>
      );
    }
    return (
      <p key={b} className={b ? 'mt-2' : ''}>
        {lines.map((line, i) => (
          <span key={i}>{i ? <br /> : null}{inline(line.replace(/^\s*[-*•]\s+/, '• '))}</span>
        ))}
      </p>
    );
  });
}

function inline(line) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part.replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1$2'),
  );
}
