# NBCC and NRIDA download verification

Checked 1 October 2026. These results are separate from the GePNIC download checks. No bidder login, registration, payment, bid submission, or frontend change was made.

## Result

| Source | Verified live | Actual tender bytes | Backend status |
| --- | --- | --- | --- |
| NBCC eNivida | Homepage and public Live Tenders search screen in Chrome | Not retrieved | Separate adapter still required; do not advertise automatic downloads as verified |
| NRIDA noticeboard | Official indexed notice and PDF references; current fetches timed out | Not retrieved | Noticeboard support remains unverified; retain official link and manual upload |

## NBCC: a distinct public search workflow

[NBCC eNivida](https://nbcc.enivida.com/) opens `/HomePage/ebidSites?siteName=nbcc`, whose normal JavaScript navigation opens `/HomePage/loadSiteHomePage/<opaque value>`. Clicking **Live Tenders** in Chrome successfully opened [the public search screen](https://nbcc.enivida.com/liveTenderSummary/livePublishedTenderSummary).

That screen asks for a CAPTCHA before displaying live tenders. It does **not** require bidder login just to reach this search screen. The observed form uses:

- Method: `POST`.
- Action: `/liveTenderSummary/livePublishedTenderWithSearchPage/<opaque value>`; discover this from the current form, never hardcode the observed value.
- Basic fields: `tenderNumber`, `itemId`, `itemDescription`, `location`, `captchainput`.
- Optional filters include tender/procurement category, estimated cost, EMD and date range.

Normal Chrome navigation worked, while fresh HTTP cookie-jar sessions following the observed homepage navigation and referer returned HTTP 200 with **“Sorry, we are unable to process your request.”** A standard client header did not resolve it. Therefore HTTP status 200 is insufficient to classify this portal as reachable or a download as successful. The mismatch is unresolved; it is not evidence that NBCC requires login or has no public tenders.

The search CAPTCHA was not submitted in Chrome, so the tender-detail, attachment, and download endpoints are **not verified**. Do not guess them from GePNIC URLs. A reliable NBCC adapter still needs a reproducible session, its own solver integration, a successful public search, and byte validation of a real tender packet. Existing GePNIC session tokens and CAPTCHA handling cannot simply be reused.

Local investigation evidence (temporary, not committed): `/private/tmp/nbcc-home.html`, `nbcc-home-functions.js`, `nbcc-investigation-list.html`, `nbcc-investigation-ua-list.html`, and `nbcc-live-functions.js`. Cookie files are intentionally excluded from the repository.

## NRIDA: notices can refer to another procurement system

The official [Announcements page](https://pmgsy.nic.in/annoucement) has indexed procurement notices mixed with recruitment and administrative announcements. It must not be treated as a list containing only tenders.

The official indexed [consultancy RFP](https://pmgsy.nic.in/sites/default/files/tenders/FinalRFPdocument.pdf) identifies GeM as its submission system. Its schedule points to the GeM bid document for dates. Thus an NRIDA PDF alone may not establish the complete tender packet or current closing date. Follow an explicitly identified bid to the correct procurement adapter; do not invent dates or infer an entire packet from one notice.

Current verification attempts:

- A direct homepage request timed out after 35 seconds.
- A direct request for the official RFP PDF timed out after 35 seconds, without a saved PDF.
- Independent web retrieval of both Announcements and that PDF also timed out.
- Search-index content provides discovery evidence only. It does not establish present availability, file hashes, or successful extraction.

No current NRIDA original was downloaded, so no file integrity or extracted-field result is claimed. The production flow should return a clear source-unavailable result, preserve the official URL, and allow a supplied official document to be uploaded. It should avoid repeated background retries while the source is unavailable.

## Acceptance criteria before enabling automatic retrieval

1. Reproduce the public session with bounded requests and the existing per-host lease.
2. Resolve the exact tender from source evidence, including its current deadline and reference.
3. Retrieve real originals; check response type, signature, size, and hash, rejecting error HTML even when HTTP status is 200.
4. Record missing or inaccessible attachments explicitly; a downloaded notice is not proof that BOQ, amendments, and buyer attachments were all collected.
5. Validate extraction separately from downloading. Scanned PDFs may be intact while yielding no text.
6. Preserve provenance and use backoff on source failures. A portal-specific failure must not trigger repeated searches across unrelated portals.
