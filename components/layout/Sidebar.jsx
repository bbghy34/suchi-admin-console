'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Search, Shield, Sparkles, X } from 'lucide-react';
import { cn, readAuthRole } from '@/lib/utils';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import BrandMark from '@/components/layout/BrandMark';
import {
  sidebarSections,
  navigationItems,
  resolvePageTitle,
  canSeeItem,
  canSeeSection,
  itemIsActive,
  sectionHasActiveItem,
  visibleItems,
  visibleWarehouseGroups,
} from '@/components/layout/navigation';
import { routeEnabled } from '@/config/modules';

export { navigationItems, resolvePageTitle };

const STORAGE_KEY = 'luit.sidebar.groups';
const DEFAULT_OPEN = ['luit-ai', 'bids', 'projects', 'accounts', 'workforce', 'companies', 'insights'];

function readStoredGroups() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids) : null;
  } catch {
    return null;
  }
}

function NavLink({ href, icon: Icon, label, active, onClick, nested = false, special = false, badge, linkRef }) {
  return (
    <a
      ref={linkRef}
      href={href}
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-lg border-l-[3px] font-medium transition-colors',
        nested ? 'py-1.5 pl-3 pr-2 text-[13px]' : 'px-2.5 py-2 text-sm',
        special && 'luit-special',
        active
          ? 'border-primary-400 bg-primary/15 text-primary-300'
          : 'border-transparent text-mat-muted hover:bg-mat-surface2 hover:text-mat-on'
      )}
    >
      {Icon ? <Icon className={cn('h-4 w-4 shrink-0', special && 'luit-ai-group luit-sparkle')} aria-hidden="true" /> : null}
      <span className={cn('truncate', special && 'luit-ai-label font-semibold')}>{label}</span>
      {badge ? <span className="luit-ai-chip ml-auto inline-flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5 luit-sparkle" aria-hidden="true" />{badge}</span> : null}
    </a>
  );
}

function GroupButton({ controlsId, label, hint, icon: Icon, open, active, accent = false, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? controlsId : undefined}
      title={hint || label}
      className={cn(
        'mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-mat-surface2',
        accent ? 'luit-ai-group' : active ? 'text-primary-300' : 'text-mat-dim'
      )}
    >
      {Icon ? <Icon className={cn('h-3.5 w-3.5 shrink-0', accent && 'luit-sparkle')} aria-hidden="true" /> : null}
      <span className={cn('min-w-0 flex-1 truncate', accent && 'luit-ai-label font-semibold tracking-wide')}>{label}</span>
      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
    </button>
  );
}

export function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { prefs } = usePreferences();
  const [hintRole, setHintRole] = useState('');
  const [query, setQuery] = useState('');
  const [searchReady, setSearchReady] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(DEFAULT_OPEN));
  const [warehouseOverride, setWarehouseOverride] = useState(null);
  const hydrated = useRef(false);
  const pathRef = useRef(pathname);
  useLayoutEffect(() => {
    setHintRole(readAuthRole());
  }, [user]);

  useLayoutEffect(() => {
    setOpenGroups((current) => {
      const base = hydrated.current ? current : (readStoredGroups() || current);
      hydrated.current = true;
      const active = sidebarSections.find(
        (section) => section.items && section.placement !== 'top' && section.placement !== 'bottom' && sectionHasActiveItem(section, pathname),
      );
      if (!active || base.has(active.id)) return base === current ? current : base;
      const next = new Set(base);
      next.add(active.id);
      return next;
    });
  }, [pathname]);

  useLayoutEffect(() => {
    if (pathRef.current !== pathname) {
      pathRef.current = pathname;
      setWarehouseOverride(null);
    }
  }, [pathname]);

  const role = user?.role || (isLoading ? hintRole : '');
  const bills = user?.canViewBills === true;
  const desk = user?.canUseTenderDesk === true;
  // Modules the Luit admin switched off are left out; before the session loads, nothing is hidden.
  const moduleIds = Array.isArray(user?.enabledModules) ? new Set(user.enabledModules) : null;
  const navPrefs = { ...prefs, moduleAllows: (href) => !moduleIds || routeEnabled(href, moduleIds) };
  const storesOn = navPrefs.moduleAllows('/warehouse');
  const roleLabel =
    role === 'AA' ? 'Accountant' : role === 'A' ? 'Admin' : role === 'M' ? 'Manager' : role === 'T' ? 'Tender' : role === 'E' ? 'Employee' : (isLoading ? 'Loading' : 'User');
  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0 && !normalizedQuery.includes('@');
  const onWarehouseRoute = pathname.startsWith('/warehouse');

  const toggleGroup = (id) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const linkProps = (href) => ({
    active: itemIsActive(pathname, href),
    onClick: onClose,
  });

  const sectionQuery = (section) => {
    if (!normalizedQuery) return '';
    return section.label.toLowerCase().includes(normalizedQuery) ? '' : normalizedQuery;
  };

  const renderItems = (items, nested = false) =>
    items.map((item) => (
      <li key={item.href}>
        <NavLink
          href={item.href}
          icon={item.icon}
          label={item.name}
          nested={nested}
          special={item.special}
          badge={item.badge}
          {...linkProps(item.href)}
        />
      </li>
    ));

  const renderSection = (section, variant) => {
    if (!canSeeSection(section, role, bills, desk)) return null;
    const controlsId = `${variant}-nav-${section.id}`;
    const scopedQuery = sectionQuery(section);

    if (section.id === 'warehouse') {
      if (!storesOn) return null;
      const groups = visibleWarehouseGroups(scopedQuery);
      if (searching && groups.length === 0) return null;
      const open = searching ? groups.length > 0 : (warehouseOverride !== null ? warehouseOverride : onWarehouseRoute);
      const Icon = section.icon;
      return (
        <li key={section.id}>
          <GroupButton
            controlsId={controlsId}
            label={section.label}
            hint={section.hint}
            icon={Icon}
            open={open}
            active={onWarehouseRoute}
            onToggle={() => setWarehouseOverride(!open)}
          />
          {open && (
            <ul id={controlsId} className="ml-4 mt-0.5 space-y-2 border-l border-[var(--md-border)] pl-1">
              {groups.map((group) => (
                <li key={group.name}>
                  {group.href ? (
                    <NavLink href={group.href} icon={group.icon} label={group.name} nested {...linkProps(group.href)} />
                  ) : (
                    <>
                      <p className="px-3 pt-1 text-[11px] font-medium text-mat-dim" title={group.hint}>
                        {group.name}
                      </p>
                      <ul className="mt-0.5">
                        {group.items.map((item) => (
                          <li key={item.href}>
                            <NavLink href={item.href} icon={item.icon} label={item.name} nested {...linkProps(item.href)} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    }

    const items = visibleItems(section, role, scopedQuery, navPrefs, bills, desk);
    if (!items.length) return null;

    const roleItems = (section.items || []).filter((item) => canSeeItem(item, role, bills, desk));
    const collapsible = roleItems.length > 1;
    if (!collapsible) {
      return (
        <li key={section.id} className="mt-3">
          <p className={cn('px-2.5 py-1.5 text-[11px] font-medium text-mat-dim', section.accent && 'luit-ai-label font-semibold tracking-wide')}>
            {section.label}
          </p>
          <ul className="space-y-0.5">{renderItems(items)}</ul>
        </li>
      );
    }

    const open = searching || openGroups.has(section.id);
    const Icon = section.icon;
    return (
      <li key={section.id}>
        <GroupButton
          controlsId={controlsId}
          label={section.label}
          hint={section.hint}
          icon={Icon}
          open={open}
          active={sectionHasActiveItem(section, pathname)}
          accent={section.accent}
          onToggle={() => toggleGroup(section.id)}
        />
        {open && (
          <ul id={controlsId} className="mt-0.5 space-y-0.5">
            {renderItems(items)}
          </ul>
        )}
      </li>
    );
  };

  const topSections = sidebarSections.filter((section) => section.placement === 'top');
  const scrollSections = sidebarSections.filter((section) => section.placement !== 'top' && section.placement !== 'bottom');
  const bottomSections = sidebarSections.filter((section) => section.placement === 'bottom');

  const sectionMatches = (section) => {
    if (!canSeeSection(section, role, bills, desk)) return false;
    const scopedQuery = sectionQuery(section);
    if (section.id === 'warehouse') return storesOn && visibleWarehouseGroups(scopedQuery).length > 0;
    return visibleItems(section, role, scopedQuery, navPrefs, bills, desk).length > 0;
  };
  const nothingMatches = searching && !sidebarSections.some(sectionMatches);

  const renderNav = (variant) => {
    const topNodes = topSections.flatMap((section) => {
      const items = visibleItems(section, role, sectionQuery(section), navPrefs, bills, desk);
      return items.length ? renderItems(items) : [];
    });
    const bottomNodes = bottomSections.flatMap((section) => {
      const items = visibleItems(section, role, sectionQuery(section), navPrefs, bills, desk);
      if (!items.length) return [];
      return [
        <div key={section.id}>
          <p className="px-2.5 pb-1 text-[11px] font-medium text-mat-dim">
            {section.label}
          </p>
          <ul className="space-y-0.5">{renderItems(items)}</ul>
        </div>,
      ];
    });

    return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--md-sidebar)]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--md-border)] px-5">
        <a href="/dashboard" className="flex min-w-0 items-center">
          <BrandMark size={36} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-lg p-1.5 text-mat-muted transition-colors hover:text-mat-on lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mat-dim" aria-hidden="true" />
          <input
            type="search"
            name="luit-module-finder"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={!searchReady}
            value={searching ? query : ''}
            onFocus={() => setSearchReady(true)}
            onChange={(event) => {
              const next = event.target.value;
              if (next.includes('@')) {
                setQuery('');
                return;
              }
              setQuery(next);
            }}
            placeholder="Search modules"
            aria-label="Search modules"
            className="w-full rounded-lg border border-[var(--md-border)] bg-mat-surface py-2 pl-8 pr-3 text-xs text-mat-on outline-none placeholder:text-mat-dim focus:border-primary-400"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav aria-label="Modules" className="px-3 py-3">
          <ul className="space-y-0.5">
            {topNodes}
            {scrollSections.map((section) => renderSection(section, variant))}
          </ul>
          {nothingMatches ? (
            <p className="px-2.5 py-6 text-center text-xs text-mat-dim">No module by that name.</p>
          ) : null}
        </nav>
      </div>

      <div className="shrink-0 space-y-3 border-t border-[var(--md-border)] p-3">
        {bottomNodes}
        <div className="flex items-center gap-3 rounded-xl bg-mat-surface2 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-300">
            <Shield className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-mat-on">
              {user?.name || (isLoading ? 'Loading session' : 'Authorized Session')}
            </p>
            <p className="truncate text-[11px] text-mat-dim">
              Role: {roleLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-64 shrink-0 overflow-hidden border-r border-[var(--md-border)] lg:flex lg:flex-col"
        aria-label="Modules"
      >
        {renderNav('desktop')}
      </aside>
      <div className="hidden lg:block lg:w-64 lg:shrink-0" aria-hidden="true" />

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/75 transition-opacity lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-dvh w-72 transform overflow-hidden shadow-mat-xl transition-transform duration-300 ease-in-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {renderNav('mobile')}
      </div>
    </>
  );
}

export default Sidebar;
