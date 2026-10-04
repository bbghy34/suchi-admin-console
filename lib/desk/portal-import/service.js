import { recordVerifiedUnavailable, clearVerifiedUnavailable } from '@/lib/desk/portal-import/verified-availability.mjs';
import { chooseDefaultOfficialNotice } from '@/lib/desk/portal-import/default-choice.mjs';
import { findSavedDownload, savedDownloadKey } from '@/lib/desk/portal-import/saved-download.mjs';
import { sameNotice } from '@/lib/desk/portal-import/notice-match.mjs';
export { sameNotice } from '@/lib/desk/portal-import/notice-match.mjs';
import { findOfficialCopies } from '@/lib/desk/portal-import/official-copy.mjs';
import { saveReviewArtifacts } from '@/lib/desk/portal-import/artifacts.mjs';
import { describeImportStage } from '@/lib/desk/portal-import/stages.mjs';
import { discoverOfficialDocuments } from '@/lib/desk/portal-import/page-discovery.mjs';
import { collectLinkedFiles, validateLinkedPacket } from '@/lib/desk/portal-import/linked-packet.mjs';
import { NextResponse, after } from "next/server";
import { resolveDiscovery } from "@/lib/desk/portal-import/resolve.mjs";
import { onlineTenderSearch } from "@/lib/desk/ai/online-search";
import { markSourceUploaded } from "@/lib/desk/fetch-mark";
import { deskAudienceIds, notifyMany } from "@/lib/desk/notify";
import { istDateKey } from "@/lib/desk/ist";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole, HttpError } from "@/lib/desk/auth";
import { canUploadFetch, fetchAssigneeFor } from "@/lib/desk/fetch-day";
import { twoCaptchaKeyStatus } from "@/lib/two-captcha";
import {
  validateIdentity,
  portalFor,
  PORTALS,
} from "@/lib/desk/portal-import/identity.mjs";
import {
  AssamPortal,
  PortalFetchError,
} from "@/lib/desk/portal-import/assam.mjs";
import {
  acquirePortalLease,
  releasePortalLease,
  savePacket,
} from "@/lib/desk/portal-import/store.mjs";
import { publicNoticeIdentity, retrievePublicNotice, PublicNoticeError } from "@/lib/desk/portal-import/public-notice.mjs";
import { extractOfficialDocument } from "@/lib/desk/portal-import/extract.mjs";
import { directDocumentIdentity, retrieveDirectDocument } from "@/lib/desk/portal-import/direct-document.mjs";

const reply = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function importer(actor = null) {
  const person = actor || await requireRole("ADMIN", "TENDER_EXECUTIVE");
  if (!person.roles?.some(role => ["ADMIN", "TENDER_EXECUTIVE"].includes(role)))
    throw new HttpError(403, "Your role cannot retrieve official files.");
  const assignment = await fetchAssigneeFor();
  if (!canUploadFetch(person, assignment))
    throw new HttpError(
      403,
      "Only the assigned fetcher, backup, or an admin can retrieve official files.",
    );
  return person;
}

export async function getImportCapability() {
  try {
    await importer();
    return reply({
      ok: true,
      configured: twoCaptchaKeyStatus().configured,
      portals: PORTALS.map((p) => ({ id: p.id, label: p.label })),
      publicNotices: [{ id: "gem", label: "GeM public bid PDF", scope: "Explicit Northeast buyer state required" }, { id: "sikkim", label: "Sikkim noticeboard", scope: "Verified closing date and time required" }],
    });
  } catch (err) {
    return reply(
      {
        ok: false,
        error:
          err instanceof HttpError
            ? err.message
            : "Could not check official retrieval.",
      },
      err instanceof HttpError ? err.status : 500,
    );
  }
}

export async function runImport(request, report = () => {}, { actor = null, requestId: suppliedRequestId = null, deadlineAt: suppliedDeadline = null } = {}) {
  let rowEvidence = "", leaseKey = null;
  let requestedNotice = null, retrievalNotice = null;
  let lease = null,
    retryAt = null,
    sourceId = null,
    client = null,
    importPerson = null;
  const requestId = suppliedRequestId || randomUUID();
  const startedAt = Date.now();
  const deadlineAt = Math.min(startedAt + 270000, suppliedDeadline || Infinity);
  let outcome = 'failed';
  const stages = [];
  let stageState = {};
  const progress = (message) => {
    stageState=describeImportStage(message,stageState);
    const event = { type: 'progress', message, ...stageState, elapsedMs: Date.now() - startedAt };
    stages.push(event);
    report(event);
    console.info('portal_import', JSON.stringify({ requestId, event: 'progress', ...event }));
  };
  const respond = (data, status = 200) => {
    outcome = data.needsChoice ? 'needs_choice' : status < 400 ? 'success' : 'failed';
    return reply({ ...data, requestId, elapsedMs: Date.now() - startedAt }, status);
  };
  try {
    if (Date.now() >= deadlineAt) return respond({ok:false,error:"Official retrieval timed out. Any saved files remain available.",code:"RETRIEVAL_TIMEOUT"},408);
    const person = await importer(actor);
    importPerson = person;
    progress("Finding the official notice and checking saved tenders…");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return respond(
        { ok: false, error: "Open this action from Tender Desk." },
        403,
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      return respond({ ok: false, error: "Expected a JSON request." }, 415);
    const raw = await request.text();
    if (raw.length > 20000)
      return respond({ ok: false, error: "Request is too large." }, 413);
    let input, identity, inputDiscovery, relatedDocuments=[];
    try {
      input = JSON.parse(raw);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a search result.');
      requestedNotice = { title: String(input.row?.title || '').slice(0, 300), link: publicDiagnosticLink(input.row?.link || input.link), tenderId: String(input.tenderId || input.row?.portalTenderId || '').slice(0, 100) };
      console.info('portal_import', JSON.stringify({requestId, event:'selected_notice', ...requestedNotice}));
      const cacheKey = savedDownloadKey(input);
      const cached = await findSavedDownload(prisma, cacheKey);
      if (cached) sourceId = cacheKey.sourceId;
      if (cached) { progress('Checking saved files · ready to open.'); return respond(cached); }
      if (input.row) {
        rowEvidence = `${input.row.title || ""} ${input.row.detail || ""}`;
        const resolved = await resolveDiscovery(input.row, onlineTenderSearch, { onEvent: event => progress(event.message), deadlineAt: Math.min(deadlineAt, startedAt+90000, Date.now()+45000),
          discover: async (page, options) => {
            leaseKey='official-site:'+new URL(page).hostname.replace(/^www\./,'');
            lease=await acquirePortalLease(prisma,leaseKey);
            return discoverOfficialDocuments(page,options);
          },
        });
        inputDiscovery = resolved.discoveryEvidence;
        relatedDocuments = resolved.relatedDocuments || [];
        if (!resolved.candidate) {
          const selected = chooseDefaultOfficialNotice(input.row, resolved.matches || []);
          if (!selected) return respond({ok:false,code:'NO_VERIFIED_MATCH',error:'No unambiguous official tender matched this result. No files from another tender were saved.'},422);
          resolved.candidate = selected.candidate;
          progress('Finding the best matching official source automatically…');
        }
        input = { ...input, link: resolved.candidate.officialLink, tenderId: resolved.candidate.tenderId,
          reference: resolved.candidate.reference };
      }
      if (directDocumentIdentity(input.link)) {
        identity = { ...directDocumentIdentity(input.link), direct: true, publicNotice: true };
      } else if (publicNoticeIdentity(input.link)) {
        identity = { ...publicNoticeIdentity(input.link), publicNotice: true };
      } else if (input.mode === "resolve") {
        const portal = portalFor(input.link);
        if (
          !portal ||
          typeof input.reference !== "string" ||
          input.reference.trim().length < 4 ||
          input.reference.length > 150
        )
          throw new Error(
            "Choose an official portal and enter its tender reference number.",
          );
        identity = { portal, sourceId: portal.id };
      } else if (!input.tenderId && input.reference && portalFor(input.link)) {
        const portal = portalFor(input.link);
        identity = { portal, sourceId: portal.id };
      } else
        identity = validateIdentity(input.link, input.tenderId, {
          allowDetailLink: true,
        });
      sourceId = identity.sourceId;
    } catch (err) {
      if (err instanceof PublicNoticeError || err instanceof PortalFetchError) throw err;
      return respond(
        {
          ok: false,
          error: err.message || "Enter a valid official tender ID.",
        },
        400,
      );
    }
    const existing = await findSavedDownload(prisma, identity.publicNotice
      ? {sourceId, sourceUrl:identity.link}
      : input.tenderId ? {sourceId, portalTenderId:input.tenderId} : null);
    if (existing) { progress('Checking saved files · ready to open.'); return respond(existing); }
    if (!identity.publicNotice && !twoCaptchaKeyStatus().configured)
      return respond(
        {
          ok: false,
          error:
            "Official retrieval is not configured. Ask an admin to set the server CAPTCHA key.",
        },
        503,
      );
    const nextLeaseKey = identity.leaseId || sourceId;
    if (lease && leaseKey !== nextLeaseKey) { await releasePortalLease(prisma,lease,null,leaseKey); lease=null; }
    leaseKey = nextLeaseKey;
    if (!lease) lease = await acquirePortalLease(prisma, leaseKey);
    const savedAfterLease = await findSavedDownload(prisma, identity.publicNotice
      ? {sourceId, sourceUrl:identity.link}
      : input.tenderId ? {sourceId, portalTenderId:input.tenderId} : null);
    if (savedAfterLease) { progress('Checking saved files · ready to open.'); return respond(savedAfterLease); }
    let packet;
    if (identity.direct) {
      packet = await retrieveDirectDocument(identity, { row: input.row || {}, deferValidation:true, deadlineAt, onEvent: event => progress(event.message) });
      if (relatedDocuments.length || packet.relatedDocuments?.length) await collectLinkedFiles(packet, [...relatedDocuments,...(packet.relatedDocuments || [])], { deadlineAt, onEvent:event=>progress(event.message) });
      packet.discovery={link:input.row?.link || input.link,query:String(input.query||'').slice(0,240),linkedPages:inputDiscovery || null};
      try { await validateLinkedPacket(packet,input.row||{},{onEvent:event=>progress(event.message)}); }
      catch (error) {
        if(error.code!=='MANUAL_INTAKE_REQUIRED')throw error;
        packet.evidence=error.evidence || packet.evidence;
        progress('Saving files for review…');
        const artifacts=await saveReviewArtifacts(prisma,person.id,requestId,packet);
        return respond({ok:true,needsReview:true,artifacts,documentCount:packet.documents.length,
          completeness:'needs-review',message:'Original files are saved. Review the tender title and closing date/time before adding it to Tender Desk.',
          downloadWarnings:(packet.evidence.downloads||[]).filter(d=>d.status!=='downloaded').map(d=>({url:d.url,reason:d.reason}))});
      }
    } else if (identity.publicNotice) {
      packet = await retrievePublicNotice(identity, { deadlineMs: Math.max(1000, deadlineAt - Date.now()), onEvent: event => progress(event.message) });
      if (input.tenderId && input.tenderId !== packet.fields["Tender ID"])
        throw new PublicNoticeError("The official notice ID does not match the selected tender.", "IDENTITY_MISMATCH");
    } else {
      client = new AssamPortal({
        portal: identity.portal,
        deadlineMs: Math.max(1000, Math.min(240000, deadlineAt - Date.now())),
        apiKey: process.env.TWOCAPTCHA_API_KEY,
        onEvent: (event) => {
          if (event.event === "phase") progress(event.phase);
          console.info(
            "portal_import",
            JSON.stringify({ requestId, tenderId: input.tenderId, ...event }),
          );
        },
      });
      if (input.mode === "resolve")
        return respond({
          ok: true,
          ...(await client.findReference(input.reference)),
          requestId,
        });
      let exactId = input.tenderId;
      if (!exactId && input.reference) {
        const found = await client.findReference(input.reference);
        const matches = found.candidates.map(c => ({...c,title:c.titleAndReference,evidence:c.organisation,officialLink:identity.portal.base,sourceId,portal:identity.portal.label}));
        const selected = chooseDefaultOfficialNotice(input.row || {reference:input.reference},matches);
        if (!selected) return respond({ok:false,code:'NO_VERIFIED_MATCH',error:'The portal returned multiple or unrelated tender references. No matching bid could be verified automatically.'},422);
        exactId = selected.candidate.tenderId;
        progress('Finding the matching tender reference automatically…');
      }
      if (!exactId) {
        exactId = await client.resolveDetail(identity.detailLink);
        // Session-sequenced links can open another tender; it must match the chosen result.
        if (rowEvidence && !sameNotice(rowEvidence, client.resolvedFields)) {
          progress('The link opened another tender · locating the selected notice…');
          let matches = [];
          try {
            const corrected = await resolveDiscovery({...input.row, link:identity.portal.base}, onlineTenderSearch);
            matches = (corrected.matches || (corrected.candidate ? [corrected.candidate] : [])).filter(match => match.tenderId !== exactId && match.officialLink !== identity.detailLink);
          } catch { /* Keep the verified mismatch if discovery is unavailable. */ }
          console.info('portal_import',JSON.stringify({requestId,event:'identity_mismatch',selectedNotice:requestedNotice,openedTenderId:exactId,openedTitle:client.resolvedFields.Title}));
          const selected = chooseDefaultOfficialNotice(input.row, matches.filter(match => portalFor(match.officialLink)?.id === sourceId));
          if (!selected?.candidate?.tenderId) return respond({ok:false,code:'IDENTITY_MISMATCH',error:'The search link opened another tender, and a matching replacement could not be verified automatically. No unrelated files were saved.'},422);
          exactId = selected.candidate.tenderId;
          identity.detailLink = null;
          progress('Finding the corrected official tender automatically…');

        }
      }
      const found = await findSavedDownload(prisma, {sourceId, portalTenderId:exactId});
      if (found) { progress('Checking saved files · ready to open.'); return respond(found); }
      retrievalNotice = { sourceHost: client.portal.host, tenderId: exactId, originalUrl: requestedNotice?.link,
        link: input.link, resolvedUrl: null };
      packet = await client.retrieve(exactId, { detailLink: identity.detailLink });
      if (rowEvidence && !sameNotice(rowEvidence, packet.fields))
        throw new PortalFetchError('The downloaded notice did not match the selected tender. No unrelated files were saved.', {code:'IDENTITY_MISMATCH'});
    }
    packet.observability = { requestId, retrievalElapsedMs: Date.now() - startedAt, stages: [...stages] };
    packet.discovery = {
      ...(inputDiscovery ? { linkedPages: inputDiscovery } : {}),
      link: input.link,
      query: String(input.query || "").slice(0, 240),
    };
    // The portal is done with: free its slot before reading and saving files,
    // so other users are not told the portal is busy while PDFs are parsed.
    if (lease) {
      await releasePortalLease(prisma, lease, retryAt, leaseKey).catch(() =>
        console.error("portal_import", { requestId, event: "lease_release_failed" }));
      lease = null;
    }
    const result = await savePacket(
      prisma,
      packet,
      person,
      String(input.query || ""),
      extractOfficialDocument,
      progress,
    );
    if (retrievalNotice) await clearVerifiedUnavailable(prisma, {...retrievalNotice, resolvedUrl: client?.resolvedUrl}).catch(() =>
      console.info('portal_import', JSON.stringify({requestId,event:'availability_cache_clear_failed'})));
    if (!result.existing)
      after(async () => {
        try {
          await markSourceUploaded(sourceId, person.id, istDateKey());
          const audience = await deskAudienceIds();
          // The background worker sends its owner one terminal job notification.
          await notifyMany(actor ? audience.filter(id => id !== person.id) : audience, {
            tenderId: result.tenderId,
            kind: "TENDER_UPLOADED",
            title: `Official tender saved: ${packet.fields.Title}`,
            body: `${result.documentCount} official files saved from ${identity.portal.label}.`,
            dedupeKey: `uploaded:${result.tenderId}`,
          });
        } catch {
          console.error("portal_import", {
            requestId,
            event: "intake_notification_failed",
            tenderId: result.tenderId,
          });
        }
      });
    console.info(
      "portal_import",
      JSON.stringify({
        requestId,
        event: "saved",
        tenderId: packet.fields["Tender ID"],
        savedTenderId: result.tenderId,
        documentCount: result.documentCount,
        extractionWarnings: result.extractionWarnings,
        downloadWarnings: result.downloadWarnings,
        ...packet.metrics,
      }),
    );
    return respond({ ok: true, ...result, requestId });
  } catch (err) {
    retryAt = err.retryAt || null;
    if (err.code === 'SOURCE_DOWNLOAD_UNAVAILABLE' && client?.resolvedFields) {
      progress('Portal downloads unavailable · checking official copies…');
      try {
        const matches = await findOfficialCopies(client.resolvedFields, requestedNotice?.link, onlineTenderSearch);
        if (matches.length) return respond({ok:true,needsChoice:true,matches,code:err.code,message:'The portal no longer serves these files. Choose an official copy to verify and retrieve.'});
      } catch (copyError) { console.info('portal_import',JSON.stringify({requestId,event:'official_copy_search_failed',code:copyError.code || 'SEARCH_FAILED'})); }
      if (retrievalNotice && client.resolvedFields['Tender ID'] === retrievalNotice.tenderId &&
          (!rowEvidence || sameNotice(rowEvidence, client.resolvedFields))) {
        await recordVerifiedUnavailable(prisma, {...retrievalNotice, code: err.code,
          resolvedUrl: client.resolvedUrl || null,
          downloadEnd: client.resolvedFields['Document Download / Sale End Date'] || null,
        }).catch(() => console.info('portal_import', JSON.stringify({requestId,event:'availability_cache_write_failed'})));
      }
      err.message += ' No matching alternative official copy was verified.';
    }
    if (err.code === 'MANUAL_INTAKE_REQUIRED' && err.documents?.length && importPerson) {
      try {
        progress('Saving downloaded originals for review…');
        const artifacts = await saveReviewArtifacts(prisma,importPerson.id,requestId,{documents:err.documents,fields:err.parseResult?.fields,evidence:err.evidence,sourceUrl:requestedNotice?.link,retrievedAt:new Date().toISOString()});
        return respond({ok:true,needsReview:true,artifacts,documentCount:err.documents.length,completeness:'needs-review',message:err.message});
      } catch (storageError) { console.error('portal_import',JSON.stringify({requestId,event:'review_storage_failed',code:storageError.code || 'STORAGE_FAILED'})); }
    }
    if (err?.code === "P2002")
      return respond(
        {
          ok: false,
          error:
            "This tender was saved by another request. Search the desk to open it.",
        },
        409,
      );
    const known = err instanceof HttpError || err instanceof PortalFetchError || err instanceof PublicNoticeError;
    console.error(
      "portal_import",
      JSON.stringify({
        requestId,
        event: "failed",
        type: err.name,
        code: err.code || null,
        message: String(err.message || "").slice(0, 300),
        sourceId,
        metrics: client?.metrics,
        selectedNotice: requestedNotice,
        openedNotice: client?.resolvedFields ? { tenderId: client.resolvedFields["Tender ID"], title: client.resolvedFields.Title, downloadEnd: client.resolvedFields["Document Download / Sale End Date"] } : null,
      }),
    );
    return respond(
      {
        ok: false,
        error: known
          ? err.message
          : "Official retrieval could not finish. Nothing was saved; please try again.",
        requestId,
        retryAt,
        code: known ? err.code || null : null,
      },
      known ? err.status : 502,
    );
  } finally {
    console.info('portal_import', JSON.stringify({ requestId, event: 'complete', outcome,
      elapsedMs: Date.now() - startedAt, sourceId, metrics: client?.metrics, stages }));
    if (lease)
      await releasePortalLease(prisma, lease, retryAt, leaseKey).catch(() =>
        console.error("portal_import", {
          requestId,
          event: "lease_release_failed",
        }),
      );
  }
}

/** Retain public source identity without session credentials or arbitrary URL parameters. */
export function publicDiagnosticLink(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (!['page', 'service', 'sp', 'id', 'tenderId', 'bidId'].includes(key)) url.searchParams.delete(key);
    return url.href.slice(0, 1600);
  } catch { return null; }
}
