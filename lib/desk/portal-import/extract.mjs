/** Deterministic extraction only. No model calls or execution of workbook macros. */
export async function extractOfficialDocument(bytes, mime, name) {
  if (mime === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      verbosity: 0,
      isEvalSupported: false,
    }).promise;
    try {
      if (doc.numPages > 1000) throw new Error("Extraction page limit");
      const lines = [];
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await doc.getPage(number);
        const content = await page.getTextContent();
        lines.push(
          `\n--- Page ${number} ---\n` +
            content.items
              .map((item) => item.str + (item.hasEOL ? "\n" : " "))
              .join(""),
        );
        page.cleanup();
      }
      const metadata = await doc.getMetadata();
      const text = lines.join("\n");
      return {
        text,
        status: text.replace(/--- Page \d+ ---/g, "").trim()
          ? "TEXT"
          : "NO_TEXT",
        metadata: {
          pages: doc.numPages,
          info: metadata.info,
          xmp: metadata.metadata?.getAll() || null,
        },
      };
    } finally {
      await doc.destroy();
    }
  }
  if (mime === "text/plain") {
    const raw = bytes.toString("utf8");
    let text = raw;
    const html = /<!doctype html|<html|<body|<table[\s>]/i.test(raw);
    if (html) {
      const { load } = await import("cheerio");
      const $ = load(raw);
      $("script,style,noscript").remove();
      text = $.text().replace(/\s+/g, " ").trim();
    }
    return { text, status: text.trim() ? "TEXT" : "NO_TEXT",
      metadata: { format: html ? "official-html-retained-as-text" : "plain-text" } };
  }
  if (/\.xlsx?$/i.test(name)) {
    const mod = await import("xlsx");
    const XLSX = mod.default || mod;
    // Parsing only: preserve formula strings/cached values and detect VBA bytes.
    // XLSX.read never evaluates formulas or executes embedded macros.
    const book = XLSX.read(bytes, { type: "buffer", cellFormula: true, cellStyles: true, bookVBA: true });
    if (book.SheetNames.length > 100) throw new Error("Extraction sheet limit");
    const definedNames = book.Workbook?.Names || [];
    let cellCount = 0;
    const sections = [];
    const sheets = book.SheetNames.map((sheetName, sheetIndex) => {
      const sheet = book.Sheets[sheetName];
      const cells = Object.fromEntries(
        Object.entries(sheet).filter(([key]) => !key.startsWith("!")),
      );
      cellCount += Object.keys(cells).length;
      if (cellCount > 200000) throw new Error("Extraction cell limit");
      const hidden = book.Workbook?.Sheets?.[sheetIndex]?.Hidden || 0;
      const visibility = hidden === 2 ? "very hidden" : hidden === 1 ? "hidden" : "visible";
      const hiddenColumns = (sheet["!cols"] || []).flatMap((col, i) => col?.hidden ? [XLSX.utils.encode_col(i)] : []);
      const hiddenRows = (sheet["!rows"] || []).flatMap((row, i) => row?.hidden ? [i + 1] : []);
      const printAreas = definedNames.filter(item =>
        ["_xlnm.Print_Area", "Excel_BuiltIn_Print_Area"].includes(item.Name) &&
        (item.Sheet === sheetIndex || item.Ref?.startsWith(sheetName + "!") || item.Ref?.startsWith("'" + sheetName.replaceAll("'", "''") + "'!")),
      );
      // Apply only an unambiguous, single rectangular print area. Preserve unsupported
      // or union expressions as evidence rather than guessing their meaning.
      const distinctAreas = [...new Set(printAreas.map(item => item.Ref))];
      let printRange = null;
      if (distinctAreas.length === 1) {
        const match = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(distinctAreas[0]);
        if (match && (match[1]?.replaceAll("''", "'") || match[2]) === sheetName)
          printRange = XLSX.utils.decode_range(`${match[3]}${match[4]}:${match[5]}${match[6]}`);
      }
      const visible = [], hiddenCells = [], outsidePrint = [];
      for (const [address, cell] of Object.entries(cells)) {
        if (!/^[A-Z]+[1-9]\d*$/.test(address)) continue;
        if (cell.v == null && !cell.f) continue;
        const pos = XLSX.utils.decode_cell(address);
        const value = String(cell.w ?? cell.v ?? "").replace(/\s+/g, " ").trim();
        const line = `${address}: ${value}${cell.f ? " [cached formula result; not recalculated]" : ""}`;
        const entry = { row: pos.r, column: pos.c, line };
        if (printRange && (pos.r < printRange.s.r || pos.r > printRange.e.r || pos.c < printRange.s.c || pos.c > printRange.e.c)) outsidePrint.push(entry);
        else if (sheet["!cols"]?.[pos.c]?.hidden || sheet["!rows"]?.[pos.r]?.hidden) hiddenCells.push(entry);
        else visible.push(entry);
      }
      const lines = entries => entries.sort((a, b) => a.row - b.row || a.column - b.column).map(x => x.line).join("\n");
      sections.push([
        `Sheet: ${sheetName} (visibility: ${visibility}; sheet retained even when hidden)`,
        printRange ? `Primary schedule is limited to visible rows/columns within declared print area ${distinctAreas[0]}.` : "No single usable print area; primary section contains all visible rows and columns.",
        "Formula results are cached values, not calculated bids. Blank bidder rates and zero totals do not establish the estimated tender value.",
        "PRIMARY VISIBLE CELLS\n" + lines(visible),
        hiddenCells.length ? "SUPPLEMENTARY HIDDEN ROW/COLUMN CELLS — retained for completeness; may contain template settings or rates, not confirmed bid values.\n" + lines(hiddenCells) : "",
        outsidePrint.length ? "SUPPLEMENTARY CELLS OUTSIDE THE PRINT AREA — retained for completeness; may contain template examples, not confirmed tender items.\n" + lines(outsidePrint) : "",
      ].filter(Boolean).join("\n"));
      return {
        name: sheetName, cells, range: sheet["!ref"], merges: sheet["!merges"] || [],
        visibility, hidden, hiddenColumns, hiddenRows,
        columns: sheet["!cols"] || [], rows: sheet["!rows"] || [],
        printAreas, appliedPrintRange: printRange,
      };
    });
    const macroPresent = Boolean(book.vbaraw?.length || book.SheetNames.some(n => book.Sheets[n]["!type"] === "macro"));
    const text = `Workbook extraction version: workbook-v2. Embedded macros present: ${macroPresent ? "yes" : "not detected"}. Macros were not executed; formulas were not evaluated.\n\n` + sections.join("\n\n");
    return {
      text,
      status: cellCount ? "TEXT" : "NO_TEXT",
      metadata: { extractionVersion: "workbook-v2", properties: book.Props || {}, sheets, definedNames, macroPresent, macrosExecuted: false, formulasEvaluated: false },
    };
  }
  return {
    text: "",
    status: "NO_TEXT",
    metadata: {
      extraction:
        "Original retained; this file type has no automatic text extraction.",
    },
  };
}
