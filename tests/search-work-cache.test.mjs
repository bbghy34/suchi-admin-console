import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSearchWorkCache, uniqueCitedHits, isGroundingRedirect } from '../lib/desk/ai/search-work-cache.mjs';

test('concurrent work is shared and successes expire', async () => {
  let now = 0, calls = 0;
  const reuse = createSearchWorkCache({ ttlMs: 100, now: () => now });
  const work = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return calls; };
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => reuse('query', work))), Array(20).fill(1));
  assert.equal(await reuse('query', work), 1);
  now = 101;
  assert.equal(await reuse('query', work), 2);
});

test('failed work is shared but does not poison retries', async () => {
  const reuse = createSearchWorkCache({ ttlMs: 100 });
  let calls = 0;
  const fail = async () => { calls++; throw new Error('offline'); };
  const outcomes = await Promise.allSettled([reuse('query', fail), reuse('query', fail)]);
  assert.equal(calls, 1);
  assert.ok(outcomes.every(result => result.status === 'rejected'));
  assert.equal(await reuse('query', () => 'recovered'), 'recovered');
});

test('empty answers are not retained, and completed cache is bounded', async () => {
  const reuse = createSearchWorkCache({ ttlMs: 100, maxEntries: 2, cacheable: result => result !== '' });
  let calls = 0;
  const empty = () => { calls++; return ''; };
  await reuse('empty', empty); await reuse('empty', empty);
  assert.equal(calls, 2);
  await reuse('a', () => 1); await reuse('b', () => 2); await reuse('c', () => 3);
  assert.equal(await reuse('a', () => 4), 4);
});

test('duplicate citations do not crowd out distinct pages or lose evidence', () => {
  const hit = (uri, cited) => ({ chunk: { uri, title: uri }, cited });
  const hits = uniqueCitedHits([...Array(30).fill(hit('https://example.gov.in/A.pdf', 'First fact')), hit('https://example.gov.in/A.pdf', 'Second fact'), hit('https://example.gov.in/a.pdf', 'Different file')]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].cited, 'First fact Second fact');
  assert.equal(hits[1].cited, 'Different file');
});

test('redirect fetch eligibility requires the exact HTTPS grounding host', () => {
  assert.equal(isGroundingRedirect('https://vertexaisearch.cloud.google.com/grounding-api-redirect/id'), true);
  for (const url of ['http://vertexaisearch.cloud.google.com/x', 'https://vertexaisearch.cloud.google.com.evil.test/x', 'https://evil.test/vertexaisearch.cloud.google.com', 'https://u:p@vertexaisearch.cloud.google.com/x']) assert.equal(isGroundingRedirect(url), false);
});

test('actual online search: 12 concurrent callers make 3 grounded calls and 1 redirect fetch', async () => {
  // Replace external dependencies only; execute the production search orchestration.
  let source = await readFile(new URL('../lib/desk/ai/online-search.js', import.meta.url), 'utf8');
  source = source.replace("'../portal-import/preferred-search-results.mjs'", JSON.stringify(new URL('../lib/desk/portal-import/preferred-search-results.mjs', import.meta.url).href));
  source = source.replace("'./official-search-policy.mjs'", JSON.stringify(new URL('../lib/desk/ai/official-search-policy.mjs', import.meta.url).href));
  source = source.replace("'./search-work-cache.mjs'", JSON.stringify(new URL('../lib/desk/ai/search-work-cache.mjs', import.meta.url).href));
  source = source.replace(/import \{ matchesRequestedPortal \}[^;]+;/, 'const matchesRequestedPortal = () => true;');
  source = source.replace(/import \{ geminiGrounded, usableGeminiKey \}[^;]+;/, 'const { geminiGrounded, usableGeminiKey } = globalThis.__searchTest;');
  source = source.replace(/import \{ PORTALS \}[^;]+;/, 'const PORTALS = [];');
  source = source.replace(/import \{ rankRows \}[^;]+;/, 'const rankRows = rows => rows;');
  let grounded = 0, redirects = 0;
  const originalFetch = globalThis.fetch;
  globalThis.__searchTest = {
    usableGeminiKey: () => 'test-key',
    geminiGrounded: async () => {
      grounded++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { chunks: [{ uri: 'https://vertexaisearch.cloud.google.com/id', title: 'Assam furniture', originalChunkIndex: 2 }], supports: [{ groundingChunkIndices: [0], segment: { text: 'Unrelated non-web evidence' } }, { groundingChunkIndices: [2], segment: { text: 'Official Assam furniture bid' } }] };
    },
  };
  globalThis.fetch = async () => { redirects++; return new Response(null, { status: 302, headers: { location: 'https://assam.gov.in/Bid.pdf' } }); };
  try {
    const { onlineTenderSearch } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => onlineTenderSearch(i % 2 ? ' Assam   furniture ' : 'assam furniture')));
    assert.equal(grounded, 3);
    assert.equal(redirects, 1);
    assert.ok(answers.every(answer => answer.rows.length === 1 && answer.rows[0].link === 'https://assam.gov.in/Bid.pdf'));
    assert.ok(answers.every(answer => answer.rows[0].detail === 'Official Assam furniture bid'));
    await onlineTenderSearch('assam furniture');
    assert.equal(grounded, 3);
    // A different query still reuses the exact same grounding redirect.
    await onlineTenderSearch('Assam office furniture');
    assert.equal(grounded, 6);
    assert.equal(redirects, 1);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__searchTest; }
});
