import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedLookup, forgetLuitAdminLookups, LOOKUP_TTL_MS, luitAdminEmployeeIds } from '../lib/luit-admin/account.mjs';

test('the Luit admin lookup reaches the database once per 30 seconds per client', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls += 1; return [{ id: 'luit' }]; } };
  const [a, b] = await Promise.all([luitAdminEmployeeIds(db), luitAdminEmployeeIds(db)]);
  assert.equal(calls, 1);
  assert.ok(a.has('luit') && b.has('luit'));
  forgetLuitAdminLookups(db);
  await luitAdminEmployeeIds(db);
  assert.equal(calls, 2);
});

test('an expired or failed lookup is fetched again', async () => {
  const db = {};
  let n = 0;
  await cachedLookup(db, 'k', async () => ++n, 0);
  assert.equal(await cachedLookup(db, 'k', async () => ++n, LOOKUP_TTL_MS - 1), 1);
  assert.equal(await cachedLookup(db, 'k', async () => ++n, LOOKUP_TTL_MS + 1), 2);
  await assert.rejects(() => cachedLookup(db, 'bad', async () => { throw new Error('down'); }, 0));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await cachedLookup(db, 'bad', async () => 'ok', 1), 'ok');
});
