# Download recovery, Money overview and navigation — 1 October 2026

## Live verification

- CPPP `2026_MoRTH_926483_1`: fresh direct retrieval succeeded in 75.984 seconds. Saved `Tendernotice_1.pdf` (562,623 bytes), `NITDPR127D.pdf` (543,478 bytes), `BOQ_973609.xls` (326,144 bytes), and original ZIP (486,004 bytes). Hashes verified. Both PDFs parsed as two pages; BOQ text confirms the Rangia NH-127D/NH-715A DPR project. Three CAPTCHA tasks, one rejected; $0.003 reported cost.
- Originals, extracted text and official metadata saved to the local validation Tender Desk record `a9b95740-a1a9-4d96-854e-4859b0d2e3a6`. A normal background-job retry reused it in 772 ms with no portal requests or CAPTCHA. Original failed job history was preserved; recovery used a new job.
- Assam `2026_PWD_52998_1`: fresh direct check completed in 26.892 seconds. Search CAPTCHA accepted. Official download end was 31 July 2026; five filenames listed, no document gate or file links. The only “Downloads” anchor leads to generic standard bidding documents, not this tender's files. Nothing downloaded. This evidence does not prove no alternative official copy exists elsewhere.

## Fixes

- Preserve the real CAPTCHA/timeout error when a stale detail link falls back to exact-ID lookup. It previously replaced every fallback error with “different tender.”
- Two independent session slots per portal. Excess requests wait with progress instead of immediately failing. Waits are bounded and recheck ownership/access. Actual upstream cooldowns block new sessions across both slots. Paid CAPTCHA/download failures are not blindly replayed.
- Search results with explicit past closing dates are ranked lower and labeled as citation evidence, not proof files are inaccessible. Preferred official-source Gemini policy is documented in `official-download-coverage.md`.
- Money overview separates EMD held, SD held, refund requested and to arrange, plus saved work-category totals. Uses existing authorized records; no additional query or new tabs. Guarantees are face value, refundable deposits are not expenses.
- Tender Desk main navigation is Dashboard, My tenders, Money and More. More contains Downloads, Portal review, Notifications and authorized People access. Unread count, Escape/outside-click closing and role visibility remain.

## Validation

67 focused downloader, queue, search policy/date, Money and navigation tests passed. A live Gemini search for CPPP road construction in Assam returned six cited eprocure.gov.in results in 15.173 seconds. Real PostgreSQL concurrency test verifies two simultaneous owners, a waiting third request, shared cooldown, stale-owner protection and expiry. Production build passed. Chrome verified the compact menu, Money overview and saved CPPP documents. Local screenshots and downloaded originals stay in ignored verification storage; credentials were not added to Git.
