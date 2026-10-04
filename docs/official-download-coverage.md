# Official download coverage

Updated 1 October 2026. This is a code audit and reconciliation of recorded sample results, not a new live certification of every portal. No government downloads or CAPTCHA purchases were made for this audit.

## What is standardized today

All supported retrieval paths enter `lib/desk/portal-import/service.js` and use the background job, saved-file lookup, permission checks, normalized packet, original-file storage, extraction and completion notification flow. A successful saved result identifies the tender and retains file metadata, original bytes and SHA-256 hashes. Partial-download and extraction warnings remain visible on reuse.

There are three adapter families, not a separate independent implementation for every government site:

1. **NIC GePNIC:** `assam.mjs` handles the shared form/session/CAPTCHA/download protocol. `identity.mjs` supplies 15 explicit hosts, their paths and state defaults. Each retrieval has its own client/session. A common protocol does not guarantee that every notice or portal variant works.
2. **Public notices:** `public-notice.mjs` handles GeM bid PDFs and Sikkim notice pages, with source-specific identity, attachment and metadata rules.
3. **Official files/pages:** `direct-document.mjs`, `page-discovery.mjs` and `linked-packet.mjs` retrieve allowed official files and inspect one level of relevant linked pages. This is bounded HTML discovery; it does not execute arbitrary site JavaScript or complete arbitrary forms.

The families share the final packet/storage workflow, but still have distinct HTTP and parsing code. Calling this a universal government-site downloader would overstate coverage.

## Portal matrix

“Recorded success” means the linked verification notes contain a successful bounded sample. It is not a promise about all tenders, present availability, every attachment or semantic correctness.

| Requested source | Implemented route | Evidence and limits |
| --- | --- | --- |
| Assam | GePNIC: `assamtenders.gov.in/nicgep/app` | Recorded downloads and identity/file verification exist. Latest observed closed notice listed documents without active download anchors: unavailable, not a successful download. |
| Tripura | GePNIC: `tripuratenders.gov.in/nicgep/app` | Adapter exists. Two independent sample packets exceeded size limits; that sample does not establish success. |
| Arunachal Pradesh | GePNIC: `arunachaltenders.gov.in/nicgep/app` | Adapter exists. Independent sample had a timeout and an oversized packet; do not label these passes. |
| Manipur | GePNIC: `manipurtenders.gov.in/nicgep/app` | Two recorded packet successes. |
| Meghalaya | GePNIC: `meghalayatenders.gov.in/nicgep/app` | Two recorded successes; one included a scanned notice. |
| Mizoram | GePNIC: `mizoramtenders.gov.in/nicgep/app` | Adapter exists. Additional sample link returned an unexpected page before identity resolution. |
| Nagaland | GePNIC: `nagalandtenders.gov.in/nicgep/app` | Two recorded successes; scanned PDFs present. |
| Sikkim | Public notice: `www.sikkim.gov.in/tender/tender-info/<id>` and allowed tender PDFs | Source-specific parser exists; no successful sample asserted by this audit. An unambiguous closing date/time is required for automatic tender creation. |
| GeM for Northeast | Public PDF: `bidplus.gem.gov.in/showbidDocument/<id>` | Recorded `GEM/2026/B/8020218` success: bid, buyer specification and GTC. Requires explicit NE buyer or consignee evidence; an unidentified attachment remained a partial warning. This is not a general GeM login/search/award adapter. |
| Central procurement / CPPP | GePNIC: `eprocure.gov.in/eprocure/app` | Two recorded independent successes. Current task also reports `2026_MoRTH_926483_1`: two PDFs, BOQ and original ZIP; this audit did not rerun it. |
| Defence | GePNIC: `defproc.gov.in/nicgep/app` | Registered protocol adapter. No new live successful packet asserted here. |
| PMGSY | GePNIC: `pmgsytenders.gov.in/nicgep/app` | AS082133 / `2026_CEASM_149637_7`: recorded six PDFs, BOQ and ZIP. Two other recorded packets contained inconsistent official NIT attachments; binary success did not prove semantic completeness. |
| NRIDA / former NRRDA | Official page/file discovery on allowed government hosts, including `pmgsy.nic.in` | No dedicated NRIDA adapter. Earlier notice/PDF requests timed out. Some notices refer onward to GeM; the cited bid must be resolved and validated. Do not promise a complete packet from a noticeboard PDF. |
| Central PSU eTenders | GePNIC: `etenders.gov.in/eprocure/app` | Registered shared adapter. This does not cover every PSU's independent procurement product. |
| Coal India | GePNIC: `coalindiatenders.nic.in/nicgep/app`; allowed corporate files | Recorded `2026_CCL_366412_1` success; another sample had no download links. |
| IOCL | GePNIC: `iocletenders.nic.in/nicgep/app`; allowed corporate files | One recorded sample success and one binary timeout. |
| NTPC | GePNIC: `eprocurentpc.nic.in/nicgep/app`; allowed corporate files | Two recorded successes. RAR attachments were preserved but not unpacked; scanned documents remained extraction warnings. |
| “NIC GePNIC / GETNIC” | Shared adapter only for the 15 registered hosts | A platform name is not a portal identity. Additional NIC installations require explicit host/path registration and verification; they are not automatically accepted. |
| NBCC | Allowed direct files/one-level pages on `nbccindia.in` | NBCC's `nbcc.enivida.com` system has **no working dedicated adapter**. Its public search is a distinct session/CAPTCHA workflow; earlier Chrome navigation worked but equivalent HTTP navigation returned an error page. |
| West Bengal | GePNIC: `wbtenders.gov.in/nicgep/app` | Two recorded packet successes. |

The broad official-host allowlist also includes government/institution suffixes and named PSU domains. An allowed host is a retrieval boundary, not evidence that its forms, attachment URLs or metadata extraction work.

## What validation does and does not establish

- Search results are leads. Explicit tender IDs, references and package evidence are checked; conflicting IDs/packages are rejected. Automatic alternative selection requires identity evidence and rejects ambiguous rounds. Title-only fallback remains weaker than an exact identifier.
- GePNIC verifies the opened tender identity, listed document manifest, availability and supported size before paid retrieval. Binary type/signature checks, archive bounds and hashes protect against saving an error page as a document.
- Public/direct adapters validate their supported URLs and redirects, byte limits and file types. Generic official-page discovery inspects the selected page plus at most three relevant child pages on that host, one level deep. It does not recursively crawl, submit forms or execute JavaScript.
- Source-specific required fields must be present before automatic tender creation. Some files can be retained as private review artifacts when fields cannot be established.
- Shared saved-file reuse checks canonical identity and stored originals before another download. It preserves partial/extraction warnings. It does not automatically refresh later amendments or certify that an existing packet has every future document.
- Portal sessions are bounded, paced and CAPTCHA-limited. Two sessions per portal are allowed; excess requests wait within the job budget. Genuine upstream cooldowns block new sessions across both slots. Already-running sessions retain their client-level pacing/error handling.
- PDF bytes do not establish readable text. Automatic OCR is not the verified extraction path; preserved originals allow later extraction without another download. RAR preservation is not RAR extraction. A site's own incorrect attachment is still possible, as the PMGSY examples show.

## Remaining adapter work, in order

1. **NBCC eNivida:** establish a reproducible public session and implement its own search CAPTCHA, tender identity and attachment protocol. Validate one real packet before advertising automatic support.
2. **NRIDA noticeboard:** prove a current page/file retrieval; distinguish direct notices from notices referring to GeM/PMGSY/CPPP. Keep source-unavailable and review-required outcomes explicit.
3. **Coverage validation:** choose one small, current, exact-ID packet for Tripura, Arunachal, Mizoram, Defence, central eTenders and Sikkim. Existing registration is not certification. Avoid repeating the known oversized/closed samples.
4. **Other official systems:** add a named adapter only after inspecting the actual site protocol. Use the existing direct-file/one-level path for static official notices; do not guess GePNIC endpoints for other software.
5. **Extraction completeness:** separate future OCR/archive support from download coverage and preserve source-field disagreements for review.

## Evidence and code pointers

- [Independent official sample](tender-official-verification.md): per-record successes, failures, extraction limits and PMGSY attachment inconsistencies.
- [GeM, PMGSY and saved-file reuse](tender-furniture-fixes.md): exact identifiers, verified originals, integration behavior and remaining warnings.
- [NBCC and NRIDA investigation](tender-nbcc-nrida-verification.md): observed public navigation and unresolved retrieval paths.
- [One-level discovery research](tender-linked-download-research.md): source observations and fixture-only capabilities.
- Runtime registry: `lib/desk/portal-import/identity.mjs`; public adapters: `public-notice.mjs`; static files/pages: `direct-document.mjs`, `page-discovery.mjs`; orchestration: `service.js`.

Older `tender-portal-unified.md` statements saying only Assam was verified or GeM always needs manual intake are superseded by the later evidence above. This document does not modify runtime behavior or upgrade unverified portals to “working.”
