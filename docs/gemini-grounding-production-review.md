# Gemini grounding: production review still required

Checked 1 October 2026 against Google's official documentation:

- [GenerateContent Google Search documentation](https://ai.google.dev/gemini-api/docs/generate-content/google-search): the current REST request uses `tools: [{ google_search: {} }]`. Grounding metadata includes web search queries, source chunks, citation supports and `searchEntryPoint.renderedContent` Search Suggestions. Citation indices must refer to the original grounding chunk array.
- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms), effective 23 March 2026, Grounding with Google Search: requires associated Search Suggestions when displaying Grounded Results; restricts caching and framing; separately restricts programmatic collection of grounded links for crawling/scraping and certain storage/reuse.

The implementation now preserves original citation indices, keeps provider metadata internally, and logs only model, elapsed time, outcome and query/source counts. It does not log full queries, generated answers, keys or source URLs.

**Open production gap:** the search UI does not display Google's returned Search Suggestions. Existing result caching/reuse and the downstream document-retrieval use of grounded links require a product/design review against the linked terms. A sandboxed iframe alone would not resolve those restrictions; no suggestions widget was added. Do not describe the current integration as fully compliant or production-ready on the strength of successful search/download tests. No provider migration or broad caching redesign was made during this focused fix.
