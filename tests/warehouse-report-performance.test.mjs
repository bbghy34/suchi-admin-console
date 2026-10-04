import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/api/warehouse/reports/route.js', import.meta.url), 'utf8');
function route(prisma, materials = []) {
  let roles;
  const context = vm.createContext({
    URL, prisma,
    requireRoles: (allowed) => { roles = allowed; return handler => handler; },
    hideLuitAdminResponse: async (_db, response, ...args) => response(...args),
    baseSuccessResponse: data => data,
    errorResponse: (error, status) => ({ error, status }),
    handleApiError: error => { throw error; },
    loadMaterials: async () => materials,
    shapeStockRow: row => ({ id: row.id, quantity: row.quantity }),
  });
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace('export const GET', 'globalThis.GET'), context);
  assert.deepEqual(Array.from(roles), ['A', 'M']);
  return type => context.GET({ url: `http://localhost/api/warehouse/reports?type=${type}` });
}

test('consumption returns database totals without loading issue rows', async () => {
  const expected = [{ id: 'm1', material: 'C — Cement', unit: 'kg', quantity: 27.5 }];
  const get = route({ $queryRaw: async sql => {
    assert.match(sql.join(''), /WHERE o\."isActive" = true/);
    assert.match(sql.join(''), /SUM\(o.quantity\)/);
    assert.match(sql.join(''), /GROUP BY m.id/);
    return expected;
  } });
  assert.deepEqual(await get('consumption'), expected);
});

test('valuation preserves weighted average and includes materials with no receipts', async () => {
  const get = route({ $queryRaw: async sql => {
    assert.match(sql.join(''), /SUM\(quantity \* rate\)/);
    assert.match(sql.join(''), /WHERE "isActive" = true/);
    return [{ materialId: 'm1', qty: 30, value: 500 }, { materialId: 'm3', qty: 0, value: 0 }];
  } }, [{ id: 'm1', quantity: 6 }, { id: 'm2', quantity: 4 }, { id: 'm3', quantity: 0 }]);
  const rows = JSON.parse(JSON.stringify(await get('valuation')));
  assert.deepEqual(rows, [
    { id: 'm1', quantity: 6, averageRate: 500 / 30, value: 100 },
    { id: 'm2', quantity: 4, averageRate: 0, value: 0 },
    { id: 'm3', quantity: 0, averageRate: 0, value: 0 },
  ]);
});

test('inward report selects its public fields and preserves amount calculation', async () => {
  const get = route({ materialInward: { findMany: async args => {
    assert.equal(args.select.quantity, true);
    assert.equal(args.select.rate, true);
    assert.equal(args.select.remarks, undefined);
    assert.equal(args.where.isActive, true);
    return [{ id: 'i1', grnNumber: 'G1', quantity: 2.5, rate: 12, supplier: { name: 'Supplier' }, material: { code: 'C', name: 'Cement', unit: { symbol: 'kg' } } }];
  } } });
  const [row] = await get('inward');
  assert.equal(row.amount, 30);
  assert.equal(row.material, 'C — Cement');
});

test('outward report selects its public fields and preserves optional labels', async () => {
  const get = route({ materialOutward: { findMany: async args => {
    assert.equal(args.select.purpose, true);
    assert.equal(args.select.createdBy, undefined);
    return [{ id: 'o1', issueNumber: 'I1', quantity: 3, material: { code: 'C', name: 'Cement' } }];
  } } });
  const [row] = await get('outward');
  assert.equal(row.quantity, 3);
  assert.equal(row.project, '');
  assert.equal(row.unit, '');
});

test('dashboard requests site counts and preserves recent-project response', async () => {
  const dashboard = readFileSync(new URL('../app/api/dashboard/route.js', import.meta.url), 'utf8');
  const count = async () => 0;
  const list = async () => [];
  const context = vm.createContext({
    LUIT_ADMIN_ROLE: 'SX', TENDER_ROLE: 'T',
    prisma: {
      $queryRaw: async () => [{ totalEmployees: 0, totalContractors: 0, totalSites: 0, todayAttendance: 0, pendingLeaves: 0 }],
      employee: { count }, contractor: { count, findMany: list }, site: { count },
      attendance: { count, findMany: list }, leave: { count, findMany: list },
      project: { findMany: async args => {
        assert.equal(args.select._count.select.sites, true);
        assert.equal(args.select.sites, undefined);
        return [{ id: 'p1', name: 'Road', status: 'ACTIVE', progress: 50, budget: 100, _count: { sites: 120 } }];
      } },
    },
    requireAuth: handler => handler,
    hideLuitAdminResponse: async (_db, response, ...args) => response(...args),
    baseSuccessResponse: data => data,
    handleApiError: error => { throw error; },
  });
  vm.runInContext(dashboard.replace(/^import .*;\n/gm, '').replace('export const GET', 'globalThis.GET'), context);
  const data = await context.GET({}, { user: { id: 'admin', role: 'A' } });
  assert.equal(data.recentProjects[0].siteCount, 120);
  assert.equal(data.kpis.totalProjects, 1);
  assert.equal(data.projectProgress.averageProgress, 50);
});

test('report filter reads start together and preserve options and attendance scoping', async () => {
  const reports = readFileSync(new URL('../app/api/reports/route.js', import.meta.url), 'utf8');
  const pending = [];
  const optionRows = [{ id: 'd' }, { id: 'c' }, { id: 's' }, { id: 'e', employeeCode: 'EMP1' }];
  const delegates = ['department', 'contractor', 'site', 'employee'];
  const prisma = Object.fromEntries(delegates.map((name, i) => [name, { findMany: () => new Promise(resolve => pending.push(() => resolve([optionRows[i]]))) }]));
  prisma.attendance = { findMany: async args => {
    assert.equal(args.where.isActive, true);
    assert.equal(args.where.employeeId, 'employee1');
    return [];
  } };
  const context = vm.createContext({
    URL, prisma,
    requireRoles: allowed => { assert.deepEqual(Array.from(allowed), ['A', 'M']); return handler => handler; },
    workforceRecordWhere: () => ({}), workforceEmployeeWhere: () => ({}),
    hideLuitAdminResponse: async (_db, response, ...args) => response(...args),
    baseSuccessResponse: data => data,
    handleApiError: error => { throw error; },
  });
  vm.runInContext(reports.replace(/^import .*;\n/gm, '').replace('export const GET', 'globalThis.GET'), context);
  const result = context.GET({ url: 'http://localhost/api/reports?reportType=attendance&employeeId=employee1' });
  assert.equal(pending.length, 4, 'all options must start before any one completes');
  for (const finish of pending.reverse()) finish();
  const data = await result;
  assert.deepEqual(JSON.parse(JSON.stringify(data.filters)), {
    departments: [optionRows[0]], contractors: [optionRows[1]], sites: [optionRows[2]], employees: [optionRows[3]],
  });
  assert.equal(data.summary.attendance.totalRecords, 0);
});
