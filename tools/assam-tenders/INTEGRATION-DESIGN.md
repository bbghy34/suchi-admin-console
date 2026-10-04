# Official tender retrieval from Tender Desk

Design and verification boundary: 30 September 2026. The shared adapter now accepts the 14 registered GePNIC hosts. Every registered search form was checked; Assam alone has passed complete live download testing. GeM, NBCC vendor systems and Sikkim notices use manual intake.

## User flow

Gemini search → public notice card → Get official files → resolve official tender → verify identity → retrieve details and attachments → save → Open in Tender Desk.

The normal case is one click. If the result cannot identify exactly one tender, show official candidates with reference, department, location and closing date. Ask the user to choose; never silently attach the closest title match. A failed or incomplete import must remain visibly incomplete.

Already saved tenders open the existing record without contacting the government site. Refresh official files is an explicit action. No automatic daily refresh of known tenders.

## Resolve the tender before downloading

Preserve the complete search evidence. Display text can be shortened, but the stored result must retain the original title, description, source links, document links, tender ID, reference, organisation and location when supplied. Missing fields stay missing.

Resolution order:

1. Official detail URL: open through an allowlisted adapter and read the official ID. Verify against any ID/reference in the result.
2. Official portal plus exact tender ID: use its exact-ID search. Old session URLs are not stable identifiers.
3. Reference number plus department/state: search the appropriate portal, then compare reference, organisation, title and location. Only a unique verified match proceeds automatically.
4. Homepage, aggregator or title-only result: use it as a discovery clue. Restrict lookup to plausible registered official portals. Return named candidates or offer source/manual upload when evidence is insufficient; do not require a human to type the ID in the normal search flow.

Use `(sourceId, portalTenderId)` as the primary deduplication key. A scheme such as PMGSY is a tag, not a second copy of the same tender. Cross-portal duplicates need explicit evidence; title similarity alone must not merge records. Preserve all discovery links as provenance.

## Portal coverage

| Group | Hosts | Proposed implementation / verification |
| --- | --- | --- |
| Seven NE states | assamtenders.gov.in; tripuratenders.gov.in; arunachaltenders.gov.in; manipurtenders.gov.in; meghalayatenders.gov.in; mizoramtenders.gov.in; nagalandtenders.gov.in | Homepage and tender-status route checked. Shared GePNIC engine with separately tested host configuration. All seven hosts are registered; Assam has the full live download test. |
| Sikkim | www.sikkim.gov.in/tender | Official notice board verified. Follow its actual notice/PDF references to the bidding portal. Existing sikkimtenders.gov.in configuration failed DNS; singular sikkimtender.gov.in was not verified reachable. Do not enable either speculatively. |
| Central and PSU | eprocure.gov.in/eprocure/app; pmgsytenders.gov.in/nicgep/app; iocletenders.nic.in; eprocurentpc.nic.in; coalindiatenders.nic.in; defproc.gov.in | GePNIC candidates. CPPP has a different base path. Registered with the shared adapter after search-form checks; full per-host download verification remains outstanding. |
| GeM | bidplus.gem.gov.in | Separate adapter and testing; do not assume GePNIC forms or CAPTCHA behaviour. |
| NBCC / other e-procurement vendors | nbcc.enivida.com and actual official links | Separate platform adapters when observed in relevant search results. |
| Department notice boards | Official department pages and PDF links | Small direct-file adapter; preserve NIT and follow verified procurement references. A notice PDF does not establish that the complete bid package was captured. |

Apply the user's clarified business scope: all eight NE state portals; GeM only for NE buyers/consignees; CPPP, Defence, central PSUs, Coal India, IOCL, NTPC and NBCC all India; West Bengal as a separate included state. A national portal's address does not determine a project's state. A query explicitly asking for NE still narrows the results by work location. Source-register defaults and a migration correct the old NE-only intake descriptions. These changes take effect in production only after deployment and migration.

No coverage percentage is claimed. A portal appearing in a search result is evidence for prioritising its adapter, not evidence that downloads are supported.

## Shared retrieval engine

Keep a small explicit registry: source ID, allowed hosts, base path, adapter, allowed redirects, and verified capabilities. All redirects and file hosts must be validated. Avoid arbitrary server-side URL fetching from Gemini output.

Adapter operations:

```text
resolve(result) -> exact tender or candidates
readDetails(identity, session) -> official fields + document manifest
downloadDocuments(manifest, session) -> validated original files
```

GePNIC uses stateful HTML forms. Read current form actions, hidden fields, cookies and document links. Do not hardcode opaque DirectLink tokens or reuse them across runs. All requests for one retrieval use the same session.

CAPTCHA is a pluggable `solveCaptcha(image, constraints)` function with a server-only 2Captcha key, timeout and task budget. Search and document unlock can be separate challenges. An unlocked session may cover multiple files, but this must be detected from returned pages, not assumed. Refresh a rejected challenge rather than resubmitting stale state. Record task outcome and cost without recording keys, session tokens or CAPTCHA payloads in ordinary logs.

The resolver and downloader are deterministic after Gemini discovery, except for the external CAPTCHA service. No LLM is required to click links, parse forms, select documents or write records.

## Save one coherent result

Retain:

- Official tender ID, reference, organisation, department, work description, location and category.
- Published, closing, opening and clarification dates with timezone; value, fees, EMD and eligibility where published.
- Original NIT, BOQ, bid package, drawings and other listed attachments; retain original ZIPs too.
- Explicitly linked corrigenda and their attachments when supported. Until implemented, show that this history was not captured.
- File names, MIME/signature checks, byte counts, SHA-256, retrieval time and source provenance.
- PDF properties, page count and complete text; workbook sheets, cell values and formulas without executing them.
- Sanitized official page evidence and raw field values for later re-parsing.
- Search evidence separately from verified official facts.

Validate expected files against the manifest. Save the record and file references atomically, or retain a clearly incomplete import for retry. Extraction failure is distinct from download failure: preserve the valid original and mark extraction pending/failed. Do not report a complete package when a listed file is missing.

Keep conflicting facts with their sources. The audited Assam notice and portal had different closing dates; a parser must not silently erase that discrepancy. Capturing originals reduces future re-fetching, but it cannot capture amendments published later.

## Simple backend contract

The browser sends the official link, exact ID when available, and discovery query to the authenticated import endpoint. Host, form destination and returned official ID are independently checked on the server. Reference lookup is a separate mode returning candidates for user selection. A future persisted-result-ID contract could retain the entire search-result linkage; current official-record metadata retains the discovery URL and query.

Outcomes: saved, already saved, needs selection, unsupported portal, incomplete, or retry after a specified time. Show the source and progress in ordinary language. Keep keys and sessions on the server.

Use the current database for a lightweight import status and per-host lease. Start with one bounded import per request where hosting duration allows it. If deployment limits require background execution, run the same adapter in one small worker and poll status; no separate workflow platform is needed.

## Low traffic and recovery

- User-triggered retrieval only. Search cards do not automatically download files.
- One active import per portal; at least two seconds between portal requests.
- Reuse the same session inside one import; skip already saved tenders and unchanged stored files.
- Bounded exponential backoff with jitter for safe transient retries; honour Retry-After and persist host cooldown.
- Do not blindly replay state-changing form submissions after ambiguous failures. Re-establish current page/session state first.
- Bound requests, elapsed time, paid CAPTCHA attempts, file sizes and ZIP expansion.
- Log import ID, source, stage, request count, latency, retries, CAPTCHA attempts/cost, downloaded bytes, file counts and final outcome. Redact secrets.
- Keep CLI discovery checkpoints separate from this selected-result import. No broad scan is needed to save one selected tender.

## Acceptance before enabling a portal

Test one exact tender end to end: identity, real CAPTCHA if required, original attachment bytes, manifest completeness, persisted record and UI links. Also test duplicate import, ambiguous identity, rejected CAPTCHA, rate limit, expired session and missing file. Limit manual live downloads to the user's small test budget.

Implementation order: fix and verify the current Assam web import; extract the shared GePNIC engine; add seven-state and central host configs in verified batches; add official notice-board retrieval; then separate GeM/vendor adapters based on actual relevant results.

## Daily desk and project lifecycle

The assigned employee checks the source list daily and records Uploaded, No new tender, or Could not open, with a note when needed. Manual tender entry and document upload remain first-class paths alongside official retrieval. Assign a backup for absence. A daily work assignment does not imply a daily full-portal crawler.

Search results feed one lifecycle:

```text
Discovered → Saved → Selected → Preparing bid → Bid submitted
                                               ├─ Not awarded → EMD refund follow-up
                                               └─ Awarded → Execution → Completed → SD refund follow-up → Closed
```

On selection, enable the user's chosen notification frequency and generate a document-requirements checklist from captured documents, with document/page references. Show unverified or conflicting requirements and dates. Summarisation is an AI feature separate from deterministic document retrieval; scanned PDFs may require OCR. The user can edit or confirm the checklist.

Track EMD and Security Deposit as separate instruments: amount, form, issuer, beneficiary office, deposit date, expiry if applicable, supporting evidence, held/refund status and expected release conditions. EMD can be recorded during bid preparation; SD can be entered after award. If EMD is converted into SD, link the records and avoid counting the same money twice.

Completion records contain the actual completion date and certificate. Store the office responsible for returning SD, contract release conditions, defect-liability period when applicable, and release eligibility date. Uploading the certificate creates an internal refund follow-up or draft application. It does not establish immediate eligibility or automatically send an application to an external office. The responsible person reviews and submits it, then records acknowledgement, release amount/date and evidence.

Use existing Tender Desk records and stages wherever possible. Main dashboard sections: new tenders, selected/preparing bids, upcoming deadlines, ongoing projects, EMD held, SD held, eligible refunds and overdue follow-ups. Keep financial reminders active independently of whether tender-document refresh is enabled.

Verified outcome: after image normalization and case-sensitive solver instructions, the Node adapter retrieved the Assam NIT and ZIP in two sequential downloads. One rejected CAPTCHA was recovered with a fresh challenge. Files, full PDF text and workbook metadata were saved and served through the local desk with matching hashes. Live Gemini summary and the local financial lifecycle passed. See VERIFICATION.md for exact scope; this is not a claim of live download certification for all registered hosts.
