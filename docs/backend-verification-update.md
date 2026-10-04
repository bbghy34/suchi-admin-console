# Backend verification and visibility update

Branch: `codex/tender-portal-unified`. This update contains backend code, tests, verification notes and the minimal background-download controls. Concurrent frontend redesign work is excluded.

## Official retrieval

- Exact GePNIC detail links now bootstrap a government session and check the returned tender ID before requesting a download CAPTCHA. This avoids paying for an unnecessary search CAPTCHA.
- Binary transfer timeout is 90 seconds, bounded by the existing 240-second overall retrieval deadline. Slow upstream transfers produce an actionable timeout. No unbounded retries were added.
- Advertised files over 20 MB, or listed packets over 50 MB, stop before a paid CAPTCHA. Existing request spacing, CAPTCHA budgets, host leases and server cooldown remain enforced.
- Request ID, retrieval duration and progress stages are retained in the saved provenance; CAPTCHA and download time are tracked separately. Saved events include the local tender ID and extraction/download warnings.
- GeM public bid PDFs with an explicitly labelled Northeast buyer state can use the existing import endpoint. Linked allowlisted buyer attachments, catalogue specifications and dated general terms are retained. The original source URL, file hashes, extracted text and omitted references are recorded. Repeat imports reuse the saved record.
- Sikkim official notices are recognized, but ambiguous closing date/time requires manual intake. NBCC eNivida and NRIDA have documented verification limits; they are not advertised as complete automatic download adapters.
- Workbook extraction preserves all raw cells/formulas, visibility, print areas and macro presence. Its text separates primary schedule cells from hidden/template cells. Formulas/macros are never executed.

The authenticated GeM endpoint was verified using an isolated production build: six originals saved in 24.2 seconds, progress events streamed, one unsupported reference explicitly reported, no text extraction failures, and repeat import reused the same record in 1.5 seconds. This packet is partial, not an assertion that every referenced attachment was captured.

## Verification evidence

- `tender-user-download-verification.md`: the actual BSF Guwahati request, file hashes, served-byte checks, PDF/BOQ field corroboration and applied workbook refresh.
- `tender-official-verification.md`: independent multi-portal sample with per-notice outcomes and document-content findings.
- `tender-public-notice-verification.md`: GeM final adapter run and Sikkim limits.
- `tender-nbcc-nrida-verification.md`: observed workflows and remaining external limitations.

Local originals and detailed diagnostic reports live under ignored `tools/assam-tenders/verification/`; keys, cookies and environment files are not committed.

## SX visibility

SX remains an authenticated administrator with private self-profile access. Shared workforce directories, counts, reports, manager/HOD/fetcher assignments and actor fields exclude SX. The original internal audit records are preserved. Direct-ID access and assignment checks enforce the rule in the backend instead of relying on hidden frontend controls.

The employee/person directory helpers intentionally do not change authentication queries. Actor masking applies explicitly to business responses and does not rewrite freeform tender documents, arbitrary descriptions or source evidence.


## Background download jobs

Search results now offer **Run in background** beside the existing foreground action. A queued job returns immediately. Users can navigate away, check Background downloads, and open saved files from the result or notification. Progress polling reads only local job records; it does not contact government portals.

- Jobs persist in namespaced DeskSetting records. No schema migration or separate queue service is required.
- Owner-scoped endpoints enforce current roles and fetch assignments. Workers reload account permissions before retrieval; credentials and session cookies are never stored in jobs.
- Duplicate active requests reuse the same job. At most three jobs may be active per user; portal leases and retrieval pacing still apply. Active jobs stay ahead of recent completed history.
- Atomic claims and fenced completion prevent duplicate workers and late result overwrites. Terminal status and a deduplicated inbox notification are saved in one transaction. Transient completion writes retry up to three times without replaying the retrieval.
- Completion, failure, ambiguous matches and interruption have distinct states. Failed/ambiguous inbox messages link to Background downloads. Successful messages open the saved tender. Notifications and unread counts refresh when newly completed jobs are detected, including jobs finishing between polls.
- Retry is explicit and respects the portal cooldown. Polling pauses in hidden tabs; request timeouts show a recoverable message. Partial attachment capture and extraction warnings remain visible.
- This survives browser navigation, not server process termination. A stale worker is marked interrupted when status is checked after six minutes. Users review saved tenders before explicitly retrying; paid CAPTCHA work is never automatically replayed.
- Deployment must permit a 300-second Next.js background lifetime (`after` with `maxDuration=300`). Retrieval gets a bounded budget below that; this is not an external durable-worker service. Notifications are in-app, not email or operating-system push.

### Local verification

- Production Next.js build passed in an isolated copy using the committed frontend plus only the job controls.
- 77 retrieval/privacy/job regression checks passed with no skipped database checks; later focused tests cover active-history retention and jobs finishing between polls.
- 37 HTTP job checks passed across four jobs: immediate 202, persisted results, owner isolation, permission checks, explicit retry, failure, and one terminal notification. Fixtures reused saved tenders and rejected invalid links, making no government requests.
- 15 SX HTTP privacy checks passed against the job-enabled server. Earlier complete console regression passed 92/92 checks, covering BOQ, parties, workforce and other console APIs; Desk API/service tests passed 25 and 9 checks respectively.
- Nine job transport/rendered-state checks passed, including cooldown, partial results, ambiguity, timeout handling and notification refresh detection.

### Browser and real background retrieval

Chrome search for “Assam education desktop computers GeM” exposed the new button. Starting a job and leaving search produced a NEEDS_INPUT inbox alert in 5.7 seconds; its Open downloads link reached the result. A source lead without an exact official match stays explicit rather than being claimed as a successful download.

A separate known official GeM bid was then submitted through the actual background endpoint on the disposable local server. Queue response: HTTP 202 in 9 ms. Job `dcaccfc6-075f-4cd0-9388-ebd3dd6534cb` finished in 16.97 seconds, saving six originals plus generated provenance under tender `fefbc159-6bbd-4234-9d09-6dce05fa0c4f`. Every authenticated document response matched its stored original hash. One unsupported official reference remained explicitly partial; text extraction reported no failures. Chrome showed running progress, completion and the saved-tender notification link.

This live check also exposed two small UX issues, now fixed: Return to search from an unresolved job pointed back to the jobs page, and the job owner received both a general intake alert and a job completion alert. Background imports now reserve the terminal job alert for the owner while retaining general intake notifications for other subscribers. Partial completion messages explicitly mention missing attachments.
