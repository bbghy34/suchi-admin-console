# Search and download verification — 1 October 2026

## Problem and changes

The first Assam and Nagaland road results were real official notices, but their
download windows had expired. Search also enabled `include_closed` when the local
library had no results. Google citations alone did not establish that documents
were still available.

- Removed automatic closed-tender widening; historical search remains explicit.
- Enforced preferred official sources in returned results, not just the prompt.
- Added cached public keyword searches for Assam and Nagaland. Current matching
  detail pages with document links rank before current listings, then citations.
  A visible download link is preliminary evidence; only successful retrieval and
  binary validation establishes a downloaded file.
- Public search supports road, construction, furniture, equipment, water and solar
  categories. It does not solve CAPTCHAs during discovery. Results are cached for
  15 minutes with shared in-flight work, paced requests and one transport retry
  for the read-only keyword POST. Failed detail checks preserve current listings.
- Confirmed missing download links are cached for 24 hours. CAPTCHA failures and
  timeouts are never treated as proof that a tender is unavailable.
- Allowed slower official searches and hosted-database transactions to finish.
  Partial portal failures are reported as incomplete checks, not empty inventories.
- Corrected citation indexing when Google returns non-web grounding chunks.

## Actual Chrome tests

| Query / selected tender | Result |
| --- | --- |
| Assam government road construction — initial `2025_PWD_47610_2` | Download window ended 7 October 2025; no document links. Failed before CAPTCHA. |
| Nagaland government road construction — initial `2026_NUIDP_820_1` | Download window ended 13 July 2026; no document links. Failed before CAPTCHA. |
| Assam government road construction — updated top result `2026_BoTC_54175_1` | Saved three PDFs, BOQ XLS and original ZIP; all signatures, sizes and SHA256 hashes verified. One CAPTCHA, no rejected answers. Approximately 122 seconds including extraction/storage. |
| Nagaland government furniture supply — updated top result `2026_DSE_839_1` | Saved three PDFs, BOQ XLS and original ZIP; all signatures, sizes and SHA256 hashes verified. One CAPTCHA, no rejected answers. Approximately 64 seconds. |

Nagaland's successful current public `road` search explicitly returned no matching
tenders. Its current furniture notice was used for the second successful test;
it is not evidence that the road query has a current matching tender.

The Nagaland main RFB and BOQ corroborate furniture for 17 Lighthouse School
Complexes in four packages, reference `IN-DSE-561621-GO-RFB`. Its small NIT PDF has
no usable extracted text; the original is intact. ZIP files are preserved without
being treated as text documents.

## Google Search configuration

The GenerateContent request uses `tools: [{ google_search: {} }]` and consumes
`groundingChunks` and `groundingSupports`. The documented model and REST format
were checked against Google's official documentation on 1 October 2026:
https://ai.google.dev/gemini-api/docs/generate-content/google-search

Grounding diagnostics record model, query count, source count and elapsed time,
without credentials, full search text or source URLs. Grounding is discovery;
portal availability and downloaded bytes are validated separately.

This is a technical configuration check, not a statement that the current
Google-grounded workflow meets all provider requirements. See
[the production review](./gemini-grounding-production-review.md) for the unresolved
display, caching and downstream link-use restrictions found in Google's terms.

## Validation

- 56 focused search, availability, citation, queue and retrieval tests passed.
- Nine job tests passed against disposable local PostgreSQL, including concurrent
  claims, transaction timing and notification deduplication.
- Production build passed. The local preview received the final changes.
- Chrome showed the saved Nagaland documents; independent database/storage checks
  verified both packets against their original manifests.

## Scope

This verifies two fresh state-portal packets, not every notice on every supported
portal. Preferred-source discovery covers the configured source list; the new
current-listing check specifically covers Assam and Nagaland. Other portal
adapters retain their separately documented coverage. No monthly crawl was run.
