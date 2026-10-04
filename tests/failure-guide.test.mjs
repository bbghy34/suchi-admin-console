import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadFailureGuide } from '../lib/desk/portal-import/failure-guide.mjs';

test('running and saved downloads have no failure guide', () => {
  assert.equal(downloadFailureGuide({ status: 'RUNNING' }), null);
  assert.equal(downloadFailureGuide({ status: 'SUCCEEDED', result: { ok: true } }), null);
});

test('missing files and dead links never offer a pointless retry', () => {
  const gone = downloadFailureGuide({ status: 'FAILED', result: { code: 'SOURCE_DOWNLOAD_UNAVAILABLE' } });
  assert.equal(gone.retry, false);
  assert.deepEqual(gone.actions, ['notice', 'upload']);
  const expired = downloadFailureGuide({ status: 'FAILED', result: { error: 'This link has expired or is not an exact tender. Enter the Tender ID from the official notice.' } });
  assert.equal(expired.code, 'LINK_EXPIRED');
  assert.equal(expired.retry, false);
});

test('temporary portal problems can be retried', () => {
  for (const code of ['CAPTCHA_REJECTED', 'PORTAL_COOLDOWN', 'PORTAL_BUSY', 'RETRIEVAL_TIMEOUT']) {
    assert.equal(downloadFailureGuide({ status: 'FAILED', resultJSON: { code } }).retry, true, code);
  }
  assert.equal(downloadFailureGuide({ status: 'FAILED', error: 'The portal rejected three CAPTCHA answers.' }).code, 'CAPTCHA_REJECTED');
  assert.equal(downloadFailureGuide({ status: 'INTERRUPTED' }).code, 'INTERRUPTED');
  assert.equal(downloadFailureGuide({ status: 'FAILED', result: '{"code":"NO_VERIFIED_MATCH"}' }).code, 'NO_VERIFIED_MATCH');
});
