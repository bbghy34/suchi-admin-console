import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import babel from 'next/dist/compiled/babel/core.js';
import * as modules from '../config/modules.js';
const require = createRequire(import.meta.url);

function compile(path, deps) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { code } = babel.transformSync(source, { filename: path, presets: [['next/babel', { 'preset-env': { modules: 'commonjs' } }]] });
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)((name) => (name in deps ? deps[name] : require(name)), module, module.exports);
  return module.exports;
}

function load(client = { modules: [] }, stored = null) {
  const writes = [];
  const prisma = { setting: {
    findUnique: async () => (stored ? { value: JSON.stringify(stored) } : null),
    upsert: async (args) => { writes.push(args); stored = JSON.parse(args.create.value); return args; },
  } };
  const cache = new Map();
  const ws = compile('../lib/luit-admin/workspace.js', {
    '@/lib/prisma': { prisma },
    '@/lib/read-cache': { readCache: async (key, ttl, fn) => (cache.has(key) ? cache.get(key) : (cache.set(key, await fn()), cache.get(key))), invalidateReadCache: (key) => cache.delete(key) },
    '@/config/client': { CLIENT: client },
    '@/config/modules': modules,
  });
  return { ws, writes };
}

test('a fresh workspace shows every purchased module to everyone', async () => {
  const { ws } = load();
  const workspace = await ws.readWorkspace();
  assert.equal(ws.modulesFor(workspace).length, modules.MODULES.length);
});

test('preview modules are only for the Luit admin, off modules for nobody, and dependents follow', async () => {
  const { ws } = load({ modules: [] }, { modules: { stores: 'preview', tenders: 'off' } });
  const workspace = await ws.readWorkspace();
  const staff = new Set(ws.modulesFor(workspace));
  const admin = new Set(ws.modulesFor(workspace, { luitAdmin: true }));
  assert.ok(!staff.has('stores') && admin.has('stores'));
  for (const id of ['tenders', 'ai', 'deposits']) assert.ok(!staff.has(id) && !admin.has(id), id);
});

test('the client plan is the ceiling, the console cannot be switched off, and changes are logged', async () => {
  const { ws, writes } = load({ modules: ['site'] });
  assert.ok(!ws.modulesFor(await ws.readWorkspace(), { luitAdmin: true }).includes('stores'));
  await assert.rejects(() => ws.updateWorkspace({ modules: { console: 'off' } }, { name: 'Boat Brothers' }));
  await assert.rejects(() => ws.updateWorkspace({ modules: { site: 'maybe' } }, { name: 'Boat Brothers' }));
  const next = await ws.updateWorkspace({ modules: { site: 'preview' }, notice: { text: 'Update tonight', active: true } }, { name: 'Boat Brothers' });
  assert.equal(writes.length, 1);
  assert.equal(next.notice.active, true);
  assert.match(next.log[0].change, /BOQ & Progress: preview/);
  assert.equal(next.log[0].by, 'Boat Brothers');
});
