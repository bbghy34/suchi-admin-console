# Tender Desk: review, fixes and release checks

Reviewed 30 September 2026. Scope: Tender Desk APIs, pages, shared services and their authentication/database dependencies. Changes are on `codex/tender-desk-fixes`; production records were not modified.

## Priority and evidence

This targets the highest-impact findings from a source review and independent Claude review. “Top 80%” is prioritization, not a measured percentage of all possible defects.

| Priority | Confirmed problem | Change |
| --- | --- | --- |
| High | Desk accepted sessions after password changes and retained admin privileges after console demotion | Validate credential version and active employee; cap desk roles at current console permissions; apply the cap to Accounts recipients |
| High | Uploaded `.pdf` files could carry `text/html` MIME and execute as same-origin HTML | Validate uploads, derive response MIME from extension even for existing records, restrict inline types, sandbox attachments, prevent MIME sniffing, prevent global CSP from overriding document policy |
| High | Refund form called a nonexistent endpoint | Correct application API URL; verified the actual browser flow through applied, acknowledged and released |
| High | Refund status writes could partially commit, resurrect refunded money or prematurely release all SD | Explicit transitions; atomic application/instrument/tender/activity/attachment updates; optimistic concurrency checks; derive SD stage from all remaining instruments |
| High | Duplicate draft requests could create competing applications; different addresses were grouped together | Guard concurrent drafts, create all offices atomically, include address in grouping and return all existing drafts |
| High | Summary refresh could lose checked requirements or overlap with another run | Expiring claim with a unique run ID; atomic summary/checklist commit; retain checked old requirements as optional generated lines; match them again on later refreshes |
| High | Accounts missed guarantee/refund reminders on tenders nobody followed; changed deadlines reused old notification keys | Process money-bearing tenders independently of selections; include deadline in deduplication keys; run authenticated background work using Next `after`; add a secret-protected daily cron |
| High | Empty live desks automatically acquired fake people, tenders and money | Remove automatic sample seeding; exclude sample instruments from Money and sample tenders from scheduled tender reminders; remove creation of unusable local-only accounts |
| Medium | First page visits could concurrently create the same desk identity | Native database upsert with a nonempty update; parallel first-visit regression test |
| Medium | Invalid amounts and calendar-overflow dates could enter financial forms | Reject non-finite amounts and invalid instrument dates; preserve explicit empty-field corrections |
| Medium | Instrument upload failures could leave saved money despite an error | Prepare attachments first, then save bytes, instrument and activity together for creation; guard edits against concurrent refund attachment |

## Independent review

Claude independently traced the initial risks, discussed the proposed fixes, then performed a fresh candidate review. That review identified a regression: application-linked instruments could become permanently uneditable. The correction adds draft cancellation and detaches instruments on rejection, retaining an immutable instrument snapshot for the application and print view. Submitted and released applications remain protected from direct instrument edits. Existing rejected applications can also be corrected safely.

## Verification

- 31 automated regression tests passed against disposable local PostgreSQL and the running Next.js app.
- Tests cover revoked/missing credential versions, demotion, inactive users, upload response headers and bytes, invalid files/dates/amounts, every invalid refund transition, multi-office release, conflicting refund requests, concurrent drafting, first-visit races, draft cancellation, rejected-instrument correction, summary lease recovery and checklist ticks.
- Direct service tests verify date-specific reminders, reminders without a selector, sample exclusion, recipient role changes, and real transaction rollback after an instrument changes. The rollback test verifies that attachment bytes and application state do not partially commit.
- Browser smoke test used a disposable local account and confirmed the repaired application page progressed from Draft to Submitted to office, Acknowledged and Released.
- Final production build passed. All 31 tests also passed against that production build. Whitespace/diff checks passed.

The tests use local PostgreSQL, not the production Neon pooler. Batch transactions avoid the interactive-transaction issue already documented in this repository, but production provider behavior remains a release smoke-test requirement. The optional external AI provider was disabled; deterministic summary behavior and lease handling were tested.

## Deployment prerequisites

1. Apply the additive migration `20260930_tender_desk_integrity` before this app version serves traffic. It adds summary lease fields and an application instrument snapshot. Use the normal deployment migration process (`prisma migrate deploy` once the database migration history is correctly baselined).
2. Configure a strong `CRON_SECRET` in Vercel. The daily schedule is `02:30 UTC` (08:00 IST). Vercel must send it as the bearer authorization header. Requests without the configured secret fail closed.
3. Verify an authenticated Tender Desk page, PDF/text download, draft cancellation and refund transition after deployment. Check that the cron completed and the Inbox contains expected reminders.
4. Existing sample tenders are retained to avoid deleting user data. They no longer contribute to Money or scheduled tender reminders. Review the daily fetcher/backup settings and replace any old sample-only assignee with a real employee.
5. Tokens from old versions without a credential-version field will require a fresh sign-in. Console roles are a ceiling: desk-specific role restrictions are retained; console promotion alone does not grant desk roles that were never assigned.

The normal build command does not apply migrations automatically. This branch does not deploy the app or edit production secrets.

## Run the regression suite

Use Node 22.15+ (or a newer version supporting `node:module.registerHooks`) and a disposable PostgreSQL database named `suchii_desk_test` bound to localhost. The suite rejects non-local database/server URLs. It creates test records, so do not point it at a shared development or production database.

```sh
export DATABASE_URL='postgresql://YOUR_LOCAL_USER@127.0.0.1:55438/suchii_desk_test'
export JWT_SECRET='a-long-secret-only-for-this-local-test-server'
export CRON_SECRET='a-secret-only-for-this-local-test-server'
export OPENAI_API_KEY=''
npx prisma db push
npm run dev -- --hostname 127.0.0.1 --port 3108
```

In a second terminal with the same variables, run `npm run test:desk`. The HTTP suite expects the app on port 3108, or `DESK_TEST_URL` can name another localhost port. The service suite uses the same database and creates isolated fixture records. Stop the local app before running `npm run build` because both use `.next`.

## Remaining work outside this patch

- Other console modules from the earlier bugbash (attendance, BOQs, bills and dashboard links) are outside this Tender Desk branch.
- Review existing seeded fetch assignments; removing fake people or historical sample tenders requires a deliberate data-cleanup plan.
- Broader upload resource limits, dependency advisories, external AI quality, and full production cron/provider behavior remain follow-up work.
- The stage/completion forms and general settings still deserve broader concurrency/partial-write review. This patch focuses atomicity on the money/refund workflow and summary checklist.
- The pre-bid EMD reminder asks for a submitted instrument before the instrument workflow currently permits entry; that product-rule mismatch needs a separate decision.
