# Linked official tender documents: source checks and discovery limits

Checked on 1 October 2026 (IST). This is a bounded source-pattern investigation, not a crawl or a claim that every website is supported.

## Sources inspected

### 1. NEEPCO: notice page → PDF

The [official notice for GEM/2026/B/7139935](https://neepco.co.in/neepco/node/36510?language_content_entity=en) was fetched successfully. Its HTML links directly to [230120260700-4446.pdf](https://neepco.co.in/neepco/sites/default/files/2026-02/230120260700-4446.pdf). The page describes maintenance of water ATMs and purifiers at Umrongso, Khandong and Kopili.

Observed pattern:

- Notice: `/neepco/node/<numeric-id>?language_content_entity=en`
- File: `/neepco/sites/default/files/<year-month>/<filename>.pdf`
- The filename alone is opaque; the surrounding notice content supplies the useful title.

After inspecting the downloaded HTML, it was replayed through `discoverOfficialDocuments`. The function returned exactly the PDF above, relevance score 8, one visited page and no child-page requests. This validates discovery against the freshly captured page. It does not establish that the PDF contains every GeM attachment or validate its deadline; this research did not download that PDF.

### 2. Sikkim: listing → notice → PDF

The [official tender listing](https://www.sikkim.gov.in/tender) links to [notice 50529](https://www.sikkim.gov.in/tender/tender-info/50529), concerning rural connectivity roads under PMGSY-IV. The earlier verification in this task inspected that notice and downloaded [its official PDF](https://www.sikkim.gov.in/uploads/tenders/Re-invitation_of_e-Procurement_Notice_66_20260908.pdf).

Observed pattern:

- Notice: `/tender/tender-info/<numeric-id>?Tender=<display-title>`
- Attachment: `/uploads/tenders/<descriptive-filename>.pdf`
- The original link used a duplicate slash under `/uploads//tenders/` and redirected to the canonical file URL.

The `Tender` query parameter is a display title, not the file to download. Listing and publication dates must not become closing deadlines. This case reuses earlier actual verification; it was not freshly fetched again in this bounded research run.

### 3. IIT Guwahati: real child links, unsuccessful traversal

The [official tender listing](https://www.iitg.ac.in/iitg_tenders_all/) loaded successfully. The selected record was “Supply and installation of pump sets and associated machineries at the Water Supply System in IITG campus.” Its actual HTML link was:

`iitg_tender_details.php?p=4408/supply-and-installation-of-pump-sets-and-associated-machineries-at-the-water-supply-system-in-iitg-campus`

There is **no HTML `<base href>`**. Resolving that relative link against the fetched trailing-slash listing URL produces [this child URL](https://www.iitg.ac.in/iitg_tenders_all/iitg_tender_details.php?p=4408/supply-and-installation-of-pump-sets-and-associated-machineries-at-the-water-supply-system-in-iitg-campus), which returned HTTP 404. Discovery tried at most three relevant child pages; all returned 404, and the result contained zero documents with explicit failure evidence.

Search indexes also expose root-level `/iitg_tender_details?p=...` URLs, but no rewritten URL was fetched here. Do not silently manufacture a replacement route. A canonical-link or official-site adapter fix needs separate verification.

This test also shows a relevance limitation: after the exact pump-set notice, shared “supply”, “installation” and “system” words made unrelated equipment notices eligible for the remaining child slots. Those requests remained bounded, but word overlap does not establish that notices belong together.

### 4. Meghalaya PWD: listing with directly linked documents

The [official PWD homepage](https://www.megpwd.gov.in/) was readable through the web tool and contains many separately titled road-work notices, cancellations and corrigenda. The bounded native fetch failed with a connection error before HTML could be inspected by the discovery function.

Do not report this source as a successful script retrieval. The homepage mixes independent projects and amendments; nearby links must not automatically become a single tender packet. Exact PDF targets were not independently verified in this run.

## Embedded files and download query parameters

No real iframe/embed/object PDF endpoint or non-extension download endpoint was verified in the captured source pages. Their support remains fixture-tested behavior, not proven coverage from these live examples.

The current adapter recognizes direct file extensions and selected query patterns such as `file=notice.pdf`, `filename=notice.pdf`, `format=pdf`, and a bounded download endpoint with an identifier. A notice query such as IIT Guwahati's `p=4408/...` or Sikkim's `Tender=...` remains an HTML notice reference. The response signature must decide whether a download is actually a PDF/Office/archive file; a `.pdf` URL can still return HTML.

## Grouping review

A concrete offline fixture exposed a cross-notice grouping error: two `<section>` blocks inside one `<article>` held an Assam bridge NIT/BOQ and an unrelated hospital BOQ. The old nearest-container selector chose the outer article, copied both project titles into every candidate label, and returned the hospital BOQ as a supporting bridge file.

The parent implementation has since changed grouping to prefer nearer sections and reject ambiguous outer containers. Replaying the same fixture against that change returned only the bridge NIT and its own BOQ; the hospital BOQ was excluded. The regression needs to stay in the suite. This research worker did not edit application code.

Further conditions to preserve:

- Group siblings only when the enclosing record clearly describes one notice. A shared page, article or generic “Download” label is insufficient.
- Keep the selected primary notice and its reference/title checks separate from supporting-attachment checks.
- A saved corrigendum does not by itself reconcile deadline, scope or cancellation changes. Show that amendments require review unless those changes were actually parsed and checked.
- Record failed or skipped attachments and discovery limits; “matched section” does not mean all documents on the government site were retrieved.
- Keep one shared deadline and byte/request budget across root page, child pages and files. Respect rate-limit responses and stop further requests to the affected portal.

## Evidence and traffic

Evidence is stored locally in the ignored directory `tools/assam-tenders/verification/linked-research/`:

- `page-1.html`: live IIT Guwahati listing.
- `iitg.json`: actual links and bounded discovery failures.
- `page-9.html` and `neepco.json`: live NEEPCO notice and extracted links.
- `neepco-discovery-replay.json`: discovery output from the captured NEEPCO HTML.
- `megpwd.json`: native connection failure.

The native research wrapper made at most nine HTTP attempts, including redirect/failure attempts, alongside three official-page web-open operations. The further Sikkim request was stopped by the wrapper's cap. Search-engine discovery and cached HTML replay did not initiate additional government downloads. No paid CAPTCHA, bid submission, authentication change or broad crawl was performed.

## Final local verification (1 October 2026)

A real background job for the Atal Amrit Abhiyan AMC notice fetched its matching NIT and supporting tender document, then retained both because a reliable closing date/time was unavailable. Job finished in about 6 seconds (client observed completion at 8.12 seconds). All three authenticated artifact downloads returned HTTP 200 and matched their SHA256: NIT 1,096,099 bytes; supporting PDF 93,789 bytes; source record 15,146 bytes. Chrome confirmed Find/Download/Save Done, CAPTCHA Not needed, download links, and Files saved — details need review.

Final production build passed. Focused discovery/document/stage tests: 29 passed. Lifecycle: 26 HTTP + 11 service tests passed. Background job HTTP: 37 checks passed. SX HTTP visibility: 15 checks passed. Artifact database tests: 3 passed, including rollback, ownership, bounds and exact bytes. Structured job persistence/stage tests: 12 passed.

### Deployment and limits

Apply prisma/migrations/20261001_retrieval_artifacts before deploying this release. It was applied only to the disposable local QA database, not production. Retained files are owner-only database artifacts; manual intake currently requires reviewing and uploading those originals. Discovery is bounded to the source page plus up to three relevant child pages, not an unrestricted crawler. Scanned documents without verifiable details require review. Supporting corrigenda are retained, but automatic reconciliation of every amended contract term is not guaranteed. Background retrieval survives navigation; a killed server process is marked interrupted and requires explicit retry. Scheduled money/deadline reminders still require the deployment scheduler.
