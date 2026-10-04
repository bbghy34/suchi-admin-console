# Tender Desk and console latency review — 1 October 2026

## Changes

- Identical in-flight public searches share their existing Gemini work. Twelve concurrent equivalent searches make three grounded Gemini calls rather than thirty-six. Successful results remain cached for 15 minutes; failures are not retained. Caches are bounded and local to each server process.
- Duplicate grounding citations are combined before the result cap. Repeated grounding redirects share a bounded cache and unused response bodies are canceled. Exact URL case and grounded document links are retained.
- Desk account checks still reload account status, credential validity and role on every request. Independent source/profile/settings reads now run together, with two setting reads combined into one. Fetch-assignment queries take two dependency rounds instead of four. Search starts the assignment read alongside its other work; notifications fetch items/count together.
- Job polling normally uses one owner-scoped list read instead of an active-job read followed by a second list read. Stale jobs still use conditional updates and one completion notification.
- Warehouse consumption/valuation aggregate transactions in PostgreSQL. The server receives one total per material instead of the transaction history. Inward/outward reports select only displayed fields. Dashboard site totals use relation counts. General-report option queries run concurrently.
- Online results use one batch identity lookup to show already-saved tenders. Saving files also saves the tender; the action is explicitly labelled **Save tender & files**, then **Saved · Open tender**. Shared file reuse retains completeness warnings and validates stored originals.
- Automatic source selection uses exact ID/package/reference or a strong unique title match. Preference cannot override project identity. Competing package rounds require explicit dates and one remaining open round. Unresolved ambiguity ends with a clear failure rather than a source-selection prompt. Official-copy follow-up is bounded to two selections and one shared 270-second deadline. Opened/downloaded notice identity is checked before saving.
- Suggested searches appear on the dashboard and search page. Ask AI chat controls are removed; AI search and document summaries remain.
- Navigation separates **Downloads** (job history), **Portal review** (assigned daily checklist), and **Notifications** (download results, deadline and money reminders). Duplicate bell navigation and idle download-status strip are removed. Portal review no longer repeats the full shell data query.

## Verification and coverage

The existing 92-check console integration suite passed before and after the backend refactor. It covers dashboards, projects, sites, BOQs/items, employees, departments, designations, attendance, leave, firms, contractors, progress, expenses, warehouse operations/reports, parties, bills, payments, report endpoints, invalid inputs and role boundaries. Fixtures were created only in the disposable local database.

Tender lifecycle/API suite: 37 passed. Background-job HTTP suite: 37 checks passed, including cross-user isolation, shared saved-file reuse, role checks, durable completion and notification deduplication, with zero government requests. SX visibility HTTP suite: 15 passed. Job persistence tests: 8 passed against database transactions. Automatic-selection worker tests: 2 passed, including a shared deadline and rejecting a wrong project. Focused search/report/cache/selection tests: 27 passed. UI job-status tests: 8 passed. Notification display/filter/error-recovery tests: 3 passed. Chrome verified the Downloads notification filter and Daily portal review navigation, checklist and formatting.

Production build passed in the isolated checkout. Basic source checks confirmed fresh permissions, owner-filtered job access, bounded input, exact grounding-host validation and no server-followed arbitrary grounding redirect. No security scan was performed; the initially created scan was canceled at the user's request.

## Timing interpretation

`scripts/benchmark-console-latency.mjs` records six warmed samples per endpoint after one warmup, using only a local disposable database. In this small dataset, representative medians were:

| Endpoint | Before | After backend refactor |
| --- | ---: | ---: |
| Dashboard | 4.93 ms | 4.40 ms |
| Project report | 2.20 ms | 1.64 ms |
| Warehouse consumption report | 2.01 ms | 1.72 ms |
| Desk jobs | 2.82 ms | 1.98 ms |
| Desk search, no external query | 16.20 ms | 15.03 ms |

Some endpoints varied upward (BOQ 2.07 to 2.52 ms; valuation 1.88 to 2.38 ms). These small local differences are not evidence of a universal production speedup. The defensible benefits are reduced external-call counts, database dependency rounds and transaction payload size. Timings precede the final navigation and saved-status refinements.

## Limits

Unique uncached searches still perform three parallel grounded searches to preserve coverage; Gemini, government portal response times and CAPTCHA solving remain external delays. No CAPTCHA pacing/backoff was removed. Existing PDFs are reused; new amendments are not silently refreshed by this change. Review did not live-download every government portal or exhaustively test every UI screen. Projects keep their existing sites/BOQ response fields because consumers use them. Private pending-review artifacts remain owner-scoped.

Local preview is updated separately from the Git branch. Production deployment is not included.
