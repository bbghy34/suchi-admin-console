/**
 * Luit modules, as sold. Each module owns the routes under its prefixes, so a
 * client can take only what they bought. Related modules travel together:
 * a module whose `requires` are off is off too.
 *
 * Turning a module off hides its links. Every module is on by default, so a
 * client config that lists none gets the whole product.
 */
export const MODULES = [
  { id: 'console', name: 'Dashboard, Projects & Sites', family: 'Console', core: true, routes: ['/dashboard', '/projects', '/sites', '/profile'] },
  { id: 'field', name: 'Luit Field — Employee App', family: 'Field', requires: ['console'], routes: ['/connect-phone'] },
  { id: 'site', name: 'Luit Site — BOQ & Progress', family: 'Site', requires: ['console'], routes: ['/boqs', '/progress'] },
  { id: 'attendance', name: 'Attendance & Leave', family: 'Workforce', requires: ['staff'], routes: ['/attendance', '/leaves'] },
  { id: 'staff', name: 'Staff, Firms & Contractors', family: 'Workforce', requires: ['console'], routes: ['/employees', '/departments', '/designations', '/firms', '/contractors'] },
  { id: 'stores', name: 'Luit Stores — Warehouse & Inventory', family: 'Stores', requires: ['console'], routes: ['/warehouse'] },
  { id: 'accounts', name: 'Luit Accounts — Bills, Payments & Expense', family: 'Accounts', requires: ['console'], routes: ['/bills', '/parties', '/site-expenses'] },
  { id: 'reports', name: 'Luit Reports — Reports & Audit', family: 'Reports', requires: ['console'], routes: ['/reports'] },
  { id: 'tenders', name: 'Luit Tenders — Tender Desk', family: 'Tenders', requires: ['console'], routes: ['/tenders', '/boatbrothers'] },
  { id: 'deposits', name: 'Luit Tenders — EMD & SD Tracker', family: 'Tenders', requires: ['tenders'], routes: ['/tenders/emd', '/tenders/sd'] },
  { id: 'ai', name: 'Luit AI — Search, Capture & Retry', family: 'Tenders', requires: ['tenders'], routes: ['/tenders/desk/search'] },
];

const BY_ID = new Map(MODULES.map((module) => [module.id, module]));

/** Modules switched on for a client. `enabled` lists ids; omit it for every module. */
export function enabledModules(enabled) {
  const wanted = new Set(enabled?.length ? enabled : MODULES.map((module) => module.id));
  for (const module of MODULES) if (module.core) wanted.add(module.id);
  const on = (id, seen = new Set()) => {
    const module = BY_ID.get(id);
    if (!module || !wanted.has(id) || seen.has(id)) return false;
    seen.add(id);
    return (module.requires || []).every((need) => on(need, seen));
  };
  return new Set(MODULES.filter((module) => on(module.id)).map((module) => module.id));
}

/** The module that owns a route: the longest matching prefix wins. */
export function moduleForPath(pathname = '') {
  let best = null;
  let length = -1;
  for (const module of MODULES) {
    for (const prefix of module.routes) {
      const match = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (match && prefix.length > length) {
        best = module;
        length = prefix.length;
      }
    }
  }
  return best;
}

/** Routes nobody claims stay visible. */
export function routeEnabled(pathname, enabledIds) {
  const module = moduleForPath(pathname);
  return !module || enabledIds.has(module.id);
}
