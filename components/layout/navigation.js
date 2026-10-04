import {
  LayoutDashboard,
  Users,
  Building2,
  Award,
  HardHat,
  Briefcase,
  MapPin,
  FileSpreadsheet,
  Clock,
  CalendarCheck,
  BarChart3,
  Settings,
  FileText,
  ClipboardList,
  User,
  Landmark,
  Warehouse,
  Camera,
  FolderOpen,
  Upload,
  Receipt,
  PieChart,
  Contact,
  Smartphone,
  Sparkles,
  Wallet,
  ShieldCheck,
  Boxes,
  AlertTriangle,
  ScrollText,
  PackagePlus,
  PackageMinus,
  SlidersHorizontal,
  Package,
  Tags,
  Ruler,
  Truck,
} from 'lucide-react';
import { BRAND } from '@/lib/branding';
import { CLIENT } from '@/config/client';
import { enabledModules, routeEnabled } from '@/config/modules';

/** Modules this client has; links to the others are left out of the sidebar. */
const ENABLED_MODULES = enabledModules(CLIENT.modules);
const linkEnabled = (link) => routeEnabled(link.href, ENABLED_MODULES);

/**
 * Warehouse keeps its own sub-groups, ordered the way stock flows: what is on
 * hand, what moved, the master lists behind it, then reports. Page titles use
 * these same names, and the warehouse overview builds its shortcuts from here.
 */
const allWarehouseSections = [
  { name: 'Overview', href: '/warehouse', icon: LayoutDashboard },
  {
    name: 'Stock',
    hint: 'What is on hand right now',
    items: [
      { name: 'Current Stock', href: '/warehouse/stock', icon: Boxes },
      { name: 'Low Stock', href: '/warehouse/low-stock', icon: AlertTriangle },
      { name: 'Stock Ledger', href: '/warehouse/ledger', icon: ScrollText },
    ],
  },
  {
    name: 'Movements',
    hint: 'Goods in, goods out, and corrections',
    items: [
      { name: 'Inward (GRN)', href: '/warehouse/inward', icon: PackagePlus },
      { name: 'Material Requests', href: '/warehouse/requests', icon: ClipboardList },
      { name: 'Outward (Issue)', href: '/warehouse/outward', icon: PackageMinus },
      { name: 'Stock Adjustment', href: '/warehouse/adjustments', icon: SlidersHorizontal },
    ],
  },
  {
    name: 'Masters',
    hint: 'Materials and the lists they use',
    items: [
      { name: 'Materials', href: '/warehouse/materials', icon: Package },
      { name: 'Categories', href: '/warehouse/categories', icon: Tags },
      { name: 'Units', href: '/warehouse/units', icon: Ruler },
      { name: 'Suppliers', href: '/warehouse/suppliers', icon: Truck },
    ],
  },
  {
    name: 'Reports',
    hint: 'Printable summaries and exports',
    items: [
      { name: 'Stock Report', href: '/warehouse/reports/stock', icon: BarChart3 },
      { name: 'Inward Report', href: '/warehouse/reports/inward', icon: BarChart3 },
      { name: 'Outward Report', href: '/warehouse/reports/outward', icon: BarChart3 },
      { name: 'Consumption Report', href: '/warehouse/reports/consumption', icon: BarChart3 },
      { name: 'Valuation Report', href: '/warehouse/reports/valuation', icon: BarChart3 },
    ],
  },
];

export const warehouseSections = allWarehouseSections
  .map((group) => (group.items ? { ...group, items: group.items.filter(linkEnabled) } : group))
  .filter((group) => (group.items ? group.items.length > 0 : linkEnabled(group)));

/**
 * Sidebar categories follow the way Luit is actually used:
 * home, Luit AI (the tender desk and its AI), bid money, project delivery, accounts,
 * inventory, people, company records, then reports. Account stays pinned
 * under the list.
 */
const allSidebarSections = [
  {
    id: 'overview',
    label: 'Overview',
    placement: 'top',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['A', 'M', 'E', 'AA'] },
    ],
  },
  {
    id: 'luit-ai',
    label: BRAND.ai,
    hint: 'AI tender search, official downloads, and bid tracking',
    icon: Sparkles,
    accent: true,
    items: [
      { name: 'Tender Desk', href: '/tenders/desk', icon: Sparkles, tenderDesk: true, special: true, badge: 'AI' },
      { name: 'Tenders', href: '/tenders', icon: FileText, tenderDesk: true },
      { name: 'Tender portal', href: '/tenders/portal', icon: FolderOpen, roles: ['A', 'M'] },
      { name: 'Tender upload', href: '/boatbrothers/tenders', icon: Upload, roles: ['A'] },
    ],
  },
  {
    id: 'bids',
    label: 'Bids & Deposits',
    hint: 'Daily tenders, EMD, and security deposits',
    icon: ClipboardList,
    items: [
      { name: 'Daily Tenders', href: '/tenders/daily', icon: ClipboardList, roles: ['A', 'M'] },
      { name: 'EMD Tracking', href: '/tenders/emd', icon: Wallet, roles: ['A', 'M'] },
      { name: 'SD Tracking', href: '/tenders/sd', icon: ShieldCheck, roles: ['A', 'M'] },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    hint: 'Projects, sites, BOQs, and site work',
    icon: Briefcase,
    items: [
      { name: 'Projects', href: '/projects', icon: Briefcase, roles: ['A', 'M'] },
      { name: 'Sites', href: '/sites', icon: MapPin, roles: ['A', 'M'] },
      { name: 'BOQs', href: '/boqs', icon: FileSpreadsheet, roles: ['A', 'M'] },
      { name: 'Site Progress', href: '/progress', icon: Camera, roles: ['A', 'M'] },
      { name: 'Site Expense', href: '/site-expenses', icon: Receipt, roles: ['A', 'M'] },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    hint: 'Bills and parties',
    icon: PieChart,
    items: [
      { name: 'Bills', href: '/bills', icon: PieChart, roles: ['AA', 'A'] },
      { name: 'Parties', href: '/parties', icon: Contact, roles: ['AA'] },
    ],
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    hint: 'Materials, stock, and goods movement',
    icon: Warehouse,
    roles: ['A', 'M'],
    sections: warehouseSections,
  },
  {
    id: 'workforce',
    label: 'Workforce',
    hint: 'People, attendance, and leave',
    icon: Users,
    items: [
      { name: 'Employees', href: '/employees', icon: Users, roles: ['A', 'M'] },
      { name: 'Departments', href: '/departments', icon: Building2, roles: ['A'] },
      { name: 'Designations', href: '/designations', icon: Award, roles: ['A'] },
      { name: 'Attendance', href: '/attendance', icon: Clock, roles: ['A', 'M', 'E'] },
      { name: 'Leaves', href: '/leaves', icon: CalendarCheck, roles: ['A', 'M', 'E'] },
    ],
  },
  {
    id: 'companies',
    label: 'Companies',
    hint: 'Own firms and contractors',
    icon: Landmark,
    items: [
      { name: 'Firms', href: '/firms', icon: Landmark, roles: ['A', 'M'] },
      { name: 'Contractors', href: '/contractors', icon: HardHat, roles: ['A', 'M'] },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    hint: 'Exports and summaries',
    icon: BarChart3,
    items: [
      { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['A', 'M'] },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    placement: 'bottom',
    items: [
      { name: 'Phone data', href: '/connect-phone', icon: Smartphone, roles: ['A', 'M', 'E', 'AA'] },
      { name: 'My Profile', href: '/profile', icon: User, roles: ['A', 'M', 'E', 'AA', 'T'] },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['A', 'M', 'E', 'AA', 'T'] },
    ],
  },
];

export const sidebarSections = allSidebarSections
  .map((section) => (section.items ? { ...section, items: section.items.filter(linkEnabled) } : section))
  .filter((section) => (section.sections ? warehouseSections.length > 0 : section.items.length > 0));

export const navigationItems = sidebarSections.flatMap((section) => section.items || []);

/**
 * The browser only sees public roles (A, M, E, AA, T); the Luit admin arrives
 * as A. Extra access comes from the session's `bills` and `tenderDesk` flags.
 */
export function canSeeItem(item, role, bills = false, tenderDesk = false) {
  if (item?.tenderDesk) return tenderDesk === true;
  if (item?.href === '/bills' || item?.href === '/parties') {
    if (item.href === '/bills' && role === 'A') return true;
    return role === 'AA' || bills === true;
  }
  if (!item?.roles) return true;
  return Boolean(role && item.roles.includes(role));
}

export function canSeeSection(section, role, bills = false, tenderDesk = false) {
  if (section.roles && !(role && section.roles.includes(role))) return false;
  if (section.sections) return true;
  return (section.items || []).some((item) => canSeeItem(item, role, bills, tenderDesk));
}

/** Exact match for home routes so child pages do not keep the parent highlighted. */
export function itemIsActive(pathname, href) {
  if (!pathname || !href) return false;
  if (href === '/dashboard' || href === '/warehouse' || href === '/tenders') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function sectionHasActiveItem(section, pathname) {
  if (section.sections) {
    return section.sections.some((group) => {
      if (group.href && itemIsActive(pathname, group.href)) return true;
      return group.items?.some((item) => itemIsActive(pathname, item.href));
    });
  }
  return (section.items || []).some((item) => itemIsActive(pathname, item.href));
}

function matchesQuery(name, query) {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

export function panelShows(item, prefs) {
  if (prefs?.moduleAllows && !prefs.moduleAllows(item.href)) return false;
  if (item?.href === '/tenders/portal') return prefs?.showTenderPortal === true;
  if (item?.href === '/boatbrothers/tenders') return prefs?.showTenderUpload === true;
  return true;
}

export function visibleItems(section, role, query, prefs, bills = false, tenderDesk = false) {
  return (section.items || []).filter(
    (item) => canSeeItem(item, role, bills, tenderDesk) && matchesQuery(item.name, query) && panelShows(item, prefs),
  );
}

/** Warehouse sub-groups. A heading match keeps every link under that heading. */
export function visibleWarehouseGroups(query) {
  return warehouseSections
    .map((group) => {
      if (group.href) {
        return matchesQuery(group.name, query) ? group : null;
      }
      if (!query || matchesQuery(group.name, query)) return group;
      const items = (group.items || []).filter((item) => matchesQuery(item.name, query));
      if (!items.length) return null;
      return { ...group, items };
    })
    .filter(Boolean);
}

/** Human title for the current route, used by the navbar heading. */
export function resolvePageTitle(pathname = '') {
  if (pathname.startsWith('/warehouse')) {
    for (const section of warehouseSections) {
      if (section.href && itemIsActive(pathname, section.href)) {
        return 'Warehouse';
      }
      const item = section.items?.find((entry) => itemIsActive(pathname, entry.href));
      if (item) return `Warehouse · ${item.name}`;
    }
    return 'Warehouse';
  }
  const exact = navigationItems.find((item) => item.href === pathname);
  if (exact) return exact.name;
  const prefix = navigationItems
    .filter((item) => item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (prefix) return prefix.name;
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  return BRAND.product;
}
