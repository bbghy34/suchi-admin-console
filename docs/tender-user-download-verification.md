# Independent verification of the latest user download

Verified from saved original files and extraction report, without new portal requests or frontend changes.

- Request: `bc39e8e4-a533-45ff-b708-44d5775abeed`
- Tender: `2026_BSF_927326_1` (Central procurement)
- Saved record: `f0bbb103-efd8-4d98-8293-b57886bc6c66`
- Total request: **103,837 ms** (1 minute 43.837 seconds).
- CAPTCHA waits: **11,547 + 69,991 = 81,538 ms**, about **78.5%** of total time. The remaining 22,299 ms covers other processing; it is not a separately measured download duration.
- Recorded portal metrics: 9 requests, 0 retries, 2 CAPTCHA tasks, 0 rejected answers, USD 0.002 solver cost, 2 download responses.

## Result

**The downloaded notice and BOQ belong to this tender. The key tender values are corroborated by the PDF.** This is a verified document retrieval, not a verification of bidder eligibility, digital signature trust, or future corrigenda.

| Field | Independent file evidence | Comparison with saved record |
|---|---|---|
| Work | Lighting upgrade with mini mast/street lights near Gate 02 toward Gym, FTR HQ BSF Guwahati | Matches PDF cover and BOQ cell A5; punctuation/hyphenation varies |
| Reference | `01/NIT/FTR/GHTY/ENGG (E)/2026-27` in PDF and BOQ A6 | Portal uses shortened year `26-27`; retain both source strings |
| Estimated cost | ₹2,86,790, PDF cover and detailed NIT | Matches 286790 |
| EMD | ₹5,736, PDF cover and detailed NIT | Matches 5736 |
| Completion period | 60 days, PDF cover and detailed NIT | Matches captured official field `Period Of Work(Days)` |
| Closing | 05 October 2026, 10:30 IST, detailed NIT | Matches saved `2026-10-05T05:00:00.000Z` |
| Opening | 06 October 2026, 11:00 IST, detailed NIT | Matches captured official field |
| Location | Patgaon/Guwahati, Assam 781017 | Confirms Northeast work location despite central source |

## Files and integrity

The report records matching original/stored SHA-256 and repeated text extraction for both primary documents. Parent verification also checked all four authenticated serving endpoints and matched their response bytes to saved originals.

| File | Size | Verification |
|---|---:|---|
| Tendernotice_1.pdf | 501,419 bytes | 30 pages; 65,570 stored extracted characters; SHA-256 `b60c392dd3480d68fdc4f665b0b03079075341c42bed664aa2d1552ebd5abca2` |
| BOQ_974499.xls | 299,520 bytes | Two sheets; 11,863 extracted characters; SHA-256 `0f4c47ce28ed9e657b3d59c91e76b826024f2d36ab57d6d6bfd3d2c18878133e` |
| official-work-items.zip | 115,612 bytes | Contains the exact same BOQ bytes; original archive retained |
| official-record.txt | 186,757 bytes | Generated provenance record, not a third government attachment |

The portal transferred PDF plus compressed ZIP: 617,031 bytes. The 299,520-byte uncompressed BOQ is retained in addition to its ZIP; these different totals are expected, not missing bytes. ZIP `NO_TEXT` is also expected because its BOQ was extracted separately. Its serving MIME was generic `application/octet-stream`, with attachment disposition; bytes were correct.

## BOQ audit: eight real items, no macro execution

Read using the XLSX parser as data only. VBA bytes exist in the workbook but were **not executed**; no Excel application or macro engine was used. The original signed/template file remains unchanged.

The actual work schedule is `BoQ1`, rows 13–20:

| Row | Item | Quantity | Unit |
|---|---|---:|---|
| 13 | FRLS insulated copper cable | 130 | metre |
| 14 | Power cable laid directly in ground | 150 | metre |
| 15 | Power cable in existing duct/pipe | 50 | metre |
| 16 | Earthwork excavation | 17.28 | cubic metre |
| 17 | Plain cement concrete | 1.08 | cubic metre |
| 18 | Reinforced cement concrete | 4.62 | cubic metre |
| 19 | Centering and shuttering | 14.7 | square metre |
| 20 | Seven-metre octagonal lighting poles | 10 | each |

**Do not interpret the BOQ's zero totals as a zero tender value.** Bidder rate cells M13:M20 are blank; cached total formula values are zero because this is an unpriced bid template. The verified estimated tender value comes from the NIT and official notice.

## Metadata gaps and source inconsistencies

1. **Workbook presentation metadata was missing from the saved extraction at audit time.** `BoQ1` is very hidden (`Hidden: 2`); `Macros` is the visible instruction sheet. Column F (labelled estimated rate) is hidden and contains small template values. Far-right columns IE:II contain unrelated sample descriptions such as sluice-valve chambers. Full CSV text includes these cells, so treating every extracted cell as an actual tender line is misleading. Preserve sheet/column visibility metadata and distinguish the eight work rows from template examples. Original bytes already preserve the full workbook.
2. **Organisation chain is inconsistent in the official source itself.** The portal says `DG,BSF,MHA||ANO FTR(Bangalore),BSF,MHA`, while the PDF, work title, address and BOQ identify Guwahati. Preserve this discrepancy and do not convert the work location to Bangalore from the organisation chain.
3. **Reference formatting differs.** Portal `...ENGG(E)/26-27` and document `...ENGG (E)/2026-27` refer to the same notice. Keep original values rather than silently overwriting provenance.
4. The report exposes captured period/opening/location fields but does not expose every normalized database column. Their persistence beyond the provenance record is not independently established by this report alone.
5. PDF metadata reports signature presence; this does not validate the certificate, signer, or signature trust. The workbook's old creation date reflects its template history and is not the tender publication date.

## Evidence

Local ignored evidence folder: `tools/assam-tenders/verification/user-download/` contains `report.json`, original PDF/XLS/ZIP, provenance record, and saved text. No credentials are included in this document.

## Follow-up correction: workbook-v2

The backend extractor now preserves sheet visibility, column/row metadata, defined names, declared print areas, formula strings/cached values, and whether macro bytes are present. Text separates primary visible cells within an unambiguous print area from labelled supplementary hidden cells and cells outside that area. Nothing is silently discarded, including the very hidden BOQ sheet.

A fresh local extraction of this original XLS identifies `BoQ1!$A$1:$BC$23`, marks BoQ1 very hidden, detects VBA without executing it, retains 1,228 cells from BoQ1, and excludes unrelated sluice examples from the primary schedule section. Its text is 10,522 characters. Unsupported union print areas fall back to all visible cells rather than guessing a region. Three synthesized regression tests pass, including hidden fields, union areas and inert macro detection.

This correction does not itself rewrite the previously saved database text. Re-extraction/persistence of that record must be tracked explicitly by the caller using metadata `extractionVersion: workbook-v2`.

### Applied extraction refresh

At `2026-09-30T19:01:42.572Z`, the verified `workbook-v2` extraction was saved to this local test record in one transaction. The original XLS bytes and SHA-256 stayed unchanged. The revised text contains 10,522 characters and the provenance record records the extraction revision and prior provenance hash. Cached AI summary data was cleared so later summaries use the corrected extraction. A second database read confirmed the saved text and unchanged original.
