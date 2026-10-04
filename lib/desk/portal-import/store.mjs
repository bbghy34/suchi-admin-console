import { randomUUID } from "node:crypto";
import { ASSAM_BASE, PORTALS } from "./identity.mjs";
import { PortalFetchError } from "./assam.mjs";
import { findSavedDownload } from "./saved-download.mjs";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function portalDate(value) {
  const match =
    /^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(
      String(value || "").trim(),
    );
  if (!match) return null;
  const [, day, month, year, hour, minute, part] = match;
  if (+hour < 1 || +hour > 12 || +minute > 59) return null;
  const monthIndex = MONTHS.indexOf(month.toLowerCase());
  if (
    monthIndex < 0 ||
    +day < 1 ||
    +day > new Date(Date.UTC(+year, monthIndex + 1, 0)).getUTCDate()
  )
    return null;
  return new Date(
    `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}T${String((+hour % 12) + (part.toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}:00+05:30`,
  );
}
const money = (value) => {
  const raw = String(value || "").replace(/[₹,\s]/g, "");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : null;
};
const days = (value) => {
  const n = money(value);
  return Number.isInteger(n) && n <= 2147483647 ? n : null;
};

export function tenderFields(packet, query) {
  const f = packet.fields;
  const portal = packet.portal || PORTALS[0];
  const bidSubmissionEnd = portalDate(f["Bid Submission End Date"]);
  if (!bidSubmissionEnd || !f.Title || !f["Tender ID"])
    throw new PortalFetchError(
      "The official record is missing its ID, title, or closing date. Use the manual upload form.",
    );
  return {
    sourceId: portal.id,
    portalTenderId: f["Tender ID"],
    ...(portal.id === "gem" ? { gemBidNumber: f["Tender ID"], gemBuyer: f["Organisation Chain"] || f["Department Name"] || null } : {}),
    title: f.Title,
    state: portal.state,
    placeOfWorkState: portal.state,
    allIndia: !portal.state,
    placeOfWork: f.Location || null,
    referenceNo: f["Tender Reference Number"] || null,
    orgChain: f["Organisation Chain"] || null,
    category: f["Tender Category"] || null,
    estimatedValue: money(f["Tender Value in ₹"]),
    emdAmount: money(f["EMD Amount in ₹"]),
    tenderFee: money(f["Tender Fee in ₹"]),
    publishedAt: portalDate(f["Published Date"] || f["Publish Date"]),
    bidSubmissionEnd,
    docSaleEnd: portalDate(f["Document Download / Sale End Date"]),
    bidOpeningAt: portalDate(f["Bid Opening Date"]),
    bidOpeningPlace: f["Bid Opening Place"] || null,
    preBidAt: portalDate(f["Pre Bid Meeting Date"]),
    preBidPlace: f["Pre Bid Meeting Place"] || null,
    periodOfWorkDays: days(f["Period Of Work(Days)"]),
    bidValidityDays: days(f["Bid Validity(Days)"]),
    location: f.Location || null,
    pinCode: f.Pincode || null,
    nodalOfficer: f.Name || null,
    description: f["Work Description"] || null,
    sourceUrl: packet.sourceUrl || portal.base + "?page=WebTenderStatusLists&service=page",
    searchKeywords: String(query || f.Title)
      .slice(0, 240)
      .toLowerCase()
      .trim(),
    stage: "UPLOADED",
  };
}

export function mimeFor(name) {
  const ext = name.split(".").at(-1).toLowerCase();
  return (
    {
      pdf: "application/pdf",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      zip: "application/zip",
      txt: "text/plain",
      csv: "text/csv",
    }[ext] || "application/octet-stream"
  );
}

/** One nested Prisma write: tender, document rows, bytes, and activity commit together. */
export async function savePacket(db, packet, person, query, extractDocument, progress = () => {}) {
  const fields = tenderFields(packet, query);
  const savedKey = { sourceId: fields.sourceId, portalTenderId: fields.portalTenderId };
  const existing = await findSavedDownload(db, savedKey);
  if (existing) return existing;
  const metadata = [];
  const docs = [];
  for (const item of packet.documents) {
    progress(`Reading file ${docs.length + 1} of ${packet.documents.length}: ${item.name}`);
    const mime = mimeFor(item.name);
    let extraction;
    try {
      extraction = await extractDocument(item.bytes, mime, item.name);
    } catch {
      extraction = {
        text: "",
        status: "ERROR",
        metadata: {
          extraction: "Failed; original file retained for later extraction.",
        },
      };
    }
    metadata.push({
      name: item.name,
      sha256: item.sha256,
      size: item.bytes.length,
      description: item.description || "",
      type: item.type,
      sourceUrl: item.sourceUrl || null,
      textStatus: extraction.status,
      extraction: extraction.metadata || {},
    });
    docs.push({
      id: randomUUID(),
      type: item.type === "NIT" ? "NIT" : item.type === "BOQ" ? "BOQ" : "Other",
      fileName: item.name,
      mime,
      size: item.bytes.length,
      extractedText: extraction.text || null,
      textStatus: extraction.status,
      uploadedById: person.id,
      file: { create: { bytes: item.bytes } },
    });
  }
  const record = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 1,
        retrievedAt: packet.retrievedAt,
        source: fields.sourceUrl,
        captureScope: packet.captureScope ||
          "Official detail page, NIT and work documents. Linked corrigendum history and award pages are not followed.",
        discovery: packet.discovery || null,
        fields: packet.fields,
        manifest: packet.manifest,
        documents: metadata,
        evidence: packet.evidence,
        metrics: packet.metrics,
        observability: packet.observability || null,
      },
      null,
      2,
    ),
  );
  docs.push({
    id: randomUUID(),
    type: "Other",
    fileName: "official-record.txt",
    mime: "text/plain",
    size: record.length,
    extractedText: record.toString(),
    textStatus: "TEXT",
    uploadedById: person.id,
    file: { create: { bytes: record } },
  });
  progress("Saving the tender, original files and extracted text to Tender Desk…");
  let tender;
  try {
    tender = await db.tender.create({
      data: {
        ...fields,
        createdById: person.id,
        documents: { create: docs },
        activities: {
          create: {
            personId: person.id,
            action: "official files retrieved",
            detail: `Retrieved ${packet.manifest.length} listed files from ${packet.portal?.label || "Assam"}. Official source metadata and file hashes retained.`,
          },
        },
      },
      select: { id: true },
    });
  } catch (error) {
    // Another worker may have committed this official identity while extracting.
    // Return it only if its originals are actually available in shared storage.
    if (error?.code === 'P2002') {
      const saved = await findSavedDownload(db, savedKey);
      if (saved) return saved;
    }
    throw error;
  }
  return {
    tenderId: tender.id,
    existing: false,
    documentCount: packet.manifest.length,
    completeness: packet.evidence?.completeness || "listed-official-documents",
    downloadWarnings: (packet.evidence?.downloads || []).filter(d => d.status !== "downloaded").map(d => ({ url: d.url, reason: d.reason || d.message || "Not downloaded" })),
    extractionWarnings: metadata
      .filter((d) => d.textStatus !== "TEXT")
      .map((d) => d.name),
  };
}

/** Two independent sessions per portal; each slot keeps its own cooldown. */
export async function acquirePortalLease(db, sourceId = "assam") {
  const owner = randomUUID();
  const cooldownKey = `portalImport:${sourceId}:cooldown`;
  const checkCooldown = async () => {
    const rows = await db.$queryRawUnsafe(
      `SELECT "value" FROM "DeskSetting" WHERE "key"=$1
       AND "value"::bigint > (EXTRACT(EPOCH FROM NOW())*1000)::bigint`, cooldownKey);
    if (rows.length) throw new PortalFetchError(
      'The portal asked us to pause requests. Your download will wait for its cooldown.',
      {status:429, code:'PORTAL_COOLDOWN', retryAt:Number(rows[0].value)},
    );
  };
  await checkCooldown();
  for (let slot = 0; slot < 2; slot++) {
    const key = `portalImport:${sourceId}:lease${slot ? ':slot:1' : ''}`;
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "DeskSetting" ("key","value")
      SELECT $2, ((EXTRACT(EPOCH FROM NOW())*1000)::bigint+330000)::text || '|' || $1
      WHERE NOT EXISTS (SELECT 1 FROM "DeskSetting" WHERE "key"=$3
        AND "value"::bigint > (EXTRACT(EPOCH FROM NOW())*1000)::bigint)
      ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
      WHERE split_part("DeskSetting"."value",'|',1)::bigint < (EXTRACT(EPOCH FROM NOW())*1000)::bigint
      RETURNING "value"`,
      `${owner}|slot:${slot}`,
      key,
      cooldownKey,
    );
    if (rows.length) return rows[0].value;
  }
  await checkCooldown();
  throw new PortalFetchError(
    "This portal is handling other downloads. Your request can wait for an available session.",
    { status: 429, code: 'PORTAL_BUSY', retryAt: Date.now() + 10000 },
  );
}
export async function releasePortalLease(
  db,
  lease,
  retryAt = null,
  sourceId = "assam",
) {
  const key = `portalImport:${sourceId}:lease${String(lease).endsWith('|slot:1') ? ':slot:1' : ''}`;
  // Whole milliseconds: a fractional Retry-After would fail the ::bigint cast below.
  const sharedUntil = Math.ceil(Number(retryAt) || Date.parse(retryAt) || 0);
  if (sharedUntil > Date.now()) {
    // Publish an upstream Retry-After and release the owned slot atomically.
    // A stale owner cannot impose or shorten another session's cooldown.
    await db.$executeRawUnsafe(
      `WITH released AS (
        UPDATE "DeskSetting" SET "value"=$1 WHERE "key"=$3 AND "value"=$2 RETURNING "key"
      ) INSERT INTO "DeskSetting" ("key","value")
        SELECT $4, $5 FROM released
        ON CONFLICT ("key") DO UPDATE SET "value"=
          GREATEST("DeskSetting"."value"::bigint, EXCLUDED."value"::bigint)::text`,
      `${Math.max(Date.now()+10000, sharedUntil)}|cooldown`, lease, key,
      `portalImport:${sourceId}:cooldown`, String(sharedUntil),
    );
    return;
  }
  await db.$executeRawUnsafe(
    `UPDATE "DeskSetting" SET "value"=$1 WHERE "key"=$3 AND "value"=$2`,
    `${Math.max(Date.now() + 10000, retryAt || 0)}|cooldown`,
    lease,
    `portalImport:${sourceId}:lease${String(lease).endsWith('|slot:1') ? ':slot:1' : ''}`,
  );
}
