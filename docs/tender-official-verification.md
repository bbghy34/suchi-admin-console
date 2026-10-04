# Official tender verification

## Independent sample method

The bounded live sample uses two additional homepage notices per selected official portal. The initial single-notice portal probe is excluded by tender ID. It does not crawl all listings or run the monthly ingestion job.

`node --env-file=.env.local scripts/verify-official-sample.mjs tripura arunachal manipur meghalaya mizoram nagaland west-bengal cppp pmgsy iocl`

The script runs at most two different hosts concurrently. Every portal client uses the shared downloader's request pacing, CAPTCHA budget, bounded retries and deadline. The script also pauses between notice clients. It never retries a completed sample automatically.

For each notice it retains:

- The source detail HTML and independently parsed source fields.
- Every returned original binary before attempting extraction.
- SHA-256 hashes, binary-signature checks, text extraction status, PDF page counts and workbook sheet counts.
- Identity and title/deadline/amount fields mapped for Tender Desk, with differences against the independent source parser.
- Separate PDF corroboration indicators for an exact tender ID, reference or title. Lack of a literal match is reported; it is not proof of the wrong file.
- Session, CAPTCHA, download, extraction and parsing failures separately, with elapsed time and request/solver metrics.

Local originals and detailed reports are intentionally ignored by Git under `tools/assam-tenders/verification/independent-sample/`. They may contain supplier or officer contact details. This document records only the public tender identifiers and aggregate results.

A successful download means verified binary bytes and the expected source identity. It does not mean scanned PDFs have readable text, every document type supports extraction, or the semantic contents have been fully audited. The UI was not changed by this verification work.

## Results — 1 October 2026 (IST)

The independent run attempted **22 newly selected tender records across 11 portals**, plus one Mizoram homepage link that failed before a tender ID could be read. The original single-notice probe was excluded.

- **16 packets downloaded**, with 74 original files retained (125,062,014 bytes, including ZIP archives and their unpacked files).
- **14 downloaded packet identities corroborated** by source fields plus extracted or rendered PDF content. Two PMGSY NITs have a content mismatch described below.
- **8 downloaded packets had text extracted from every supported PDF/Excel file; 8 contained at least one scanned/empty PDF.** Two of the latter also contained unexpanded RAR attachments. This separates extraction completeness from download success.
- **6 identified notices failed**: three packets exceeded the supported size, two binary downloads timed out, and one official notice had no download links.
- Every successful packet matched the independent source-field parser, numeric field mapping and manifest coverage. SHA-256 hashes of the saved files matched the recorded download hashes.
- Successful runs took 30.0–98.9 seconds; median 43.2 seconds. This includes opening the notice, CAPTCHA solving, download and extraction.
- The sample used 23 CAPTCHA tasks, including 2 rejected answers, with recorded solver cost US$0.023. Per-attempt metrics record 203 government requests; initial homepage discovery and reads of excluded probe records are not included in that count. The separate attachment check added 7 government requests and one CAPTCHA. No monthly ingestion ran.

The 22-record sample exercised retrieval, extraction and Tender Desk field mapping. It did **not** create 22 database records or test 22 authenticated UI saves. Those integration checks belong to the parent backend validation.

### Per-record outcomes

“Downloaded” below confirms binary retrieval, expected record identity, manifest coverage and source-field mapping. It does not assert that every PDF is text-readable or every value in the official source is correct.

| Portal | Tender ID | Retrieval | Seconds | Extraction / finding |
| --- | --- | --- | ---: | --- |
| arunachal | `2026_DRDAP_3684_2` | Failed | 180.7 | Binary request timeout |
| arunachal | `2026_DRDAP_3686_2` | Failed | 113.7 | Packet exceeds supported size |
| coal-india | `2026_CCL_366412_1` | Downloaded | 46.1 | Text extracted from supported files |
| coal-india | `2026_MCL_366308_1` | Failed | 4.5 | Official notice has no download links |
| cppp | `2026_ASI_928436_1` | Downloaded | 57.8 | Contains scanned/empty PDF; original retained |
| cppp | `2026_FCI_928289_1` | Downloaded | 63.3 | Text extracted from supported files |
| iocl | `2026_BD_191594_2` | Failed | 120.1 | Binary request timeout |
| iocl | `2026_MKTHO_191609_1` | Downloaded | 98.9 | Text extracted from supported files |
| manipur | `2026_DFE_3500_1` | Downloaded | 33.4 | Text extracted from supported files |
| manipur | `2026_MoIT_3501_1` | Downloaded | 45.3 | Text extracted from supported files |
| meghalaya | `2026_MBDA_2065_1` | Downloaded | 31.9 | Contains scanned/empty PDF; original retained |
| meghalaya | `2026_PHED_2066_1` | Downloaded | 30.0 | Text extracted from supported files |
| nagaland | `2026_DSE_838_1` | Downloaded | 31.6 | Contains scanned/empty PDF; original retained |
| nagaland | `2026_MVD_840_1` | Downloaded | 39.1 | Contains scanned/empty PDF; original retained |
| ntpc | `2026_NTPC_112287_1` | Downloaded | 57.3 | Contains scanned/empty PDF; original retained; RAR retained, not unpacked |
| ntpc | `2026_NTPC_112291_1` | Downloaded | 85.7 | Contains scanned/empty PDF; original retained; RAR retained, not unpacked |
| pmgsy | `2026_ENCPR_149590_6` | Downloaded | 40.0 | NIT content mismatch; see below |
| pmgsy | `2026_ENCPR_149590_7` | Downloaded | 41.1 | NIT content mismatch; see below |
| tripura | `2026_OSD_77376_1` | Failed | 98.8 | Packet exceeds supported size |
| tripura | `2026_OSD_77377_1` | Failed | 133.1 | Packet exceeds supported size |
| west-bengal | `2026_MAD_1043886_1` | Downloaded | 36.4 | Text extracted from supported files |
| west-bengal | `2026_WBSTC_1043890_1` | Downloaded | 55.0 | Text extracted from supported files |

Mizoram's additional homepage link returned an unexpected page in 5.0 seconds before an ID could be identified. It is excluded from the 22-record denominator. NTPC and Coal India supplied replacement fresh notices so the sample did not rely on a smaller denominator.

### Content and extraction limits

The 74 retained files include 39 PDFs (31 with readable extracted text and 8 without), 17 Excel workbooks, 16 ZIP archives and 2 RAR attachments. PDFs were independently checked with Poppler (`pdftotext`) as well as the production PDF.js extractor. The only text-presence disagreement was a scanned Meghalaya NIT: Poppler found 90 characters of digital-signature annotation, while neither extractor recovered the notice body. This is still a scanned-content gap.

Both NTPC notices contained a RAR attachment. Those archives were retained, but their contents were not unpacked or indexed. Automatic OCR is not part of the tested extraction path. Original preservation allows future OCR/archive extraction without downloading again for the successful packets.

The retrieved PMGSY notices `2026_ENCPR_149590_6` and `_7` both supplied the same 1,034,874-byte `Tendernotice_1.pdf`, SHA-256 `4974243c872383b58949835fba79bd2312938519160d3da5fb30b6b1133d3f97`. Visual inspection found NIT 36/37, packages AP34PIV004/AP34PIV001 and 30 September dates. Their official detail records describe NIT 41/42, packages AP2PIV001/AP34PIV003 and 6 October deadlines. Their BOQs and work schedules differ correctly. These packets are **not certified as semantically complete**. An independent follow-up on `_6` selected the single exact NIT row link after solving its gate, bypassing the production link map and ZIP selection. It returned the identical hash and size. The official “More Details” page still showed NIT 41, AP2PIV001 and the 6 October deadline, with no active corrigendum displayed. This confirms an inconsistent official attachment for `_6`; `_7` supplied the same NIT bytes. The follow-up used one additional CAPTCHA task (US$0.001), outside the sample totals. This is not a reason to overwrite the official detail fields with dates from the mismatching PDF.

Other content checks:

- Manipur `2026_MoIT_3501_1`: the 82-page RFP matches the reference, ₹300,000 EMD, ₹20,000 fee and 21 October 13:00 IST deadline. PDF line spacing required normalization for the reference match.
- Meghalaya `2026_MBDA_2065_1`: source reference uses `26-27`; the RFB uses `2026-27`. The project and 26 October 14:00 deadline match. The one-page NIT is scanned; the 278-page RFB text extracts.
- West Bengal `2026_WBSTC_1043890_1`: PDF title expands the locations covered by the shorter portal title. The portal's estimated value is ₹1; this is preserved as a source value and is not evidence of the project's real budget.
- CPPP `2026_ASI_928436_1`: the scanned first page visibly matches the Sarswati Devi Temple work and reference SC/4-4/3-2023-UPM.
- NTPC scanned notices visibly match enquiry numbers 9900334058 and 9900333949 and their corresponding material descriptions.

### Supported limits

The tested backend limits are 20 MiB per file, 50 MiB total expanded packet, 40 listed documents, four CAPTCHA tasks per retrieval and a 240-second overall deadline. Binary requests have a 90-second timeout bounded by the remaining deadline; ordinary page requests use 30 seconds. Government requests are paced at least two seconds apart within each client. The PDF extractor limits 1,000 pages; workbook extraction limits 100 sheets and 200,000 cells. ZIP originals are retained alongside unpacked listed documents.

These are explicit support limits, not claims that larger official tenders are invalid. Scanned PDFs and RAR contents need a later extraction path. The report does not certify complete semantic extraction for any packet merely because its binary download succeeded.

### Fixes prompted by this sample

The three oversized packets had advertised sizes above the supported limit. The parent backend added a manifest-size preflight so this case can fail before spending on CAPTCHA or downloading the ZIP. This sample's first process started before that preflight landed; the historical failures are retained as evidence rather than rewritten as passes.

The 90-second binary request timeout did not resolve every portal delay: one Arunachal and one IOCL ZIP still timed out. No unbounded retries were attempted. A later file failure prevents the current retrieval method from returning earlier partial files; those two packets therefore cannot be described as fully preserved.

The Coal India notice without file links failed before paid CAPTCHA. This is an official-page availability limitation, not a successful download.

### Reproduction and evidence

The main sample used the command above. Additional fresh notices were checked with:

`SAMPLE_CONCURRENCY=1 node --env-file=.env.local scripts/verify-official-sample.mjs ntpc coal-india`

Each detailed JSON lives under the ignored evidence directory named in the method section; the matching folder contains source HTML, originals and extracted text. `summary.json` additionally records independent numeric checks, disk-hash checks, manifest coverage and Poppler outcomes. Scanned pages were rendered with `pdftoppm` for identity checks. No frontend files were edited by this verification task.
