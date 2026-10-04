import test from 'node:test';
import assert from 'node:assert/strict';
import { endLuitAdminSession, sameSession, startLuitAdminSession, storedLuitAdminSession } from '../lib/luit-admin/single-session.js';

function memoryDb() {
  const rows = new Map();
  return { setting: {
    upsert: async ({ where, create, update }) => rows.set(where.key, rows.has(where.key) ? update.value : create.value),
    findUnique: async ({ where }) => (rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null),
    deleteMany: async ({ where }) => { if (rows.get(where.key) === where.value) rows.delete(where.key); },
  } };
}

test('the newest Luit admin sign-in is the only live session', async () => {
  const db = memoryDb();
  const first = await startLuitAdminSession(db, 'luit');
  assert.ok(sameSession(first, await storedLuitAdminSession(db, 'luit')));
  const second = await startLuitAdminSession(db, 'luit');
  const stored = await storedLuitAdminSession(db, 'luit');
  assert.ok(!sameSession(first, stored), 'the earlier session is refused');
  assert.ok(sameSession(second, stored));
});

test('missing or old tokens are refused, and a stale sign-out cannot end the live session', async () => {
  const db = memoryDb();
  const old = await startLuitAdminSession(db, 'luit');
  const live = await startLuitAdminSession(db, 'luit');
  assert.equal(sameSession(undefined, live), false);
  assert.equal(sameSession(live, null), false);
  await endLuitAdminSession(db, 'luit', old);
  assert.ok(sameSession(live, await storedLuitAdminSession(db, 'luit')));
  await endLuitAdminSession(db, 'luit', live);
  assert.equal(await storedLuitAdminSession(db, 'luit'), null);
});
