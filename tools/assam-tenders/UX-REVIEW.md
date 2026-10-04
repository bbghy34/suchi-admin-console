# AI search and retrieval UX review

Reviewed in Chrome against the local validation server on 30 September 2026.

## Flow and changes

1. **Search — improved.** The previous filter grid dominated the first screen. Search now has a clear heading, plain-language examples and a three-step explanation. Advanced filters are collapsed by default. Search waiting has explanatory text and elapsed time. Existing theme tokens and keyboard-accessible native controls are retained.
2. **Results — improved, source quality still limited.** Saved records and web discoveries are clearly separated. Public search evidence is expandable, and source-based titles are more readable. Online results are explicitly leads whose dates and download availability need confirmation. Search can still return older or generic portal pages; the UI does not claim that those are open tenders.
3. **Official retrieval — live progress added.** Server events describe matching, CAPTCHA solving/submission/retry, downloading, reading individual files and saving. Each challenge uses the server-configured 2Captcha key. No manual ID field is required for an unambiguous supported result. Ambiguous results still require a named selection.
4. **Success and recovery — verified.** A saved-tender result exposes Open in Tender Desk and preserves the original search URL including filters. Closed notices fail early with their official download deadline. Errors provide source and manual-upload actions. Stream interruption does not falsely display success.
5. **Document review — improved messaging.** Summary generation explains Gemini's role and distinguishes saved originals from the generated draft. File upload also explains its wait. Summary polling no longer silently loops after a failed progress request and avoids overlapping polls.

## Accessibility and limits

Stage changes use polite live regions; the elapsed timer is outside the live region to avoid announcing every second. Errors use alerts. Filter fields have accessible names. The saved confirmation uses the theme accent because dark green was difficult to read on the dark background. Native details controls support keyboard expansion. A full screen-reader audit and mobile-device test were not performed.

This remains a streamed request, not a persisted background job: users should keep the page open during retrieval. Progress does not guarantee a shorter CAPTCHA service wait. The prior fresh import took 144.637 seconds; individual stages were not timed in that older run. New stage logs carry elapsed milliseconds.

## Evidence

Ignored local artifacts are in `verification/latency-ux/`: `01-search-before.png`, `02-results-before.png`, `03-search-after.png`, `04-saved-result.png` and final captures. `verification/progress-live.json` records streaming duplicate success and closed-notice failure. The earlier normal-search workflow recording is `verification/tender-workflow-demo.mp4` (pauses shortened; recorded before the visual refresh; uses saved-file reuse rather than a new download).

30 focused tests and the production build passed. The six-notice download results and remaining portal coverage limits are in VERIFICATION.md.
