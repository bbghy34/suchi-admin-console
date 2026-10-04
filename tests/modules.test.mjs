import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, enabledModules, moduleForPath, routeEnabled } from '../config/modules.js';

test('no module list means the whole product', () => {
  assert.equal(enabledModules([]).size, MODULES.length);
  assert.equal(enabledModules(undefined).size, MODULES.length);
});

test('related modules stay together and the console is always on', () => {
  const on = enabledModules(['ai', 'deposits', 'stores']);
  assert.ok(on.has('console') && on.has('stores'));
  // Luit AI and the EMD/SD tracker need Tender Desk.
  assert.ok(!on.has('ai') && !on.has('deposits') && !on.has('tenders'));
  assert.ok(enabledModules(['tenders', 'ai']).has('ai'));
  assert.ok(!enabledModules(['attendance']).has('attendance'), 'attendance needs staff');
});

test('the longest route prefix owns a page', () => {
  assert.equal(moduleForPath('/tenders/emd').id, 'deposits');
  assert.equal(moduleForPath('/tenders/desk/search').id, 'ai');
  assert.equal(moduleForPath('/tenders/desk/money').id, 'tenders');
  assert.equal(moduleForPath('/warehouse/reports/stock').id, 'stores');
  assert.equal(moduleForPath('/site-expenses').id, 'accounts');
  assert.equal(moduleForPath('/unknown'), null);
  assert.ok(routeEnabled('/unknown', new Set()));
  assert.ok(!routeEnabled('/warehouse', enabledModules(['site'])));
});
