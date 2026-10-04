/**
 * Plain explanations and next steps for a download that did not finish.
 * Reads only fields the job API already returns (status, result.code,
 * result.error/message, error). Retry is offered only when trying again can
 * help; dead links and missing files point to the notice or manual upload.
 */
const GUIDES = {
  SOURCE_DOWNLOAD_UNAVAILABLE: {
    title: 'The official files are no longer available',
    detail: 'The portal still lists this tender, but its documents cannot be downloaded. The link may have been removed or the tender closed.',
    retry: false,
    actions: ['notice', 'upload'],
  },
  LINK_EXPIRED: {
    title: 'This link has expired',
    detail: 'Portal detail links stop working after a while. Searching again by the Tender ID usually finds the current notice.',
    retry: false,
    actions: ['search', 'notice'],
  },
  CAPTCHA_REJECTED: {
    title: 'The portal did not accept the CAPTCHA',
    detail: 'The portal rejected the CAPTCHA answers, so no files were downloaded. This is usually temporary.',
    retry: true,
    actions: ['notice'],
  },
  PORTAL_COOLDOWN: {
    title: 'The portal asked us to wait',
    detail: 'Too many requests reached this portal recently. The retry button unlocks when the wait is over.',
    retry: true,
    actions: [],
  },
  PORTAL_BUSY: {
    title: 'Another download is using this portal',
    detail: 'Downloads from one portal run one at a time. Try again in a few seconds.',
    retry: true,
    actions: [],
  },
  RETRIEVAL_TIMEOUT: {
    title: 'The portal took too long to answer',
    detail: 'Government portals are sometimes slow. Files already saved are kept; trying again continues from there.',
    retry: true,
    actions: ['notice'],
  },
  NO_VERIFIED_MATCH: {
    title: 'The matching tender could not be confirmed',
    detail: 'Nothing was saved, so no files from another tender were mixed in. Choose the notice yourself or search with the Tender ID.',
    retry: false,
    actions: ['search', 'notice', 'upload'],
  },
  IDENTITY_MISMATCH: {
    title: 'The portal opened a different tender',
    detail: 'The files did not belong to the selected tender, so nothing was saved. Search with the exact Tender ID to find the right notice.',
    retry: false,
    actions: ['search', 'notice'],
  },
  INTERRUPTED: {
    title: 'The download stopped before finishing',
    detail: 'The background worker stopped part way. Files already saved are kept; trying again picks up the rest.',
    retry: true,
    actions: [],
  },
  UNKNOWN: {
    title: 'The download did not finish',
    detail: 'Try again, or open the official notice and upload the files yourself.',
    retry: true,
    actions: ['notice', 'upload'],
  },
};

function text(job, result) {
  return [result?.error, result?.message, typeof job?.error === 'string' ? job.error : job?.error?.message, job?.progressMessage]
    .filter((value) => typeof value === 'string').join(' ');
}

/** Returns null for jobs that are running or finished well. */
export function downloadFailureGuide(job, result = job?.resultJSON ?? job?.result) {
  if (!job || !['FAILED', 'INTERRUPTED'].includes(job.status)) return null;
  const parsed = typeof result === 'string' ? (() => { try { return JSON.parse(result); } catch { return null; } })() : result;
  const code = parsed?.code;
  if (code && GUIDES[code]) return { code, ...GUIDES[code] };
  const words = text(job, parsed);
  if (/link has expired|detail link expired|link.{0,20}expired/i.test(words)) return { code: 'LINK_EXPIRED', ...GUIDES.LINK_EXPIRED };
  if (/captcha/i.test(words) && /reject|wrong|incorrect|failed/i.test(words)) return { code: 'CAPTCHA_REJECTED', ...GUIDES.CAPTCHA_REJECTED };
  if (/timed out|took too long/i.test(words)) return { code: 'RETRIEVAL_TIMEOUT', ...GUIDES.RETRIEVAL_TIMEOUT };
  if (job.status === 'INTERRUPTED') return { code: 'INTERRUPTED', ...GUIDES.INTERRUPTED };
  return { code: 'UNKNOWN', ...GUIDES.UNKNOWN };
}
