const WORDS = (text) => new Set(String(text || "").toLowerCase().match(/[a-z0-9]{4,}/g) || []);
const GENERIC = new Set(["tender", "tenders", "work", "works", "supply", "construction", "government", "department", "office", "notice", "portal", "india", "state", "division", "details", "online", "bid", "bids"]);
/** True when the opened notice shares its ID/reference or several distinctive title words with the chosen result. */
export function sameNotice(evidence, fields = {}) {
  const blob = String(evidence || "").toLowerCase();
  const expectedIds = [...new Set(blob.match(/\b\d{4}_[a-z0-9]+_\d+_\d+\b/g) || [])];
  if (expectedIds.length && !expectedIds.includes(String(fields['Tender ID'] || '').toLowerCase())) return false;
  const packages = blob.match(/\b(?:as|ar|mn|ml|mz|nl|tr|sk)[-_ ]?\d{2,}(?:[-_]\d+)*\b/g) || [];
  const actual = JSON.stringify(fields).toLowerCase().replace(/[^a-z0-9]/g,'');
  if (packages.some(id => !actual.includes(id.replace(/[^a-z0-9]/g,'')))) return false;
  for (const key of ["Tender ID", "Tender Reference Number"]) {
    const value = String(fields[key] || "").toLowerCase().trim();
    if (value.length >= 5 && blob.includes(value)) return true;
  }
  const seen = WORDS(blob);
  const title = [...WORDS(`${fields.Title || ""} ${fields["Work Description"] || ""}`)].filter((w) => !GENERIC.has(w));
  const shared = title.filter((w) => seen.has(w)).length;
  return title.length > 0 && shared >= Math.min(3, Math.ceil(title.length / 2));
}
