import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem, passwordStrength, PASSWORD_MAX_BYTES } from '../lib/password-policy.mjs';

test('the shared rule accepts a normal password and names each refusal', () => {
  assert.equal(passwordProblem('river-boat-2026'), null);
  assert.equal(passwordProblem(''), 'Enter a password.');
  assert.equal(passwordProblem(12345678), 'Enter a password.');
  assert.match(passwordProblem('short1'), /at least 8/);
  assert.match(passwordProblem(' padded-pass'), /space/);
  assert.match(passwordProblem('padded-pass '), /space/);
});

test('passwords past the bcrypt limit are refused, counting bytes not letters', () => {
  assert.equal(passwordProblem('a'.repeat(PASSWORD_MAX_BYTES)), null);
  assert.match(passwordProblem('a'.repeat(PASSWORD_MAX_BYTES + 1)), /at most/);
  assert.match(passwordProblem('অ'.repeat(25)), /at most/); // 3 bytes each
});

test('strength is advice that grows with variety', () => {
  assert.equal(passwordStrength('').label, '');
  assert.equal(passwordStrength('abcdefgh').score, 1);
  const strong = passwordStrength('River-Boat-2026');
  assert.equal(strong.score, strong.max);
  assert.equal(strong.label, 'Strong');
});

test('every place that sets a password uses the shared rule', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['app/api/auth/change-password/route.js', 'app/api/employees/route.js', 'app/api/employees/[id]/route.js', 'app/employees/page.js', 'app/dashboard/settings/page.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /passwordProblem\(/, file);
    assert.doesNotMatch(source, /length < 6|Min 6 characters/, file);
  }
});
