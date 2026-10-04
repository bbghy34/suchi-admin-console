import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../app/tenders/desk/inbox/InboxView.jsx', import.meta.url), 'utf8');
const { code } = babel.transformSync(source, { filename: 'InboxView.jsx', presets: [['next/babel', { 'preset-env': { modules: 'commonjs' } }]] });
const ui = {
  Button: ({ children, variant, ...props }) => React.createElement('button', props, children),
  PageTitle: ({ children, description, aside }) => React.createElement('header', {}, children, description, aside),
  Empty: ({ children }) => React.createElement('p', {}, children),
  ErrorBox: ({ children }) => React.createElement('p', {}, children),
};
function load(overrides = {}) {
  const dependencies = {
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/components/desk/api': { api: async () => ({}) },
    '@/components/desk/ui': ui,
    '@/lib/desk/format': { formatIST: value => value, istDateKey: value => value.slice(0, 10) },
    ...overrides,
  };
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)(name => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const component = load();
test('notifications explains purpose and retains the tender/download destinations', () => {
  const html = renderToStaticMarkup(React.createElement(component.InboxView, {
    todayKey: '2026-10-01', items: [
      { id: '1', kind: 'OFFICIAL_RETRIEVAL', title: 'Files ready', scheduledFor: '2026-10-01', tenderId: 't1' },
      { id: '2', kind: 'OFFICIAL_RETRIEVAL', title: 'Choose notice', scheduledFor: '2026-09-30' },
    ],
  }));
  assert.match(html, /Notifications/);
  assert.match(html, /tender deadlines and security money reminders/);
  assert.match(html, /\/tenders\/desk\/tenders\/t1/);
  assert.match(html, /\/tenders\/desk\/jobs/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Mark all read/);
});
test('filters distinguish unread downloads and supported reminders', () => {
  const match = component.matchesNotificationFilter;
  assert.equal(match({ kind: 'OFFICIAL_RETRIEVAL' }, 'downloads'), true);
  assert.equal(match({ kind: 'TENDER_UPLOADED' }, 'downloads'), false);
  assert.equal(match({ kind: 'EMD_REFUND' }, 'reminders'), true);
  assert.equal(match({ kind: 'BID_END' }, 'reminders'), true);
  assert.equal(match({ kind: 'SD_APPLY' }, 'reminders'), true);
  assert.equal(match({ kind: 'BG_EXPIRY' }, 'reminders'), true);
  assert.equal(match({ readAt: 'now' }, 'unread'), false);
  assert.equal(match({}, 'unread'), true);
});
test('failed mark-all leaves notifications intact and clears busy with a visible error', async () => {
  const values = []; let cursor = 0;
  const mockReact = { ...React,
    useState: value => { const index = cursor++; values[index] = value; return [value, next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; },
    useEffect() {}, useMemo: callback => callback(),
  };
  const mock = load({ react: mockReact, '@/components/desk/api': { api: async () => { throw new Error('Connection lost'); } } });
  const items = [{ id: '1', scheduledFor: '2026-10-01' }];
  const tree = mock.InboxView({ items, todayKey: '2026-10-01' });
  const header = tree.props.children[0];
  const button = header.props.aside.props.children[0];
  await button.props.onClick();
  assert.equal(values[1], false);
  assert.equal(values[2], 'Connection lost');
  assert.equal(values[0], items);
});
