'use client';

import { useEffect, useRef, useState } from 'react';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TenderIdSuggest({ value, onChange, className, placeholder = 'Search a won tender ID' }) {
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState(null);

  const placeMenu = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const move = () => placeMenu();
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => {
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ view: 'saved', result: 'win', limit: '20' });
        const query = value.trim();
        if (query) params.set('search', query);
        const res = await fetch(`/api/daily-tenders?${params}`, { headers: authHeaders() });
        const json = await res.json();
        if (cancelled) return;
        const seen = new Set();
        const rows = [];
        for (const row of json.success ? json.data || [] : []) {
          const tenderId = String(row.tenderId || '').trim();
          const key = tenderId.toLowerCase();
          if (!tenderId || seen.has(key)) continue;
          seen.add(key);
          rows.push({ tenderId, title: row.titleAndRefNo || '' });
        }
        setOptions(rows);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, value]);

  useEffect(() => {
    const close = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={boxRef}>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        className={className}
      />
      {open && menu ? (
        <ul
          className="fixed z-[80] max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ top: menu.top, left: menu.left, width: menu.width }}
        >
          {loading ? <li className="px-3 py-2 text-xs text-slate-500">Searching won tenders…</li> : null}
          {!loading && options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">No won tender matches.</li>
          ) : null}
          {options.map((row) => (
            <li key={row.tenderId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-sky-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(row.tenderId);
                  setOpen(false);
                }}
              >
                <span className="block font-mono text-sm text-slate-900">{row.tenderId}</span>
                {row.title ? <span className="block truncate text-xs text-slate-500">{row.title}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
