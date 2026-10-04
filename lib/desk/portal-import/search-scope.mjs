import { officialSearchPolicy } from '../ai/official-search-policy.mjs';
/** Explicit portal requests must not be diluted with unrelated portal notices. */
export function matchesRequestedPortal(query, row) {
  if (!/\bGeM\b|government\s+e[ -]?marketplace/i.test(query)) return true;
  // An explicit combined-portal search can include both sources.
  if (/\b(?:CPPP|eprocurement|assamtenders|e-?procurement)\b/i.test(query)) return true;
  if (officialSearchPolicy(query).explicitHosts.some(host => host !== 'bidplus.gem.gov.in')) return true;
  try { if (/(^|\.)gem\.gov\.in$/i.test(new URL(row.link).hostname)) return true; } catch {}
  // A buyer's official mirror can carry the same GeM bid identifier.
  return /\bGEM\/\d{4}\/[A-Z]\/\d+\b/i.test(`${row.title || ''} ${row.detail || ''}`);
}
