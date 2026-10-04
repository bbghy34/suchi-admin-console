'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, LogOut, User, ChevronDown, Shield } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { BRAND } from '@/lib/branding';
import { resolvePageTitle } from '@/components/layout/Sidebar';

const ROLE_STYLE = {
  A: { background: 'rgba(92,107,192,0.18)', color: '#7986cb', border: '1px solid rgba(92,107,192,0.3)' },
  M: { background: 'rgba(38,198,218,0.12)', color: '#26c6da', border: '1px solid rgba(38,198,218,0.25)' },
  E: { background: 'rgba(102,187,106,0.12)', color: '#66bb6a', border: '1px solid rgba(102,187,106,0.25)' },
  AA: { background: 'rgba(0,137,123,0.14)', color: '#4db6ac', border: '1px solid rgba(0,137,123,0.28)' },
};

const ROLE_NAME = { A: 'Administrator', M: 'Manager', E: 'Employee', AA: 'Accountant' };

export function Navbar({ onMenuToggle }) {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();
  const { prefs } = usePreferences();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== 'A') {
      setLowStockCount(0);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/warehouse/low-stock', { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && json.success) setLowStockCount((json.data || []).length);
      } catch {
        if (!cancelled) setLowStockCount(0);
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.role]);

  const signOut = () => {
    if (prefs.confirmSignOut && !window.confirm('Sign out of this account?')) return;
    logout();
  };

  const pageTitle = resolvePageTitle(pathname || '');
  const roleStyle = ROLE_STYLE[user?.role] || { background: 'var(--md-surface2)', color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' };
  const roleName = ROLE_NAME[user?.role] || 'Staff';
  const initial = user?.name ? user.name.trim().charAt(0).toUpperCase() : '';

  return (
    <header
      className="sticky top-0 z-[35] flex h-16 w-full shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      style={{ background: 'var(--md-surface)', borderBottom: '1px solid var(--md-border)' }}
    >
      {/* Left: menu toggle + page context */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open navigation"
          className="rounded-lg p-2 transition-colors lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c6bc0]"
          style={{ color: 'var(--md-muted)' }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--md-surface3)'; e.currentTarget.style.color = 'var(--md-on)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--md-muted)'; }}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <p className="hidden truncate text-[10px] font-semibold uppercase tracking-widest sm:block" style={{ color: 'var(--md-dim)' }}>
            {BRAND.product} · {BRAND.company}
          </p>
          <h1 className="truncate text-sm font-semibold leading-tight" style={{ color: 'var(--md-on)' }}>
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Right: alerts + account */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {prefs.showStockAlerts && user?.role === 'A' && lowStockCount > 0 && (
          <a
            href="/warehouse/low-stock"
            className="stock-alert inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-[var(--md-surface2)]"
            style={{ color: 'var(--md-muted)', border: '1px solid var(--md-border)' }}
            title="Materials at or below their minimum stock"
            aria-label={`${lowStockCount} material${lowStockCount === 1 ? '' : 's'} low on stock`}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#ffb74d' }} aria-hidden="true" />
            <span className="hidden sm:inline">Low stock</span>
            <span className="tabular-nums font-semibold" style={{ color: 'var(--md-on)' }}>{lowStockCount}</span>
          </a>
        )}

        {isLoading ? (
          <div className="h-9 w-36 animate-pulse rounded-lg" style={{ background: 'var(--md-surface3)' }} aria-hidden="true" />
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              aria-label="Account menu"
              className="flex items-center gap-2.5 rounded-xl p-1.5 pr-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c6bc0]"
              style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border-strong)' }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--md-surface3)'}
              onMouseOut={e => e.currentTarget.style.background = 'var(--md-surface2)'}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #5c6bc0, #3949ab)' }}
              >
                {initial || <User className="h-4 w-4" />}
              </div>
              <div className="hidden text-left sm:block">
                <p className="max-w-[140px] truncate text-xs font-semibold leading-none" style={{ color: 'var(--md-on)' }}>
                  {user?.name || 'Signed in'}
                </p>
                <p className="mt-0.5 max-w-[140px] truncate text-[10px] leading-tight" style={{ color: 'var(--md-dim)' }}>
                  {roleName}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--md-dim)' }} />
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-64 rounded-xl p-2"
                style={{ background: 'var(--md-surface2)', border: '1px solid var(--md-border-strong)', boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}
              >
                <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--md-surface3)' }}>
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--md-on)' }}>
                    {user?.name || 'Signed in'}
                  </p>
                  {user?.email && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--md-muted)' }}>
                      {user.email}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={roleStyle}
                    >
                      <Shield className="h-3 w-3" />
                      {roleName}
                    </span>
                    {user?.department?.name && (
                      <span className="truncate text-[11px]" style={{ color: 'var(--md-dim)' }}>
                        · {user.department.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <a
                    role="menuitem"
                    href="/profile"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    style={{ color: 'var(--md-muted)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--md-surface3)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <User className="h-4 w-4" />
                    <span>My profile</span>
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    style={{ color: '#ef5350' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(239,83,80,0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                      setDropdownOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          className="hidden h-9 w-9 items-center justify-center rounded-lg transition-colors sm:inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c6bc0]"
          style={{ color: 'var(--md-muted)', border: '1px solid var(--md-border-strong)' }}
          onMouseOver={e => { e.currentTarget.style.color = '#ef5350'; e.currentTarget.style.borderColor = 'rgba(239,83,80,0.4)'; e.currentTarget.style.background = 'rgba(239,83,80,0.08)'; }}
          onMouseOut={e => { e.currentTarget.style.color = 'var(--md-muted)'; e.currentTarget.style.borderColor = 'var(--md-border-strong)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export default Navbar;
