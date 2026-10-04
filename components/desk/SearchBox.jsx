'use client';

import { ArrowRight, Loader2, Search, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { rememberSearch } from './CommandPalette';

export function SearchBox({ initial = '', autoFocus = false, compact = false, busy = false }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const inputRef = useRef(null);

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  // "/" jumps to the main search from anywhere on the page.
  useEffect(() => {
    if (compact) return undefined;
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact]);

  const typed = useTypewriter(compact || q ? null : PLACEHOLDERS);

  function go(e) {
    e.preventDefault();
    const query = q.trim();
    rememberSearch(query);
    router.push(query ? `/tenders/desk/search?q=${encodeURIComponent(query)}` : '/tenders/desk/search');
  }

  if (compact) {
    return (
      <form onSubmit={go} className="w-full">
        <label className="sr-only" htmlFor="header-search">Search tenders</label>
        <div className="flex gap-2">
          <input
            id="header-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus={autoFocus}
            placeholder="e.g. Road construction in Assam under ₹2 crore"
            className="w-full rounded border border-ink-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-desk focus:ring-1 focus:ring-desk"
          />
          <button type="submit" className="shrink-0 rounded bg-desk px-3 py-2 text-sm font-medium text-white hover:bg-desk-dark">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />} Search
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={go} className="w-full">
      <label className="sr-only" htmlFor="search-tenders">Search tenders</label>
      <div className="d-searchbar flex items-center gap-2 p-1.5 pl-4" data-busy={busy ? 'true' : undefined}>
        <Sparkles size={18} aria-hidden="true" className="shrink-0 text-[var(--md-primary-hover)]" />
        <input
          ref={inputRef}
          id="search-tenders"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={typed ?? 'Describe the work: road construction in Assam under ₹2 crore…'}
          className="d-bare h-11 w-full min-w-0 px-1 text-[15px] text-mat-on outline-none placeholder:text-mat-dim"
        />
        {!q ? <kbd className="d-kbd hidden sm:inline-flex" title="Press / to search">/</kbd> : null}
        <button type="submit" className="d-btn d-btn-primary shrink-0 px-4" aria-label="Search">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
          <span className="hidden sm:inline">{busy ? 'Searching' : 'Search'}</span>
        </button>
      </div>
    </form>
  );
}

const PLACEHOLDERS = [
  'Road construction in Assam under ₹2 crore',
  'Water supply schemes in Meghalaya closing this week',
  'School buildings in Tripura with BOQ',
  'Bridge repair tenders by PWD',
];

/** Types example queries into the placeholder. Returns null when idle or motion is reduced. */
function useTypewriter(lines) {
  const [text, setText] = useState(null);
  const active = !!lines;
  useEffect(() => {
    if (!active) { setText(null); return undefined; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce') return undefined;
    let line = 0, pos = 0, dir = 1, wait = 0;
    const timer = setInterval(() => {
      if (wait > 0) { wait -= 1; return; }
      const full = PLACEHOLDERS[line];
      pos += dir;
      if (pos >= full.length) { dir = -1; wait = 40; }
      if (pos <= 0) { dir = 1; line = (line + 1) % PLACEHOLDERS.length; wait = 6; }
      setText(full.slice(0, Math.max(0, pos)) + (pos < full.length ? '▍' : ''));
    }, 45);
    return () => clearInterval(timer);
  }, [active]);
  return text;
}
