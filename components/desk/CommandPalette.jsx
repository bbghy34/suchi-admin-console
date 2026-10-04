'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Briefcase, CalendarCheck, CornerDownLeft, Globe2, History, Bell, Download, IndianRupee, LayoutDashboard,
  Moon, Search, Sparkles, Sun, Upload, Users,
} from 'lucide-react';
import { setDeskTheme } from '@/lib/desk/desk-theme';

const RECENT_KEY = 'desk-recent-searches';

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('desk-cmdk'));
}

/** Remembers a submitted search for the palette's "Recent" group (this browser only). */
export function rememberSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]').filter((item) => item.toLowerCase() !== q.toLowerCase());
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...list].slice(0, 6)));
  } catch { /* storage may be blocked */ }
}

function readRecent() {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function CommandPalette({ isAdmin, canFetch }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('desk-cmdk', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('desk-cmdk', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setActive(0);
    setRecent(readRecent());
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const groups = useMemo(() => {
    const query = q.trim();
    const match = (text) => !query || text.toLowerCase().includes(query.toLowerCase());
    const search = (text) => () => {
      rememberSearch(text);
      router.push(`/tenders/desk/search?q=${encodeURIComponent(text)}`);
    };
    const out = [];
    if (query) {
      out.push({
        title: 'Search',
        items: [
          { id: 'search', icon: Sparkles, label: `Search tenders for “${query}”`, hint: 'AI search · desk and public notices', run: search(query), accent: true },
        ],
      });
    }
    const recentItems = recent.filter(match).map((text) => ({ id: `r-${text}`, icon: History, label: text, hint: 'Recent search', run: search(text) }));
    if (recentItems.length) out.push({ title: 'Recent', items: recentItems });
    const nav = [
      ['/tenders/desk', 'Dashboard', LayoutDashboard],
      ['/tenders/desk/my-tenders', 'My tenders', Briefcase],
      canFetch ? ['/tenders/desk/fetch', 'Portal review', CalendarCheck] : null,
      ['/tenders/desk/jobs', 'Downloads', Download],
      ['/tenders/desk/inbox', 'Notifications', Bell],
      ['/tenders/desk/money', 'Money', IndianRupee],
      isAdmin ? ['/tenders/desk/people', 'People', Users] : null,
      ['/tenders/desk/tenders/new', 'Upload a tender', Upload],
    ].filter(Boolean).filter(([, label]) => match(label))
      .map(([href, label, icon]) => ({ id: href, icon, label, hint: 'Go to', run: () => router.push(href) }));
    if (nav.length) out.push({ title: 'Go to', items: nav });
    const actions = [
      { id: 'dark', icon: Moon, label: 'Dark theme', hint: 'Theme', run: () => setDeskTheme('dark') },
      { id: 'light', icon: Sun, label: 'Light theme', hint: 'Theme', run: () => setDeskTheme('light') },
      { id: 'web', icon: Globe2, label: 'Browse all open tenders', hint: 'Search', run: () => router.push('/tenders/desk/search') },
    ].filter((item) => match(item.label));
    if (actions.length) out.push({ title: 'Actions', items: actions });
    return out;
  }, [q, recent, router, isAdmin, canFetch]);

  const flat = groups.flatMap((g) => g.items);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  function run(item) {
    setOpen(false);
    item?.run();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[active]); }
  }

  let index = -1;
  return (
    <div className="d-cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="d-cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-[var(--md-border)] px-4">
          <Search size={17} aria-hidden="true" className="shrink-0 text-mat-dim" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tenders, jump to a page, or ask AI…"
            className="d-bare h-14 w-full text-[15px] text-mat-on outline-none placeholder:text-mat-dim"
            role="combobox"
            aria-expanded="true"
            aria-controls="desk-cmdk-list"
            aria-activedescendant={flat[active] ? `cmdk-${active}` : undefined}
          />
          <kbd className="d-kbd">Esc</kbd>
        </div>
        <div ref={listRef} id="desk-cmdk-list" role="listbox" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {groups.length ? groups.map((group) => (
            <div key={group.title} className="mb-1">
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-mat-dim">{group.title}</p>
              {group.items.map((item) => {
                index += 1;
                const i = index;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    id={`cmdk-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(item)}
                    className="d-cmdk-item"
                  >
                    <span className={`d-cmdk-icon ${item.accent ? 'd-badge-accent' : ''}`}><Icon size={15} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    <span className="hidden text-[11px] text-mat-dim sm:inline">{item.hint}</span>
                    {i === active ? <CornerDownLeft size={13} aria-hidden="true" className="text-mat-dim" /> : <ArrowRight size={13} aria-hidden="true" className="opacity-0" />}
                  </button>
                );
              })}
            </div>
          )) : <p className="px-3 py-10 text-center text-sm text-mat-dim">Nothing matches.</p>}
        </div>
        <div className="flex items-center gap-4 border-t border-[var(--md-border)] px-4 py-2.5 text-[11px] text-mat-dim">
          <span className="inline-flex items-center gap-1.5"><kbd className="d-kbd">↑</kbd><kbd className="d-kbd">↓</kbd> Move</span>
          <span className="inline-flex items-center gap-1.5"><kbd className="d-kbd">↵</kbd> Open</span>
          <span className="ml-auto inline-flex items-center gap-1.5"><Sparkles size={12} aria-hidden="true" /> AI tender search</span>
        </div>
      </div>
    </div>
  );
}
