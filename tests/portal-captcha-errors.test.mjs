import test from 'node:test';
import assert from 'node:assert/strict';
import { AssamPortal, PortalFetchError } from '../lib/desk/portal-import/assam.mjs';

test('expired detail link preserves exact-ID lookup CAPTCHA failures', async () => {
 const portal = new AssamPortal({ apiKey:'test-only' });
 portal.page = async () => '<html>Expired detail</html>';
 const original = new PortalFetchError('CAPTCHA rejected', {code:'CAPTCHA_REJECTED'});
 portal.openById = async () => { throw original; };
 await assert.rejects(portal.retrieve('2026_PWD_52998_1', {detailLink:portal.base+'?service=direct&sp=expired'}), error => error === original);
 assert.equal(portal.metrics.downloads,0);
});
test('expired detail link preserves portal timeout failures', async () => {
 const portal = new AssamPortal({ apiKey:'test-only' });
 portal.page = async () => '<html>Expired detail</html>';
 const original = new PortalFetchError('Official retrieval timed out.');
 portal.openById = async () => { throw original; };
 await assert.rejects(portal.retrieve('2026_PWD_52998_1', {detailLink:portal.base+'?service=direct&sp=expired'}), error => error === original);
});
