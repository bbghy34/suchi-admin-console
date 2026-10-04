'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Briefcase, CalendarCheck, ChevronDown, Download, IndianRupee, LayoutDashboard, Moon, ScrollText, Search, Sparkles, Sun, Users } from 'lucide-react';
import { DESK_THEMES, deskTheme, setDeskTheme } from '@/lib/desk/desk-theme';
import { openCommandPalette } from './CommandPalette';

const LINKS = [
  ['/tenders/desk', 'Dashboard', LayoutDashboard],
  ['/tenders/desk/my-tenders', 'My tenders', Briefcase],
  ['/tenders/desk/jobs', 'Downloads', Download],
  ['/tenders/desk/fetch', 'Portal review', CalendarCheck],
  ['/tenders/desk/inbox', 'Notifications', Bell],
  ['/tenders/desk/money', 'Money', IndianRupee],
  ['/tenders/desk/people', 'People', Users],
];

const THEME_ICON = { dark: Moon, light: Sun, paper: ScrollText };

export function DeskNav({ person, unread }) {
  const path = usePathname();
  const [theme, setTheme] = useState('dark');
  const [mac, setMac] = useState(true);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const apply = () => setTheme(deskTheme());
    apply();
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    window.addEventListener('desk-theme', apply);
    return () => window.removeEventListener('desk-theme', apply);
  }, []);

  const links = LINKS.filter(([href]) => {
    if (href.endsWith('/people') && !person.isAdmin) return false;
    if (href.endsWith('/fetch') && !person.isAdmin && !person.isExecutive && !person.isAccounts) return false;
    return true;
  });
  const activeHref = links.find(([href]) => (href === '/tenders/desk' ? path === href || path.startsWith('/tenders/desk/search') : path === href || path.startsWith(`${href}/`)))?.[0];

  const primaryLinks = links.filter(([href]) => ['/tenders/desk', '/tenders/desk/my-tenders', '/tenders/desk/money'].includes(href));
  const moreLinks = links.filter(link => !primaryLinks.includes(link));
  const moreActive = moreLinks.some(([href]) => href === activeHref);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setMenuOpen(false); menuRef.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  return (
    <header className="d-topbar mb-5">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 sm:px-3 lg:flex-nowrap">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="d-brandmark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="m9 15 2 2 4-4" /></svg>
          </span>
          <span className="luit-ai-chip inline-flex items-center gap-1" title="Tender Desk runs on Luit AI"><Sparkles className="h-2.5 w-2.5 luit-sparkle" aria-hidden="true" />LUIT AI</span>
          <div className="min-w-0 leading-tight 2xl:block hidden">
            <p className="text-[13px] font-semibold tracking-tight text-mat-on">Tender Desk</p>
            <p className="truncate text-[11px] text-mat-dim">{person.name}</p>
          </div>
        </div>

        <nav className="d-navtrack order-last flex-wrap w-full lg:order-none lg:mx-auto lg:w-auto" aria-label="Tender Desk">
          {primaryLinks.map(([href, label, Icon]) => {
            const active = href === activeHref;
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined} className="d-navlink" style={active ? { background: 'var(--md-surface)', boxShadow: 'inset 0 0 0 1px var(--md-border-strong)' } : undefined}>
                <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {href.endsWith('/inbox') && unread ? <span className="d-navcount">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>
            );
          })}
          <div ref={menuRef} className="relative">
            <button type="button" className="d-navlink" aria-expanded={menuOpen} aria-controls="desk-more-links" onClick={() => setMenuOpen(open => !open)} style={moreActive ? { background: 'var(--md-surface)', boxShadow: 'inset 0 0 0 1px var(--md-border-strong)' } : undefined}>
              <span>More</span>{unread ? <span className="d-navdot" role="img" aria-label={`${unread} unread notifications`} /> : null}<ChevronDown size={14} aria-hidden="true" />
            </button>
            {menuOpen ? <div id="desk-more-links" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl p-2 shadow-xl" style={{background:'var(--md-surface)',border:'1px solid var(--md-border-strong)'}}>
              {moreLinks.map(([href,label,Icon]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={href === activeHref ? 'page' : undefined} className="d-navlink w-full justify-start">
                <Icon size={15} aria-hidden="true" /><span>{label}</span>{href.endsWith('/inbox') && unread ? <span className="d-navcount ml-auto">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>)}
            </div> : null}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button type="button" onClick={() => openCommandPalette()} className="d-cmdk-trigger" aria-label="Open command palette">
            <Search size={14} aria-hidden="true" />
            <span className="hidden 2xl:inline">Search or jump…</span>
            <kbd className="d-kbd hidden sm:inline-flex">{mac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="d-segment" role="group" aria-label="Tender Desk theme">
            {DESK_THEMES.map((item) => {
              const Icon = THEME_ICON[item.id] || Sun;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={theme === item.id}
                  title={item.label}
                  aria-label={`${item.label} theme`}
                  onClick={() => setTheme(setDeskTheme(item.id))}
                >
                  <Icon size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
