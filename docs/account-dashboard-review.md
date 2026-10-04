# Settings, Profile and Dashboard review — 1 October 2026

## Findings and fixes

- Profile inverted the phone validator's result, rejecting valid numbers. It now accepts the existing validation helper's valid result and displays errors on invalid inputs.
- Profile now tracks unsaved changes, disables unchanged/duplicate saves, supports cancelling edits, and shows persistent save failures. It uses bounded requests and cancels obsolete loads. Returned server values become the new form baseline. Field labels and errors are associated for assistive technology.
- Settings now waits for authentication instead of briefly showing an unknown user with an active session. It provides shortcuts to workspace preferences, account/password controls and Profile. Browser-wide immediate preference storage is explained clearly.
- “Reset appearance” reset every preference. The label now says “Reset all preferences” and its confirmation explains the scope. Password fields have correct autofill and accessible error feedback. Sign-out calls the shared handler once and shows pending feedback. Employee code replaces a truncated internal ID.
- Dashboard now waits for authentication and real data, displays retryable initial errors, cancels obsolete requests and times out stalled loads. Failed loads no longer look like genuine zero counts. Refresh status includes the last successful update time. Personal attendance totals exclude inactive records. Project status classification now recognizes Ongoing and case/spacing variants consistently across totals, progress and contractor summaries; completed projects are excluded from active/planning totals.

## Verification

- Production build passed.
- Focused rendering, phone validation and route tests passed.
- Existing console integration suite: 92 checks passed on the disposable local database.
- New profile API regression: own-profile read, save, persisted read, forbidden role change and personal dashboard checks passed. Synthetic employee removed after the run.
- Chrome: Settings section navigation and layout inspected; Profile dirty state and Cancel verified without saving user data; Dashboard loading and populated view verified.

No password was changed and no user was signed out during browser testing. Production is not deployed by this change.
