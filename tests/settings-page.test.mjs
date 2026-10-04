import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';
import * as passwordPolicy from '../lib/password-policy.mjs';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../app/dashboard/settings/page.js', import.meta.url), 'utf8');
const { code } = babel.transformSync(source, { filename: 'page.jsx', presets: [['next/babel', { 'preset-env': { modules: 'commonjs' } }]] });
function load(auth) {
  const element = ({ children }) => React.createElement('div', {}, children);
  const dependencies = {
    react: { ...React, useState: value => [value, () => {}] },
    'next/link': ({children, ...props}) => React.createElement('a', props, children),
    '@/components/providers/AuthProvider': { useAuth: () => auth },
    '@/components/providers/PreferencesProvider': { usePreferences: () => ({ prefs: {}, setPref() {}, resetPrefs() {} }) },
    '@/components/providers/ToastProvider': { useToast: () => ({}) },
    '@/components/layout/ModuleHeader': element,
    '@/components/ui/LoadingState': ({message}) => React.createElement('p', {}, message),
    '@/components/ui/Card': Object.fromEntries(['Card','CardHeader','CardTitle','CardDescription','CardContent','CardFooter'].map(key => [key, element])),
    '@/components/ui/Button': ({children}) => React.createElement('button', {}, children),
    '@/components/guide/WorkflowGuide': () => null,
    '@/components/ui/PasswordField': ({ id, label, autoComplete = 'new-password' }) => React.createElement('label', {}, label, React.createElement('input', { id, autoComplete })),
    '@/lib/password-policy.mjs': passwordPolicy,
  };
  const module = { exports: {} };
  Function('require','module','exports',code)(name => dependencies[name] ?? require(name), module, module.exports);
  return module.exports.default;
}
test('settings does not show unknown user or password controls during authentication', () => {
  const html = renderToStaticMarkup(React.createElement(load({ isLoading: true })));
  assert.match(html, /Loading settings/); assert.doesNotMatch(html, /Unknown User|Current password/);
});
test('settings gives expired sessions a sign-in destination', () => {
  const html = renderToStaticMarkup(React.createElement(load({ user: null })));
  assert.match(html, /href="\/login"/); assert.doesNotMatch(html, /Current password/);
});
test('settings exposes the correct password autofill and full reset scope', () => {
  const html = renderToStaticMarkup(React.createElement(load({ user: { name:'Test', role:'A', employeeCode:'EMP-01' } })));
  assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /Reset all preferences/); assert.match(html, /EMP-01/);
  assert.match(html, /href="\/profile"/); assert.doesNotMatch(html, /tabindex="-1"/i);
});
test('sign-out delegates once to the shared logout handler', async () => {
  let calls = 0;
  const tree = load({ user: { name:'Test', role:'A' }, logout: async () => { calls++; } })();
  function find(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.loadingLabel === 'Signing out…') return node;
    for (const child of React.Children.toArray(node.props?.children)) { const hit = find(child); if (hit) return hit; }
    return null;
  }
  await find(tree).props.onClick();
  assert.equal(calls, 1);
});
