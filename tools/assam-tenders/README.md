# Tender retrieval and Tender Desk integration

The consolidated release branch is `codex/tender-portal-unified`. See [the full branch inventory and fresh verification](../../docs/tender-portal-unified.md).

Two entry points share the same public-portal protocol:

- **Tender Desk:** choose a search result, then **Get official files**. The server identifies the portal and Tender ID from cited links and known authority codes, resolves official detail links or references, and uses grounded discovery when evidence is missing. Ambiguous matches are shown as named notices to choose; the normal flow has no portal dropdown or Tender ID entry. Every download still verifies the exact ID on the official portal.
- **Assam CLI:** incremental published-date discovery, original documents, full extraction and CSV exports. This is a deterministic Python program; only CAPTCHA recognition uses 2Captcha.

## Web setup

From the repository root, install dependencies with `npm ci`. Set server-only `DATABASE_URL`, `JWT_SECRET`, `TWOCAPTCHA_API_KEY`, and `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). Never use `NEXT_PUBLIC_` for these keys. Gemini performs discovery and document summaries; government retrieval itself does not use an LLM.

Apply the committed Prisma migrations using the repository's deployment procedure (`npx prisma migrate deploy` on a database with its migration baseline established), then `npm run build`. The source-scope migration updates existing source records and adds optional SD release eligibility fields. Do not run `db push` against production as a substitute for migration review.

Run locally with `npm run dev -- --port 3217`. The tested local setup uses a separate `codex_portal_validation` schema, with the database connection's SQL search path set to that schema too. On Neon, the direct endpoint supports this connection option; merely specifying Prisma's `schema` parameter does not isolate raw SQL on the pooled endpoint.

### Retrieval coverage

The allowlist contains Assam, Tripura, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, West Bengal, CPPP, national PMGSY, IOCL, NTPC, Coal India and Defence GePNIC portals. The shared adapter uses each host's base path, current forms and cookies. **Only Assam has a full live download verification in this change.** Other registered portals use the same tested protocol but may fail closed on differences; they are not individually certified.

GeM, NBCC Enivida, Sikkim notice boards and other vendor systems retain the manual intake path. Their download protocols are not implemented here. Do not add a hostname simply because it contains “government” or looks similar.

Scope: all eight NE state sources; GeM NE only; CPPP/Defence/central PSUs/Coal India/IOCL/NTPC/NBCC all India; West Bengal separately. A user search explicitly asking for NE still restricts work locations.

### Behaviour and limits

- Assigned fetcher, backup or admin can import. Existing `(source, tender ID)` opens the saved tender without another government request.
- One concurrent retrieval per host, minimum two seconds between requests, persisted cooldown on 429/503. Safe GET retries use backoff. Form POST failures are not blindly replayed.
- Up to four paid CAPTCHA tasks and three attempts per challenge; transparent images are flattened onto white and enlarged, preserving case.
- Closed notices with filenames but no download links stop with a clear unavailable message; official detail-link checks do this before CAPTCHA. The UI shows elapsed seconds and stops waiting after 270 seconds.
- Retrieval deadline 240 seconds; route maximum 300 seconds. Hosting must support that duration. Long or unusually large packets fall back to manual upload.
- 20 MB per extracted document, 50 MB of downloaded payload per packet, 40 ZIP members, 12 download requests. Unsafe ZIP paths and duplicate names are rejected.
- All listed files must validate before atomic save. HTML login/CAPTCHA responses cannot become fake PDFs. PDF text includes every page up to a 1,000-page safety bound; BOQ cells and formulas are retained without executing macros.
- Original files, original ZIP, hashes, sizes, PDF/workbook metadata and sanitized official detail evidence are saved. `official-record.txt` records capture scope and provenance. Binary originals remain available if extraction fails.
- Linked corrigendum/award history is not automatically captured. Future amendments require a deliberate check. This feature does not promise that no future backfill will ever be needed.
- Imports are user-triggered. They do not install a scheduled government crawler. Daily employee assignments and reminders use the existing desk schedule.

Selection starts frequent reminders and an AI requirement summary/checklist. EMD can be entered while preparing a bid. SD follows award. Completion captures the certificate and optional SD eligibility date/conditions; future eligibility blocks refund drafting. Refunds are drafts for staff to submit, followed by acknowledgement and actual release recording. No external office is contacted automatically.

Structured `portal_import` server events include request ID, phase/status, request count, retry count, CAPTCHA tasks/cost, bytes and outcome. Ordinary logs omit API keys, CAPTCHA images/answers and session tokens. Search results remain discovery evidence; official data is saved separately.

## CLI installation

Requires Python 3.10+, curl, and Poppler (`pdfinfo`, `pdftotext`).

```sh
cd tools/assam-tenders
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env.local
# Put TWOCAPTCHA_API_KEY in .env.local; keep this file private and ignored.
```

### Small initial test

```sh
./run.sh --output-dir data/water-resources \
  --organisation 'Department of Water Resources' \
  --lookback-days 30 --limit 2 --max-downloads 3 --max-captcha-tasks 6
```

Default bootstrap is one calendar month before `--until` (today in IST). `--since YYYY-MM-DD` selects an explicit start instead. A test cap is per invocation, not permanent. Omitting `--organisation` searches every organisation; use explicit organisations to keep traffic low.

### Daily incremental run

```sh
./run.sh --output-dir data/water-resources \
  --organisation 'Department of Water Resources' \
  --limit 20 --max-downloads 40 --max-captcha-tasks 30
```

Reuse the output directory and filters. Complete tenders are skipped; unfinished work resumes. Discovery advances only after complete pagination and successful processing. A two-day overlap protects publication boundaries without re-downloading completed tenders. Old tenders are not rechecked daily. This deliberately does not detect every later amendment to an older tender.

Useful controls:

```sh
./run.sh --output-dir data/water-resources --status
./run.sh --output-dir data/water-resources --reextract
./run.sh --output-dir data/water-resources --organisation 'Department of Water Resources' --refresh-known --limit 2
```

`--refresh-files` also requires `--refresh-known`; `--rescan` rediscovers the stored bootstrap interval. `--query`, `--until`, `--delay`, `--retries`, `--overlap-days`, and `--solver manual|2captcha|module:function` are available in `--help`. All bounds stop cleanly and retain progress.

### Outputs

`state.sqlite` is the checkpoint/source of truth. Atomic cumulative `tenders.csv`, `documents.csv`, `document-versions.csv` and `checkpoint.json` are rebuilt from it. Originals live under `downloads/` and content-addressed storage; extracted full text, spreadsheet cells and evidence snapshots are retained. CSV formula prefixes are escaped without changing raw database values. Per-run JSON/JSONL logs retain request metrics, errors, paid-task totals and resumable outcome. Private output directories are ignored by Git.

## Verification

```sh
node --test scripts/test-official-tender-import.mjs
cd tools/assam-tenders
.venv/bin/python -m unittest test_ingest test_production
```

The real local lifecycle test is `scripts/test-tender-workflow.mjs`. It requires the explicit isolated schema/search path, local server URL and `LOCAL_TEST_EMAIL`/`LOCAL_TEST_PASSWORD`; it refuses a general production connection. It uses a previously bounded live packet and adds clearly labelled lifecycle fixtures, with no further government downloads.

See [integration design](INTEGRATION-DESIGN.md) for architecture and [verification notes](VERIFICATION.md) for observed results and remaining limits.

### Progress in Tender Desk

The search UI uses `Accept: application/x-ndjson` on the import POST. It reads actual stage events followed by one final result; ordinary API/CLI callers still receive JSON. Each CAPTCHA challenge uses the server's `TWOCAPTCHA_API_KEY`, with bounded retries. The UI shows rejected-answer retries, download and extraction stages, elapsed time, and recovery links. It does not estimate a percentage or promise a fixed completion time. Keep the import page open; this is not a background job queue. Logs now contain elapsed stage timestamps. Search and summary screens also explain their wait separately.

Run progress protocol tests with `node --test scripts/test-import-progress.mjs scripts/test-official-tender-import.mjs`.
