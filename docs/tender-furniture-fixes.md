# Official download fixes and shared reuse — 1 October 2026

## User flow

Search results use one column, with evidence expandable on each result. One **Get files** action creates a durable background job. Users can leave the page; job status and completion notifications remain available. The separate background button and duplicate selected-result panel are removed. Supported-source badges no longer promise that a particular notice has downloadable files.

Preferred download sources live in `lib/desk/portal-import/preferred-sources.mjs`. This small ranking configuration prioritizes validated direct sources and exact-ID CAPTCHA portals, including the verified PMGSY path. It does not bypass URL safety checks or guarantee individual notice availability. No unidentified “11th result” is pinned by position.

## Verified failures and fixes

- GeM bid `GEM/2026/B/8020218` / public document `9874034`: the earlier preview rejected a central-ministry buyer despite an Assam consignee. The updated parser accepts the explicit Northeast delivery evidence. The GeM PDF and NIPER Guwahati mirror now both retrieve the bid, buyer specification and GTC PDFs. Mirror PDFs are parsed by their GeM content rather than generic PDF heuristics. Allowed attachment links include the GeM buyer-document host and dated GTC endpoint.
- An empty GeM `downloadOmppdfile/` link has no document identifier. It is reported as unavailable; the saved packet remains partial. A scanned specification keeps its original PDF and extraction warning.
- The search URL shown for PMGSY AS082133 opened a different tender, `2020_CEASM_98905_1`, for AS-03-57. Detail-page identity is now checked before availability errors. Explicit project/package and tender-ID mismatches cannot pass generic road-word matching.
- Bounded recovery found an expired April round and the correct current round `2026_CEASM_149637_7`, reference `CE/PMGSY/01/2025-26/55`, closing 5 October 2026. Selection carries the chosen candidate's evidence, not the earlier wrong notice.
- Correct PMGSY retrieval saved six PDFs, `BOQ_235919.xls` and the original ZIP. SHA-256 and file signatures were checked. The BOQ names AS082133 and the matching road. Three CAPTCHA attempts included one rejection; CAPTCHA time was 34.4 seconds and binary transfer time 87.2 seconds. Files were saved into the isolated preview without another portal download.

## Shared server cache

The existing shared Tender/Document/DocumentFile tables remain the cache; no per-user copy or new cache table is needed. Reuse checks run before discovery, after identity resolution and after the portal lease is obtained. Lookup uses an exact source + tender ID, or an allowlisted canonical document URL. Generic portal/session URLs and title-only matches cannot identify a cached tender.

Cache hits return the original tender, document count, completeness and warnings. The stored manifest and original file relations/sizes are checked; PostgreSQL checks actual byte lengths without loading PDFs into Node. Missing files produce an explicit restoration error rather than false success. This change does not automatically repair damaged storage. Later manual attachments do not invalidate the official packet. Concurrent unique-key saves recheck the saved winner. Unverified review artifacts remain private to their requester.

Cache reuse is across authorized users in the same Desk database. It does not merge separate tenants/databases or infer that two unrelated URLs contain identical documents. New tender rounds use distinct IDs. It does not automatically refresh amendments to an already saved notice.

## Validation

- Production build passed in an isolated snapshot.
- Official importer/store: 37 tests; direct documents: 15; linked packets: 5; public notice checks: 13; official-copy fallback: 5; search scope: 1; notice match: 1; preferred-source ranking: 2.
- Shared-cache tests cover owner-independent identity, missing originals, manifest omissions, byte-length mismatch, preserved partial warnings and unrelated manual attachments.
- UI job flow: 8 tests; client checks: 6. Prior isolated HTTP lifecycle suite: 37 checks; HTTP background-job suite: 37 checks.
- Both exact GeM and mirror HTTP workflows succeeded; all eight served files across those two records returned 200 with hashes matching storage. Browser flow on port 3218 completed a GeM job in 14 seconds and showed the saved files and completion notification.
- Repeat GeM job on port 3218 returned `existing: true`, three PDFs and the original partial warning in 1,722 ms with no external download or CAPTCHA.

Preview records:
- GeM: `/tenders/desk/tenders/fcbc05ef-013f-4452-a96f-379374ee0591`
- PMGSY: `/tenders/desk/tenders/06543bdc-c53f-4f9f-8067-59be921402a6`

These records are in the isolated validation schema used by the local preview. Production deployment is separate. Secrets and local downloaded artifacts remain ignored by Git.
