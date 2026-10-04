/** Download paths verified with saved originals; individual notices still need checks.
 * Evidence: docs/tender-official-verification.md and docs/tender-furniture-fixes.md.
 * This affects ranking only, never the URL/security allowlist.
 */
export const PREFERRED_CAPTCHA_PORTALS = Object.freeze([
  'assam', 'cppp', 'etenders', 'defence', 'coal-india', 'iocl',
  'pmgsy', 'manipur', 'meghalaya', 'nagaland', 'ntpc', 'west-bengal',
]);
export const PREFERRED_OFFICIAL_FILE_HOSTS = Object.freeze([
  'niperguwahati.ac.in', 'atalamritabhiyan.assam.gov.in',
]);
export function preferredDownloadRank({kind,host,portalId,retrievable}) {
  if (!retrievable) return 3;
  if (kind==='notice' && host==='bidplus.gem.gov.in') return 0;
  if (kind==='official-file' && PREFERRED_OFFICIAL_FILE_HOSTS.includes(host.replace(/^www\./,''))) return 0;
  if (kind==='portal-id' && PREFERRED_CAPTCHA_PORTALS.includes(portalId)) return 1;
  return 2;
}
