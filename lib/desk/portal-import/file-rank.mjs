const FILE_LINK = /\.(?:pdf|docx?|xlsx?|zip|rar)(?:$|[?#])/i;

/**
 * 0: files confirmed downloadable on the official source, or already saved here.
 * 1: the official notice cites its own file (PDF, DOC, XLS, ZIP).
 * 2: an official page with no file confirmed yet.
 */
export function fileRank(row = {}) {
  if (row.existingTenderId || row.downloadAvailability === 'available') return 0;
  if (FILE_LINK.test(row.link || '') || row.documents?.some(doc => FILE_LINK.test(doc?.url || ''))) return 1;
  return 2;
}

/** Stable: rows keep their source and closing-date order inside each rank. */
export function rankByFiles(rows) {
  return rows.map((row, index) => ({ row, index, rank: fileRank(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ row, rank }) => ({ ...row, fileRank: rank }));
}
