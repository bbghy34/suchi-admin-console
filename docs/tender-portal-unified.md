# Unified Tender Portal release

Branch: `codex/tender-portal-unified`.
Reviewed and retested 1 October 2026 (IST). This is a feature branch, not a production deployment.

## Branch reconciliation

Fetched all branches from `boatbrotherspvtltd/suchii-group-operation-console-prod` and inspected the repository's pull requests and forks. No forks were returned. Every remote branch below is already an ancestor of the unified branch; no unique commit was discarded or reapplied. Existing source branches and the parallel checkout were preserved.

| Source | Reviewed tip | Inclusion |
| --- | --- | --- |
| `main` | `3f08b26` | Base, including the merged tender and billing PRs |
| `feat/tender-desk` | `eafcef1` | Already merged in main |
| `bill-update` | `162e2d7` | Already merged in main |
| `bill-system` | `b4088c4` | Already included in the history |
| `codex/tender-desk-fixes` | `febde9c` | Included in the ingestion branch; authored by Dhawal Upadhyay |
| `codex/assam-tender-ingestion` | `045271b` | Starting tip for this unified branch; includes the four subsequent integration/UI commits |

There was no additional Dabal-named branch in the fetched repository. The two Dhawal-authored branches above are both included. A separate private repository or unpushed branch cannot be claimed as included without its location.

## Complete change inventory relative to main

1. **Official tender retrieval:** selected Gemini search result → resolve official identity → choose a notice when ambiguous → retrieve official original documents → validate files → extract text/BOQ metadata → save tender, originals and provenance together. Saved tenders are reused without fetching the government portal again.
2. **CAPTCHA and traffic controls:** 2Captcha integration, repeated challenges, rejected-answer recovery, request spacing, per-host lease, cooldown/backoff, bounded payloads and deadlines. Progress is streamed to the user. No scheduled heavy government crawl is installed.
3. **Incremental CLI:** one-month bootstrap default, date/limit flags, SQLite checkpoints, resume after interruption, cumulative CSV outputs, document versions, extraction, metrics and debug logs. Completed tenders are skipped on routine subsequent runs.
4. **Tender lifecycle:** selection and notification frequency, requirements summary/checklist, pre-bid EMD, post-award SD, completion certificate, release eligibility date/conditions, refund drafts by office, acknowledgement, release and closure. Refund applications support cancellation/rejection corrections and concurrent-update protection.
5. **Desk integrity:** credential revocation and role checks, safe document responses, atomic refunds, summary lease/checklist preservation, date-aware reminders, daily cron authentication and removal of automatic fake sample creation.
6. **Search and usability:** normal-language search, retained evidence, official-file action, clear retrieval/error states, elapsed time, return-to-search, expandable filters, general console loading panels and phone-app guidance.
7. **Console fixes:** BOQ batch validation and surfaced load failures, stale-response handling, attendance totals across pagination, honest unflagged labels, pending warehouse/export actions and working error recovery navigation.
8. **Additional consolidation fixes:** award/stage/completion writes now save status, document and activity atomically with a version check. Negative award amounts are rejected. Notification failures after these saves do not report the already-saved action as failed. Dashboard requirement lists expand on demand and include the tender stage.

The base Tender Desk, bills, parties, warehouse and employee modules existed before this work. This branch integrates and repairs them; it does not claim they were all created from scratch.

## Fresh verification

| Check | Result |
| --- | --- |
| Node importer, streamed-progress and console-feedback tests | 32 passed |
| Python incremental ingestion and production-behavior tests | 33 passed |
| Desk HTTP regression suite against disposable local PostgreSQL | 25 passed |
| Desk service, reminders and transaction rollback tests | 9 passed |
| Console API and connected workflows against isolated validation schema | 92 / 92 passed in a fresh full run |
| Full Tender Desk lifecycle | Passed: manual upload, selection/frequency, preparation, EMD, bid, award, SD, execution, completion, eligibility gate, refund acknowledgement/release, closure |
| Saved official document integrity | NIT, 61-page PDF, workbook and ZIP served with matching hashes; duplicate retrieval reused saved files |
| Migration compatibility | Created main's schema in a disposable database, applied both new migrations, then compared with the unified Prisma schema: no differences |
| Production build | Passed |
| Chrome | Normal-language `road construction Assam` search → online results → matching-notice choice → already-saved official tender → details/documents; loading states visible |

The new transaction tests force a stale update and an invalid activity relation. They verify that neither case leaves a changed stage or saved document behind. Expected constraint errors in those test logs are assertions of rollback, not failed tests.

The lifecycle and module tests used the explicit `codex_portal_validation` schema and SQL search path on the supplied database. The HTTP/service suites used a separate disposable localhost database. Synthetic fixtures are retained for inspection. This run made no new government-document downloads; prior live Assam evidence remains in `tools/assam-tenders/VERIFICATION.md`.

## Release boundaries

- Only Assam has full live official-download verification. Other allowlisted GePNIC portals share the adapter and have protocol tests, but are not individually certified. GeM, NBCC Enivida and unsupported notice boards use manual intake.
- New BOQ/photo/bill object-storage uploads still need configured S3/GCS credentials and a real upload/download smoke test. Tender Desk originals stored in PostgreSQL were verified separately.
- No physical Site Manager app was tested; its authenticated attendance and leave APIs were tested. The approved installer link remains an administrator-provided item.
- Before production rollout, apply the two committed additive migrations through the deployment's properly baselined migration process. Configure database, CAPTCHA/AI keys, object storage and `CRON_SECRET`; the hosting runtime must support the retrieval timeout. A clean local migration test does not baseline an existing production migration history.
- Notifications described here are console Inbox records. Refund submission to government offices remains a staff action; the app prepares and tracks the application.
- Existing sample records and assignments are retained. Production sample cleanup requires a deliberate data review, not automatic deletion.

## Review links and commands

- Compare all code: `main...codex/tender-portal-unified` on GitHub.
- Detailed console coverage: [console-verification.md](console-verification.md).
- Import usage and supported sources: [retrieval README](../tools/assam-tenders/README.md).
- Prior live-file evidence: [verification](../tools/assam-tenders/VERIFICATION.md).
- Security/refund regression setup: [Tender Desk review](tender-desk-review.md).

```sh
npm run build
node --test scripts/test-official-tender-import.mjs scripts/test-import-progress.mjs scripts/test-console-feedback.mjs
cd tools/assam-tenders
.venv/bin/python -m unittest test_ingest test_production
```

The live integration scripts have isolation guards. Follow their documented local database/server setup instead of weakening those guards. Credentials and local evidence remain ignored by Git.
