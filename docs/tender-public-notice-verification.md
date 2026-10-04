# GeM public notice verification

Final live adapter run: 1 October 2026 at 00:29 IST (30 September, 18:59 UTC). Exactly one bid was retrieved; no database writes or frontend edits were made.

## Verified result

[Official bid](https://bidplus.gem.gov.in/showbidDocument/9780729): **GEM/2026/B/7939158**.

- Buyer state: **Assam**, explicitly labelled in the bid PDF.
- Organisation: Directorate Of Elementary Education; Education Department Assam.
- Items: desktop computers, line interactive UPS and computer printers.
- EMD: **₹520,000**.
- Closing: **1 October 2026, 10:00 AM IST**.
- Opening: **2 October 2026, 10:00 AM IST**.
- Retrieval and independent extraction completed in **16.496 seconds**, using **7 HTTP requests**, **1,563,119 received bytes**, and **no CAPTCHA**.

The bid ID, buyer state, title, EMD and deadline passed explicit assertions against the previously inspected official PDF. Every saved file's SHA-256 matched its adapter manifest. Each PDF was independently parsed after retrieval. All three catalogues contained both “Catalogue values for” and “Bid Requirement”. No PDF teardown or extraction error occurred.

| Saved original | Bytes | Extraction |
| --- | ---: | --- |
| `bid-9780729-1.pdf` | 160,665 | 15 pages; 47,776 text characters |
| `catalogue-9780729-2.txt` | 102,140 | 2,938 text characters |
| `catalogue-9780729-3.txt` | 99,399 | 2,388 text characters |
| `catalogue-9780729-4.txt` | 101,616 | 3,094 text characters |
| `attachment-9780729-5.pdf` | 358,079 | Buyer attachment: 23 pages; 51,808 text characters |
| `attachment-9780729-6.pdf` | 741,220 | General terms: 57 pages; 146,068 text characters |

Catalogue originals retain the official HTML bytes with a `.txt` extension, and extraction removes scripts and styles. They are not active HTML documents.

## Completeness limitation

The packet is correctly marked **partial**. The primary PDF also references `https://bidplus.gem.gov.in/bidding/downloadOmppdfile/`; this URL was recorded as `referenced-not-downloaded` because the adapter does not support it. There were **zero failed attempted downloads**, but this unresolved reference prevents a complete-packet claim. GeM public PDF retrieval does not prove that every amendment or document outside the primary PDF's references was collected.

## Local evidence

Ignored output folder: `tools/assam-tenders/verification/gem-final/`.

- `summary.json`: all checked fields, original sizes and hashes, extraction counts, request metrics and download outcomes.
- `evidence.json`: source text, parser result and completeness evidence.
- Six original files and six separate `.text.txt` extractions.
- `run.mjs`: bounded one-bid verification runner and assertions.

This verifies retrieval and extraction. It does not test database persistence, the portal-import HTTP route, or production UI behavior.
