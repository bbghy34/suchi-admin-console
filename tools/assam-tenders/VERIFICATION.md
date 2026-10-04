# Verification — 30 September 2026

## Environment and scope

Branch `codex/assam-tender-ingestion`, incorporating the completed Tender Desk integrity fixes at `febde9c`. Local app: port 3217. Database: an isolated `codex_portal_validation` schema on the supplied Neon database, using a direct connection with an explicit SQL search path. No production deployment or live-account password change. Secrets are in ignored `.env.local` only.

## Real portal evidence

Assam tender `2026_DoWR_54237_1`, Sutradhar Basti anti-erosion work, Department of Water Resources. The final live Node run used 10 HTTP requests including download redirects, 3 paid CAPTCHA tasks, 1 rejected answer recovered on a fresh challenge, and **2 sequential download requests** totalling **1,018,897 bytes**. No monthly crawl was run.

| Saved original | Bytes | Validation |
| --- | ---: | --- |
| Tendernotice_1.pdf | 258,995 | PDF, 3 pages, extracted text |
| bid_sutradhar.pdf | 682,483 | PDF, all 61 pages extracted, including page 61 |
| BOQ_85151.xls | 408,576 | OLE Excel, both workbook sheets and cells retained |
| official-work-items.zip | 759,902 | Original archive preserved with the bid PDF and BOQ |

The ZIP includes two files, so the two government downloads produced three listed tender documents plus the retained original archive. The database also stores `official-record.txt` with all parsed portal fields, file hashes, extraction metadata and sanitized page evidence.

Each saved original was downloaded through the authenticated local document endpoint. Byte count and SHA-256 matched the recorded originals. Duplicate import returned the same Tender Desk ID without another government request.

CAPTCHA diagnosis: the original tiny transparent PNG produced observed case errors. White-background normalization, enlargement, explicit case-sensitive instructions and an English language pool produced a correct known-answer result, followed by successful live retrieval. Recognition can still fail; the code uses fresh challenges and bounded paid attempts. JavaScript validation strings are excluded from rejection detection.

A real reference lookup through the authenticated local API found `2026_DoWR_54237_1` from `KOKRAJHAR/2026-27/RIDF XXXII/I`; it returned a candidate and downloaded no files.

All 14 registered portals returned parseable tender-status forms with tender ID, reference and CAPTCHA fields: Assam, Tripura, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, West Bengal, CPPP, national PMGSY, IOCL, NTPC, Coal India and Defence. These were one-page read-only checks, spaced two seconds apart. **They do not prove downloads work on all 14 sites.** GeM, NBCC Enivida and Sikkim notice-board retrieval remain manual.

## Gemini and UI

The supplied Gemini key returned grounded search results for the Assam work, including official and aggregator URLs. The actual results confirmed why a homepage must not be treated as an exact tender link.

Gemini produced all ten document-summary sections from the saved originals. The rendered local page showed file/page references, technical and financial checklists, EMD, SD terms and conflicting dates. The original summary wiring required an OpenAI key; this change makes Gemini available to that path too. Retrieval and extraction themselves remain non-LLM.

Chrome verified the real tender page, official document links, selected status, frequent notifications and the document summary. The BOQ appears in its separate BOQ tab. Local screenshots and detailed test outputs are kept in ignored verification storage; no credentials are committed.

## Local workflow checks

- Sign-in; anonymous retrieval rejection; unsupported/foreign-host rejection.
- Duplicate import with no extra tender or download.
- Original-file download signatures, byte counts and hashes; 61-page PDF text and two-sheet workbook metadata.
- Manual intake → selection → notification-frequency changes → preparing bid → EMD entry → bid submitted → award evidence → SD entry → execution.
- SD before award is rejected.
- Missing completion certificate blocks SD refund drafting.
- Completion certificate and release terms save together; a future release-eligibility date blocks drafting.
- Eligible refund draft → submitted → acknowledged → released; instrument becomes refunded.
- Closure is blocked while EMD remains held, and succeeds after it is refunded.
- Daily source row becomes Uploaded.
- Scheduled bid reminder arrives and a repeated scheduler run does not duplicate it.
- Invalid manual upload leaves no orphan tender; a second portal lease is blocked and cooldown persists.

Fixtures are clearly labelled LOCAL WORKFLOW TEST in the isolated schema. Refund actions are internal test records, not submissions to external offices.

## Data disagreements deliberately preserved

The consolidated NIT lists an October 1 closing date; the portal and tender-specific bid schedule list October 23. The portal value is ₹22,999,654 while the bid/BOQ includes ₹22,999,654.73. The NIT rounds the Sutradhar estimate to ₹230 lakh. Source values are retained rather than silently reconciled. The model summary identifies the date discrepancy for review.

## Remaining limits

- No automatic download of linked corrigendum/award history, bidder-account-only material or future amendments. Original evidence permits local re-extraction only for already captured material.
- No OCR for scanned-only PDFs in the web importer; retain originals and show missing extraction.
- No automatic title-only fuzzy match. Users can resolve a reference, enter an exact ID, or upload manually.
- No automatic refresh of known tenders or background government crawl. Daily human assignments and in-app reminders continue independently.
- File/ZIP/time limits are deliberate; oversized packets require manual upload. Production hosting must allow the configured request duration.
- All registered host forms were checked; only Assam's complete download flow was live-tested within the small download budget.

## Final validation

- Node retrieval suite: 20 passed.
- Python CLI suite: 33 passed.
- Authenticated local lifecycle integration: passed, including file hashes and refund gates.
- Exact-ID search returned the saved tender despite conflicting category/keyword filters.
- Production build: passed (111 static pages generated).
- Live retrieval used the network client, then the same storage/extraction service used by the API. The API was separately verified for reference resolution, duplicates and document delivery. A second fresh full network import through the API was deliberately avoided to stay within the two-download test budget.

## Follow-up: normal search to official files

A normal Chrome search for “road construction in Assam” returned the Gossaigaon road repair notice `2026_BoTC_54225_1`. The actual API retrieved and saved it: 14 HTTP requests, 3 CAPTCHA tasks (one rejection), 4 download requests, 12,874,034 bytes. Unlike the earlier service-level save, this exercised the full browser-button API pipeline. The original demo required choosing Assam; that gap is now removed. An authenticated API check with only the aggregator result automatically resolved Assam and the exact ID and returned the saved tender without another portal request.

The Gormara result resolved to `2025_PWD_46604_30`, with document-download end `01-Sep-2025 02:00 PM`. A fresh public detail-page inspection showed plain-text filenames, no file anchors, no download CAPTCHA gate and no ZIP link. An early availability guard now reports HTTP 410 before CAPTCHA for these direct links. This is document unavailability on the official page, not a failed CAPTCHA answer.

The retrieval suite now has 25 passing tests, including automatic aggregator resolution, conflicting evidence, ambiguous choices, and closed-listing detection with zero CAPTCHA tasks. A stale-query filter race was also fixed.

The fixed Gormara API path was live-verified: HTTP 410 in 1.747 seconds, one official page request, zero CAPTCHA tasks and zero downloads. Total elapsed time and outcome are now included in API responses and completion logs. Automatic inferred-filter URL writes were removed because they triggered a second Gemini search and replaced the displayed results during interaction. Explicit user filter edits still persist in the URL.

## Six selected notices and latency UX (30 September 2026)

Sequential local runs against the isolated validation schema, with 12 seconds between notices:

| Notice | Result | Import response time |
| --- | --- | --- |
| Gossaigaon | Existing record; five retained files verified by size and SHA-256 | 0.629s |
| Guwahati road/drain | Fresh import; four retained files verified by size and SHA-256 | 144.637s |
| Gormara | No official download links; 410, no CAPTCHA | 1.487s |
| Udalguri | No official download links; 410, no CAPTCHA | 3.813s |
| Borkhola | No official download links; 410, no CAPTCHA | 2.264s |
| Goalpara | No official download links; 410, no CAPTCHA | 1.340s |

The Guwahati import used 10 government requests, 3 CAPTCHA tasks (one rejected), and 2 downloads totalling 2,313,080 bytes. Individual stage times were not recorded in that run; do not attribute the entire duration to file transfer or claim a measured CAPTCHA duration. Four unavailable notices are expected failures, not successful downloads. Discovery still returns older notices.

The UI now opts into NDJSON progress on the existing authenticated import endpoint. JSON callers retain the original HTTP status contract. Progress is emitted by actual identity lookup, CAPTCHA solving/submission/rejection, government retries, downloads, file extraction and saving. A final result is required before displaying success. Disconnects tell the user to check the desk before retrying. This remains a streamed request, not a durable background job; keep the page open. Stage events include elapsed milliseconds for subsequent latency investigation. Credentials, CAPTCHA answers and session tokens are never sent to the browser.

Live streaming checks: saved Gossaigaon returned in 0.778s; closed Gormara in 1.209s. Both emitted progress before their final result. No additional CAPTCHA spend was needed. Unit checks cover fragmented UTF-8 stream decoding, cooldown errors, missing final results, JSON compatibility and multiple CAPTCHA challenges with one configured key. Production build passed. Visual inspection used Chrome on localhost; screenshots and raw test reports are ignored under verification/latency-ux and verification/progress-live.json.
