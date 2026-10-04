/** Real local HTTP + isolated Postgres integration test. Never runs against public data. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL);
assert.equal(
  url.searchParams.get("schema"),
  "codex_portal_validation",
  "Requires the isolated validation schema",
);
assert.match(
  url.searchParams.get("options") || "",
  /search_path=codex_portal_validation/,
);
const base = process.env.DESK_TEST_URL || "http://127.0.0.1:3217";
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const db = new PrismaClient();
let cookie;
const checks = [];
async function request(
  path,
  body,
  method = "POST",
  expected = 200,
  auth = true,
) {
  const headers = auth ? { cookie } : {};
  if (body !== undefined && !(body instanceof FormData))
    headers["content-type"] = "application/json";
  const r = await fetch(base + path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await r.json();
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(data)}`);
  return data;
}
function form(fields, fileName) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  if (fileName)
    f.set(
      "file",
      new Blob(
        [
          "LOCAL WORKFLOW FIXTURE ONLY\nTechnical documents:\n- GST registration certificate\n- PAN card\nSecurity deposit release subject to completion and contract terms.",
        ],
        { type: "text/plain" },
      ),
      fileName,
    );
  return f;
}
try {
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.LOCAL_TEST_EMAIL,
      password: process.env.LOCAL_TEST_PASSWORD,
    }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  await request("/api/desk/portal-import", undefined, "GET", 401, false);
  await request(
    "/api/desk/portal-import",
    { link: "http://127.0.0.1/private", tenderId: "2026_DoWR_54237_1" },
    "POST",
    400,
  );
  checks.push("Sign-in, unauthorized access and foreign-host rejection");
  const real = await db.tender.findUnique({
    where: {
      sourceId_portalTenderId: {
        sourceId: "assam",
        portalTenderId: "2026_DoWR_54237_1",
      },
    },
    include: { documents: { include: { file: true } } },
  });
  assert(real, "Save the bounded live retrieval packet before this test");
  const count = await db.tender.count();
  const duplicate = await request("/api/desk/portal-import", {
    link: "https://assamtenders.gov.in/",
    tenderId: real.portalTenderId,
  });
  assert.equal(duplicate.tenderId, real.id);
  assert.equal(duplicate.existing, true);
  assert.equal(await db.tender.count(), count);
  const record = JSON.parse(
    real.documents.find((d) => d.fileName === "official-record.txt")
      .extractedText,
  );
  for (const d of real.documents.filter(
    (d) => d.fileName !== "official-record.txt",
  )) {
    const r = await fetch(base + "/api/desk/documents/" + d.id, {
      headers: { cookie },
    });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.length, d.size);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      record.documents.find((m) => m.name === d.fileName).sha256,
    );
  }
  assert.equal(
    record.documents.find((d) => d.name === "bid_sutradhar.pdf").extraction
      .pages,
    61,
  );
  assert(
    real.documents
      .find((d) => d.fileName === "bid_sutradhar.pdf")
      .extractedText.includes("--- Page 61 ---"),
  );
  assert(
    record.documents.find((d) => d.name.endsWith(".xls")).extraction.sheets
      .length >= 2,
  );
  checks.push(
    "Real NIT, 61-page PDF, BOQ and ZIP persist and download with matching hashes; duplicate skips retrieval",
  );
  const stamp = randomUUID().slice(0, 8);
  const created = await request(
    "/api/desk/tenders",
    form(
      {
        sourceId: "assam",
        title: "LOCAL WORKFLOW TEST " + stamp,
        state: "Assam",
        placeOfWork: "Local test district",
        bidSubmissionEnd: "2026-12-31T14:00",
        searchKeywords: "workflow,test",
        category: "Works",
        workCategory: "Civil works",
        portalTenderId: "LOCAL-" + stamp,
      },
      "test-notice.txt",
    ),
  );
  const id = created.tenderId;
  assert(id);
  const path = "/api/desk/tenders/" + id;
  await request(path + "/select", {});
  assert.equal(
    (await db.selection.findFirst({ where: { tenderId: id } })).frequency,
    "FREQUENT",
  );
  await request(path + "/select", { frequency: "QUIET" }, "PATCH");
  await request(path + "/select", { frequency: "FREQUENT" }, "PATCH");
  await request(path + "/stage", { stage: "PREPARING_BID" });
  const office = {
    refundOfficeName: "Test office",
    refundOfficeDept: "Test works",
    refundOfficeAddress: "Test street",
    refundOfficeDistrict: "Test district",
    refundOfficeState: "Assam",
    refundOfficerName: "Test officer",
  };
  const emd = await request(path + "/instruments", {
    category: "EMD",
    form: "Demand draft",
    amount: 100,
    status: "HELD",
    ...office,
  });
  await request(
    path + "/instruments",
    {
      category: "SD",
      form: "Demand draft",
      amount: 200,
      status: "HELD",
      ...office,
    },
    "POST",
    400,
  );
  await request(path + "/stage", { stage: "BID_SUBMITTED" });
  await request(
    path + "/stage",
    form(
      {
        stage: "GOT_THE_BID",
        awardDate: "2026-09-01",
        awardedValue: 10000,
        letterType: "Letter of acceptance",
      },
      "test-award.txt",
    ),
  );
  const sd = await request(path + "/instruments", {
    category: "SD",
    form: "Demand draft",
    amount: 200,
    status: "HELD",
    ...office,
  });
  await request(path + "/stage", { stage: "IN_EXECUTION" });
  await request(path + "/applications", { kind: "SD" }, "POST", 400);
  await request(
    path + "/completion",
    form(
      {
        completionDate: "2026-09-29",
        certNo: "LOCAL-TEST",
        authority: "Test authority",
        sdReleaseEligibleAt: "2099-01-01",
        sdReleaseConditions: "Test retention period",
      },
      "test-completion.txt",
    ),
  );
  await request(path + "/applications", { kind: "SD" }, "POST", 400);
  await request(path + "/completion", {
    completionDate: "2026-09-29",
    sdReleaseEligibleAt: "2026-09-30",
    sdReleaseConditions: "Local test release approved",
  });
  const app = await request(path + "/applications", { kind: "SD" });
  assert(app.applicationIds.length === 1);
  const applicationPath = "/api/desk/applications/" + app.applicationIds[0];
  await request(applicationPath, { status: "SUBMITTED" }, "PATCH");
  await request(applicationPath, { status: "ACKNOWLEDGED" }, "PATCH");
  await request(applicationPath, { status: "RELEASED" }, "PATCH");
  assert.equal(
    (await db.instrument.findUnique({ where: { id: sd.instrumentId } })).status,
    "REFUNDED",
  );
  await request(path + "/stage", { stage: "CLOSED" }, "POST", 400); // EMD remains held.
  await request(
    "/api/desk/instruments/" + emd.instrumentId,
    { status: "REFUNDED", refundedOn: "2026-09-30" },
    "PATCH",
  );
  await request(path + "/stage", { stage: "CLOSED" });
  assert.equal((await db.tender.findUnique({ where: { id } })).stage, "CLOSED");
  checks.push(
    "Manual upload → selection/frequency → preparation/EMD → bid → award/SD → completion → date-gated refund → acknowledgement/release → closure",
  );
  const log = await db.fetchLog.findFirst({
    where: { sourceId: "assam", outcome: "UPLOADED" },
  });
  assert(log);
  checks.push("Manual upload marks assigned daily source as Uploaded");
  const report = {
    at: new Date().toISOString(),
    checks,
    realTenderId: real.id,
    fixtureTenderId: id,
    governmentDownloadsDuringThisTest: 0,
  };
  mkdirSync("tools/assam-tenders/verification", { recursive: true });
  writeFileSync(
    "tools/assam-tenders/verification/workflow.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
