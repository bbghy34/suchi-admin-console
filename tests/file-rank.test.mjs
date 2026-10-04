import test from 'node:test';
import assert from 'node:assert/strict';
import { fileRank, rankByFiles } from '../lib/desk/portal-import/file-rank.mjs';

test('downloadable or saved notices rank above cited files, then plain pages', () => {
  const page = { link: 'https://assamtenders.gov.in/nicgep/app?page=FrontEndViewTender' };
  const cited = { link: 'https://pwd.assam.gov.in/notice', documents: [{ url: 'https://pwd.assam.gov.in/nit.pdf' }] };
  const fileLink = { link: 'https://ntpc.co.in/tender/NIT-12.PDF' };
  const verified = { link: 'https://x.gov.in/a', downloadAvailability: 'available' };
  const saved = { link: 'https://x.gov.in/b', existingTenderId: 't1' };
  assert.deepEqual([page, cited, fileLink, verified, saved].map(fileRank), [2, 1, 1, 0, 0]);
  const ranked = rankByFiles([page, cited, verified, fileLink, saved]);
  assert.deepEqual(ranked.map(row => row.link), [verified.link, saved.link, cited.link, fileLink.link, page.link]);
});
