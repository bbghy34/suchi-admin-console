# Tender lifecycle verification

Audit date: 1 October 2026. Scope: current Tender Desk backend and existing screen placement. No production database writes, government requests, or frontend edits were used in this audit. Rod's port 3218 was left alone.

## Intended workflow and current implementation

| Step | Current implementation | Evidence and limits |
|---|---|---|
| Upload/import tender papers | Tender and document records retain original file bytes and extracted text. | Upload and import are separate entry paths. Import verification is documented separately. |
| Select a tender | `selectTender` creates a personal selection, enables frequent notifications, advances UPLOADED to SELECTED, and schedules the initial summary. | An existing selection is reused; if its initial summary is still missing, reselection can retry the background summary (the summary lease prevents duplicate model work). |
| Requirement summary | Ten sections: work, eligibility, technical documents, financial documents, EMD, fee, SD, dates, certificates, unreadable files. Checklist ticks survive summary refresh. | Prompt requires source evidence and distinguishes unreadable files. Rules fallback exists. Uploading a later document does **not** automatically refresh an existing summary; the user presses Refresh. The main summary is in the Documents & requirements tab. This audit does not establish live Gemini output quality. |
| Prepare/submit bid | Stage endpoint advances selection/preparation to submitted. | Role checked; changes and activity/evidence commit atomically. |
| Award | Got the bid requires BID_SUBMITTED, valid award date, nonnegative award amount, and LOA/work order. | Security money becomes available in the overview after award. |
| EMD and SD | Separate instrument categories, amounts, statuses and proofs. | SD before award is rejected. Conversion to SD points to a same-tender SD record and avoids counting money twice. |
| Refund office | SD held records require name, department, address, district, state and officer. | Draft letters group instruments by the complete office identity; different addresses produce separate applications. |
| Completion | Accounts/Admin saves a certificate, certificate date, optional number/authority, and contract release eligibility/conditions. | Certificate/date required. Eligibility cannot precede completion. Completion alone does not mean the deposit is immediately refundable. |
| Apply for security money | Gate requires completion evidence, confirmed eligibility date reached, held SD, and complete refund offices. | Creates local draft letters. It does **not** submit a refund request to a government website. Staff records submission/acknowledgement/release. |
| Refund progression | Draft → submitted → acknowledged/released, or rejected. Rejection unlocks applicable instruments; release marks money refunded. | Invalid transitions, stale writes, partial multi-office releases, and instrument ownership changes are covered by existing tests. |
| Close | No held or to-arrange instruments may remain. | Releasing SD does not silently release an independent EMD. |
| Notifications | Selection frequency, bid deadlines, BG expiry, award/completion/refund events. | Scheduled reminders depend on the deployed scheduler being configured. Tests verify reminder deduplication and exclude samples/inactive recipients. |

## Backend corrections in this audit

`app/api/desk/tenders/[id]/applications/route.js` now creates refund drafts and their activity entry in the same nested database write. Previously, drafts committed before activity logging; a logging error could return a failed response despite successful draft creation. The existing tender timestamp guard and instrument guards remain in place.

`lib/desk/tender-service.js` now commits a first selection, conditional stage advance, activity and inbox notification atomically. Concurrent same-person selections reuse the winning selection. Missing initial summaries can be retried when reselecting. Two database regressions prove concurrent idempotence and rollback for an invalid person.

## Verification

- Current-source `tests/desk-services.test.mjs`: **11 passed**, no skips, on disposable PostgreSQL `127.0.0.1:54419/suchii_desk_test`.
- Added an HTTP lifecycle regression to `tests/desk-api.test.cjs`: selection, frequent notification preference, EMD entry, bid preparation/submission, award attachment, SD entry, completion attachment, office-backed draft, submission, acknowledgement, release and remaining EMD preventing close. Missing award/completion evidence and premature SD entry are rejected.
- `tests/desk-api.test.cjs`: **26 passed**, no skips, on isolated production-build server `http://127.0.0.1:3223`, using the same disposable database. Total 528 ms; full new lifecycle 111 ms. This server includes the atomic draft fix. The final rebuild also includes atomic selection; all 26 HTTP and 11 service tests passed again (37 total, no skips).
- HTTP summary tests use local deterministic fallback, not a paid Gemini request. They verify save/lease/checklist behavior, not model accuracy. Fixtures deliberately remain in the disposable test database.

## Screen refinement recommendations (frontend owner)

1. Make the overview's next action explicit: select → read requirement summary → prepare bid → award → record money → completion → refund. Link to the existing Documents summary instead of duplicating its content.
2. Show when document changes require Refresh, particularly after an upload to an already summarized tender. Existing corrigendum notifications already instruct the user to refresh.
3. Completion Save needs a busy state to prevent repeated submissions. The refund Apply button disables while busy but should also say that the letter is being prepared.
4. `TenderView.jsx` currently renders an editable completion block at SD_APPLIED while the completion endpoint rejects edits at that stage. Display existing completion evidence read-only once its refund application has been submitted.
5. NOT_AWARDED currently renders both an EMD card and an EMD refund card containing the same instruments. Keep a single refund section.
6. Keep EMD, SD, refund office, completion evidence and release eligibility visually distinct. Do not label a draft letter as a government submission.

## Scope boundaries

No frontend edits were made. The recommendations above describe the screen state inspected during the audit; the frontend owner may resolve them independently. Selection-summary scheduling uses the existing Next.js background callback; this audit did not replace it with a durable AI job queue or add automatic repeated model requests.

## Implemented screen refinements

The final patch keeps the existing layout and changes only lifecycle controls: Documents & requirements names the summary location; uploads newer than the summary show a refresh warning; completion Save disables while saving; refund Apply says Preparing application; submitted refund stages show completion read-only; NOT_AWARDED shows one EMD refund section. These supersede recommendations 2–5 above. No automatic government refund submission was added.
