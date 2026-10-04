# Console workflow and loading verification

Verified locally on 30 September 2026, on `codex/assam-tender-ingestion`.

## What changed

The console already had module CRUD screens, role restrictions, shared button spinners, table skeletons, warehouse workflows, and a Site Manager API. The preceding tender work added official-document retrieval, tender resolution and streamed download stages. This change improves feedback across those existing workflows and fixes the issues below.

- Shared loading panels show the action, an explanation, elapsed time and an animated bar. After 20 seconds they explain that the request is still pending. Percentages are shown only when a measured completed/total pair is supplied.
- Route loading boundaries cover the main console modules and Tender Desk. Table loading states now use the supplied module message and column count. Warehouse lists and reports use the same status panel.
- Login, tender selection, notification preferences and warehouse actions show pending labels. Pending warehouse decisions and activation actions disable repeat clicks. Site-expense export has a pending state.
- BOQ line-item and extra-item failures appear as errors instead of empty successful results. Switching BOQs ignores stale responses. Parties and report filters also ignore responses from superseded requests.
- BOQ batch validation rejects any row without its parent BOQ and invalid rates/amounts before writing. Over-received quantities have a warning.
- Attendance totals use all matching records, not just the current page. An unflagged record is labelled “Not flagged”, not “Verified Valid”. This does not introduce automatic fraud or GPS anomaly verification.
- The error screen's Dashboard action now navigates. An explicit retry reloads stale application chunks.
- A **Connect your phone** page and contextual help explain shared field/office records, supported module destinations, submission confirmation, refresh and troubleshooting. They do not claim live pairing, automatic sync status or a verified device origin.

## Test environment and results

- Local production-mode server: `http://localhost:3217`.
- Database writes restricted to the separate `codex_portal_validation` schema. Synthetic records are labelled QA; no production business records were used for mutation tests.
- **92 API/workflow checks passed**, including a focused rerun of the bill summary assertion after correcting the test's response-field name. The other initial harness corrections concerned cookie authentication and manager read access, not relaxed production permissions.
- **32 unit/regression tests passed** for official imports, streamed progress, attendance totals and phone-help scope.
- Production build passed. No application schema migration is required for this change.
- Chrome checks covered the routes below, with stored accessibility snapshots and screenshots. This is broad workflow and render coverage, not a claim that every possible field combination or every button has been exhaustively tested.

| Area | Verification performed |
| --- | --- |
| Projects, departments, firms, contractors, sites | List APIs and Chrome screens; linked synthetic department → firm/contractor → project → site creation. |
| Employees and designations | List APIs, rendered screens and role boundaries. |
| BOQs | BOQ → line item creation; parent relation; mixed invalid batch rejected without partial writes; invalid amount rejected; photo-list API; Chrome loading and loaded line-item modal showing quantity 10, rate 100, amount 1,000. |
| Parties and bills | Accountant access; party creation and duplicate rejection; linked BOQ bill; API and Chrome totals reconcile ₹1,000 billed, ₹400 paid, ₹600 unpaid. Regular admin restrictions retained. |
| Attendance | Authenticated employee check-in/check-out; cannot mark another employee; three completed shifts total 360 minutes on both page 1 and page 2; Chrome list and labels. |
| Leaves | Employee submission → admin approval → employee reads approved status; Chrome list. |
| Site expenses | Linked site expense creation/read; Chrome page and export pending state. |
| Site progress | List API and Chrome render; contextual field-upload guidance. New image storage upload is not verified. |
| Warehouse masters | Categories, units, suppliers and materials APIs/screens; linked synthetic setup. |
| Warehouse operations | Inward 10 → request 3 → approve → issue → stock 7. A second issue and an invalid stock operation are rejected. Stock, ledger, inward, outward, adjustments, requests and low-stock screens render. |
| Reports | Five core report endpoints and five warehouse report endpoints; report screens render. |
| Tender portal and Desk | Portal, legacy tenders, Desk dashboard, my tenders, official fetch, inbox, money, people and administration screens render. Import/progress regression tests cover multiple CAPTCHA challenges, rejection and reuse of the configured solver. Existing official-download evidence remains in the tender verification report; this audit did not repeat paid CAPTCHA downloads. |
| Account and phone help | Profile, settings and Connect your phone render; help explains where records appear and how to investigate missing submissions. No password change was made through the UI. |

## Boundaries and follow-up requirements

1. **Object storage is not configured in this local environment.** New BOQ Excel/photo storage, progress-photo uploads, bill attachments and legacy tender-file uploads are not verified end to end. Listing an empty photo collection is not an upload test. Configure the deployment's S3/GCS credentials and run actual upload → list → download checks before signing off those paths.
2. **No physical mobile-app run was performed.** Attendance and leave were tested through the authenticated API. The approved app installation URL and app repository were unavailable; the guide directs staff to their administrator rather than inventing an installer link or QR code.
3. Bills summarize recorded values. They are not a verified bank ledger or a cash-as-of-date report; future-dated records are not automatically excluded. No new accounting policy was introduced here.
4. Attendance summary currently reads the three summary fields for all matching rows. Very large unbounded histories may warrant a database aggregate later; correctness across pagination is verified.
5. Changes are committed to the feature branch, not a production deployment. Local build assets must be rebuilt with the running production-mode server stopped, then restarted, to avoid mismatched chunks.

## Reproduction

Run from the repository root with the appropriate local environment configured:

```sh
npm run build
node --test scripts/test-official-tender-import.mjs scripts/test-import-progress.mjs scripts/test-console-feedback.mjs
node --env-file=.env.local node_modules/next/dist/bin/next start --port 3217 --hostname 127.0.0.1
# In another terminal; refuses non-local server URLs or another database schema:
node --env-file=.env.local scripts/test-console-modules.mjs
```

The integration script retains synthetic fixtures in the validation schema. Do not point it at production or remove its isolation checks. Its ignored JSON result is `tools/assam-tenders/verification/console-modules.json`; local screenshots are in `tools/assam-tenders/verification/console-ui/`. Credentials and those local artifacts are not committed.
