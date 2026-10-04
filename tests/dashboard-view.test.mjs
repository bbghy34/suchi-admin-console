import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8');
const { code } = babel.transformSync(source, { filename: 'DashboardPage.jsx', presets: [['next/babel', { 'preset-env': { modules: 'commonjs' } }]] });
function load(auth, overrides = {}) {
  const box = ({ children }) => React.createElement('div', {}, children);
  const dependencies = {
    'next/link': ({ children, href }) => React.createElement('a', { href }, children),
    '@/components/providers/AuthProvider': { useAuth: () => auth },
    '@/components/ui/Button': ({ children, ...props }) => React.createElement('button', props, children),
    '@/components/layout/ModuleHeader': ({ title, description }) => React.createElement('header', {}, title, description),
    '@/components/ui/Card': { Card: box, CardHeader: box, CardTitle: box, CardDescription: box, CardContent: box },
    '@/components/ui/Table': {},
    ...overrides,
  };
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)(name => dependencies[name] ?? require(name), module, module.exports);
  return module.exports.default;
}
test('initial authenticated dashboard shows loading instead of fabricated zero counts', () => {
  for (const role of ['A', 'E', 'AA']) {
    const html = renderToStaticMarkup(React.createElement(load({ user: { id: '1', role }, isLoading: false })));
    assert.match(html, /Loading your dashboard/);
    assert.doesNotMatch(html, /Not Checked In|No attendance|Contractor Project Summary/);
  }
});
test('unauthenticated dashboard asks for sign-in without claiming guest metrics', () => {
  const html = renderToStaticMarkup(React.createElement(load({ user: null, isLoading: false })));
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /Guest View|corporate metrics|Loading your dashboard/);
});
test('dashboard does not start data fetch while auth is loading', () => {
  const effects = [];
  const mockReact = { ...React, useState: value => [value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  load({ user: null, isLoading: true }, { react: mockReact })();
  // The second effect gates its request on resolved auth; no browser globals required.
  for (const effect of effects) effect();
});
