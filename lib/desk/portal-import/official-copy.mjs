import { directDocumentIdentity, officialPageUrl } from './direct-document.mjs';
import { portalFor } from './identity.mjs';

const bounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const tokens = value => bounded(value, 180).toLowerCase().match(/[a-z0-9]+/g) || [];

// Punctuation may differ between the notice and a search excerpt. Keep token
// boundaries so a reference ending in 12 cannot match a different one ending 123.
function containsIdentifier(evidence, identifier) {
  const parts = tokens(identifier);
  if (parts.join('').length < 6) return false;
  const pattern = `(?:^|[^a-z0-9])${parts.join('[^a-z0-9]*')}(?=$|[^a-z0-9])`;
  return new RegExp(pattern, 'i').test(evidence);
}

function canonical(link) {
  try { const url = new URL(link); url.hash = ''; return url.href; } catch { return ''; }
}

/** Search once for public official copies after the original notice is verified.
 * These are choices for further document verification, never verified downloads.
 */
export async function findOfficialCopies(fields = {}, existingLink, search) {
  const tenderId = bounded(fields['Tender ID'], 180);
  const reference = bounded(fields['Tender Reference Number'], 180);
  const identifiers = [tenderId, reference].filter(value => tokens(value).join('').length >= 6);
  if (!identifiers.length || typeof search !== 'function') return [];
  const title = bounded(fields.Title, 300);
  const query = `Find public official PDF copies or official document pages for this exact tender. Tender ID: ${tenderId}. Tender reference: ${reference}. Title: ${title}. Return only government or issuing institution websites with this exact ID or reference in their notice. Do not substitute another tender or return aggregator copies.`;
  const result = await search(query);
  const excluded = canonical(existingLink);
  const choices = new Map();
  for (const row of (Array.isArray(result?.rows) ? result.rows : []).slice(0, 30)) {
    const evidence = `${bounded(row?.title, 500)} ${bounded(row?.detail, 3000)}`;
    if (!identifiers.some(identifier => containsIdentifier(evidence, identifier))) continue;
    const links = [row?.link, ...(Array.isArray(row?.documents) ? row.documents.slice(0, 10).map(doc => doc?.url) : [])];
    for (const link of links) {
      if (typeof link !== 'string' || portalFor(link)) continue;
      const direct = directDocumentIdentity(link);
      const officialLink = direct?.link || officialPageUrl(link);
      if (!officialLink || canonical(officialLink) === excluded || choices.has(officialLink)) continue;
      choices.set(officialLink, {
        officialLink,
        title: bounded(row.title, 300) || title || 'Official document copy',
        evidence: `Possible official copy; document identity still needs verification. ${bounded(row.detail, 700)}`,
        reference,
      });
      if (choices.size === 3) return [...choices.values()];
    }
  }
  return [...choices.values()];
}
