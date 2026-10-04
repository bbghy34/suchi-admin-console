import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import {
  officialCandidate,
  validateIdentity,
  ASSAM_BASE,
} from "../lib/desk/portal-import/identity.mjs";
import {
  assertPacketSize,
  AssamPortal,
  PortalFetchError,
  parseDetails,
  parseForm,
  publicEvidence,
  zipFiles,
  validateDocument,
} from "../lib/desk/portal-import/assam.mjs";
import {
  portalDate,
  tenderFields,
  savePacket,
  acquirePortalLease,
} from "../lib/desk/portal-import/store.mjs";
const tid = "2026_DoWR_54237_1";
const recorded = readFileSync(
  new URL(
    "../tools/assam-tenders/tests/fixtures/public-details.html",
    import.meta.url,
  ),
  "utf8",
);
const form = (id = "frmSearchFilter", token = "STATE") =>
  `<form id="${id}" action="/nicgep/app"><input type="hidden" name="tokenSecret" value="${token}"><input name="tenderId"><input name="captchaText"><img id="captchaImage" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAYAAAB7Xa1eAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgIBUAAAAyAAEUIbGgAAAAAElFTkSuQmCC"><input type="submit" name="${id === "frmCaptcha" ? "Submit" : "Search"}" value="Submit"></form>`;
const detail = (gate = false) =>
  `<table><tr><td class="td_caption">Tender ID</td><td class="td_field">${tid}</td></tr></table><table><tr><td>1</td><td><a ${gate ? 'id="docDownoad"' : ""} href="/nicgep/${gate ? "gate" : "nit"}">notice.pdf</a></td><td>NIT</td><td>1</td></tr></table><table><tr><td>1</td><td>BOQ</td><td>boq.xls</td><td>BOQ</td><td>1</td></tr></table><a href="/nicgep/packet">Download as zip file</a>`;
const html = (value) =>
  new Response(value, {
    headers: {
      "content-type": "text/html",
      "set-cookie": "JSESSIONID=testsession; Path=/nicgep; Secure",
    },
  });

test("supports exact official host and an unambiguous tender ID", () => {
  assert.equal(
    officialCandidate({ link: ASSAM_BASE, detail: tid }).tenderId,
    tid,
  );
  for (const link of [
    "https://assamtenders.gov.in.evil.example/",
    "https://assamtenders.gov.in@evil.example/",
    "file:///etc/passwd",
    "https://127.0.0.1/",
  ])
    assert.throws(() => validateIdentity(link, tid));
  assert.equal(
    officialCandidate({ link: ASSAM_BASE, detail: tid + " 2026_DoWR_54236_1" })
      .tenderId,
    "",
  );
});
test("reads recorded metadata and all work documents", () => {
  const data = parseDetails(recorded);
  assert.equal(data.fields["Tender Value in ₹"], "2,29,99,654");
  assert.equal(data.manifest.length, 3);
  assert.equal(
    tenderFields({ ...data }, "water").bidSubmissionEnd.toISOString(),
    "2026-10-23T08:30:00.000Z",
  );
});
test("CAPTCHA form uses current hidden state and submit name", () => {
  const value = parseForm(form(), "frmSearchFilter");
  assert.equal(value.fields.tokenSecret, "STATE");
  assert.equal(value.fields.Search, "Submit");
  assert.equal(value.captcha.subarray(1, 4).toString(), "PNG");
});
test("retained page evidence removes scripts and form secrets", () => {
  const evidence = publicEvidence(
    form() +
      `<script>PRIVATE</script><table><tr><td>Value</td><td>123</td></tr></table>`,
  );
  assert(!JSON.stringify(evidence).includes("STATE"));
  assert(!JSON.stringify(evidence).includes("PRIVATE"));
  assert(evidence.text.includes("123"));
});
test("ZIP traversal, duplicate basenames, and size limits fail closed", () => {
  assert.throws(() => zipFiles(zipSync({ "../bad.pdf": new Uint8Array([1]) })));
  assert.throws(() =>
    zipFiles(
      zipSync({
        "a/same.pdf": new Uint8Array([1]),
        "b/same.pdf": new Uint8Array([1]),
      }),
    ),
  );
  assert.throws(() =>
    zipFiles(zipSync({ "huge.pdf": new Uint8Array(21 * 1024 * 1024) })),
  );
  assert.equal(
    zipFiles(zipSync({ "folder/ok.pdf": new Uint8Array([1]) })).get("ok.pdf")
      .length,
    1,
  );
});
test("rejects HTML gates and corrupt signatures", () => {
  assert.throws(() =>
    validateDocument("x.pdf", Buffer.from("<html>captcha</html>")),
  );
  assert.throws(() => validateDocument("x.xls", Buffer.from("invalid")));
});
test("IST date parsing validates dates and noon/midnight", () => {
  assert.equal(
    portalDate("01-Oct-2026 12:00 AM").toISOString(),
    "2026-09-30T18:30:00.000Z",
  );
  assert.equal(
    portalDate("01-Oct-2026 12:00 PM").toISOString(),
    "2026-10-01T06:30:00.000Z",
  );
  assert.equal(portalDate("31-Feb-2026 01:00 PM"), null);
  assert.equal(portalDate("01-Oct-2026 19:00 PM"), null);
});
test("one CAPTCHA search and document gate then sequential downloads", async () => {
  const calls = [];
  let submitted = 0;
  const xls = Buffer.from("d0cf11e0a1b11ae1", "hex");
  const client = new AssamPortal({
    apiKey: "private",
    sleep: async () => {},
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith("createTask")) return Response.json({ taskId: 1 });
      if (url.endsWith("getTaskResult"))
        return Response.json({
          status: "ready",
          solution: { text: "Ab123C" },
          cost: "0.001",
        });
      if (opts.method === "POST")
        return html(
          ++submitted === 1
            ? `<table id="tabList"><tr><td>1</td><td>${tid}</td><td><a title="View Tender Status" href="?sp=opaque">View</a></td></tr></table>`
            : detail(),
        );
      if (url.includes("WebTenderStatusLists")) return html(form());
      if (url.includes("page=Home")) return html(detail(true));
      if (url.endsWith("/gate")) return html(form("frmCaptcha"));
      if (url.endsWith("/nit"))
        return new Response("%PDF-1.7\nfixture", {
          headers: { "content-type": "application/pdf" },
        });
      if (url.endsWith("/packet"))
        return new Response(zipSync({ "boq.xls": xls }), {
          headers: { "content-type": "application/zip" },
        });
      assert.fail("Unexpected URL " + url);
    },
  });
  const packet = await client.retrieve(tid);
  assert.equal(packet.metrics.captchaTasks, 2);
  assert.equal(packet.metrics.downloads, 2);
  assert.equal(packet.documents.length, 3);
  assert(
    calls
      .filter(
        (c) => c.opts.method === "POST" && c.url.startsWith(ASSAM_BASE),
      )[0]
      .opts.body.includes("Search=Submit"),
  );
  assert(
    calls.some(
      (c) =>
        c.url.endsWith("/nit") &&
        c.opts.headers.Cookie === "JSESSIONID=testsession",
    ),
  );
});
test("rejected CAPTCHA reparses new hidden state", async () => {
  let n = 0;
  const states = [];
  const client = new AssamPortal({ apiKey: "private", sleep: async () => {} });
  client.solve = async () => "Ab123C";
  client.page = async (url, fields) => {
    states.push(fields.tokenSecret);
    return n++ === 0
      ? "Invalid Captcha!" + form("frmSearchFilter", "NEW")
      : "<p>ok</p>";
  };
  await client.submit(form(), "frmSearchFilter", { tenderId: tid });
  assert.deepEqual(states, ["STATE", "NEW"]);
  assert.equal(client.metrics.captchaRejected, 1);
});
test("429 respects cooldown and does not retry immediately", async () => {
  let calls = 0;
  const now = 100000;
  const client = new AssamPortal({
    apiKey: "private",
    now: () => now,
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "retry-after": "180" },
      });
    },
  });
  await assert.rejects(
    client.page(ASSAM_BASE),
    (e) => e.retryAt === now + 180000,
  );
  assert.equal(calls, 1);
});
test("redirect to a foreign host is rejected before fetching it", async () => {
  let calls = 0;
  const client = new AssamPortal({
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 302,
        headers: { location: "https://evil.example/file" },
      });
    },
  });
  await assert.rejects(client.request(ASSAM_BASE), /destination/);
  assert.equal(calls, 1);
});
test("failed POST is never blindly replayed", async () => {
  let calls = 0;
  const client = new AssamPortal({
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      throw new Error("network");
    },
  });
  await assert.rejects(client.request(ASSAM_BASE, { captchaText: "Ab123C" }));
  assert.equal(calls, 1);
});
test("saving creates metadata, all bytes, and activity in one nested write", async () => {
  let data;
  const db = {
    tender: {
      findFirst: async () => null,
      create: async (args) => {
        data = args.data;
        return { id: "saved" };
      },
    },
  };
  const details = parseDetails(recorded);
  const packet = {
    ...details,
    documents: [
      {
        name: "notice.pdf",
        type: "NIT",
        bytes: Buffer.from("%PDF-fixture"),
        sha256: "hash",
      },
    ],
    evidence: { text: "official" },
    metrics: {},
    retrievedAt: "2026-09-30",
  };
  const result = await savePacket(
    db,
    packet,
    { id: "person" },
    "water",
    async () => ({
      text: "full content",
      status: "TEXT",
      metadata: { pages: 61 },
    }),
  );
  assert.equal(result.tenderId, "saved");
  assert.equal(data.documents.create.length, 2);
  assert.equal(
    data.documents.create[0].file.create.bytes.toString(),
    "%PDF-fixture",
  );
  assert.equal(data.activities.create.personId, "person");
  assert.equal(data.createdById, "person");
  assert.equal(data.estimatedValue, 22999654);
  assert.equal(data.sourceId, "assam");
});
const savedTender = () => ({ id: 'existing', documents: [
  { fileName:'notice.pdf', size:12, textStatus:'TEXT', file:{documentId:'notice'} },
  { fileName:'official-record.txt', size:100, textStatus:'TEXT', file:{documentId:'record'},
    extractedText:JSON.stringify({evidence:{completeness:'partial', downloads:[
      {url:'https://assamtenders.gov.in/missing.pdf',status:'failed',reason:'Portal attachment unavailable'},
    ]}}) },
] });
test("an existing shared tender retains partial warnings without writing or extracting files", async () => {
  const db = {
    tender: {
      findFirst: async ({where}) => {
        assert.deepEqual(Object.keys(where).sort(), ['portalTenderId','sourceId']);
        return savedTender();
      },
      create: async () => assert.fail("should not create"),
    },
  };
  const result = await savePacket(
    db,
    parseDetails(recorded),
    { id: "p" },
    "water",
    async () => assert.fail("should not extract"),
  );
  assert.equal(result.existing, true);
  assert.equal(result.documentCount, 1);
  assert.equal(result.completeness, 'partial');
  assert.equal(result.downloadWarnings[0].reason, 'Portal attachment unavailable');
});
test("an existing tender with missing originals rejects cache success", async () => {
  const saved = savedTender();
  saved.documents[0].file = null;
  await assert.rejects(savePacket({tender:{
    findFirst:async()=>saved,
    create:async()=>assert.fail('must not replace existing tender'),
  }}, parseDetails(recorded), {id:'another-person'}, 'water',
  async()=>assert.fail('must not extract')), error=>error.code==='SAVED_FILES_MISSING');
});
test("a concurrent unique identity save reuses the winner and preserves warnings", async () => {
  let lookups = 0;
  const packet = {...parseDetails(recorded), documents:[{
    name:'notice.pdf',type:'NIT',bytes:Buffer.from('%PDF-fixture'),sha256:'hash',
  }],evidence:{},metrics:{},retrievedAt:'2026-09-30'};
  const result = await savePacket({tender:{
    findFirst:async()=>++lookups===1 ? null : savedTender(),
    create:async()=>{ throw Object.assign(new Error('unique identity'),{code:'P2002'}); },
  }},packet,{id:'second-worker'},'water',async()=>({text:'notice',status:'TEXT'}));
  assert.equal(lookups,2);
  assert.equal(result.existing,true);
  assert.equal(result.tenderId,'existing');
  assert.equal(result.completeness,'partial');
});
test("busy lease blocks a second fetch", async () => {
  await assert.rejects(
    acquirePortalLease({ $queryRawUnsafe: async () => [] }),
    (e) => e.status === 429,
  );
});

test("all registered hosts use their own base path and cookie session", async () => {
  const { PORTALS } = await import("../lib/desk/portal-import/identity.mjs");
  for (const portal of PORTALS) {
    let called;
    const client = new AssamPortal({
      portal,
      sleep: async () => {},
      fetchImpl: async (url, opts) => {
        called = { url, opts };
        return html("<p>ok</p>");
      },
    });
    await client.page(portal.base);
    assert.equal(called.url, portal.base);
    assert.equal(called.opts.headers["Accept-Language"], "en-US,en;q=0.9");
    const f = parseForm(
      form().replace("/nicgep/app", portal.path),
      "frmSearchFilter",
      portal.base,
    );
    assert.equal(f.action, portal.base);
    const mapped = tenderFields({ ...parseDetails(recorded), portal }, "test");
    assert.equal(mapped.sourceId, portal.id);
    assert.equal(mapped.state, portal.state);
  }
});
test("CAPTCHA rejection ignores JavaScript validation messages", async () => {
  const { captchaRejected } = await import(
    "../lib/desk/portal-import/assam.mjs"
  );
  assert.equal(
    captchaRejected('<script>alert("Invalid Captcha")</script><p>Results</p>'),
    false,
  );
  assert.equal(
    captchaRejected('<td class="error">Invalid Captcha!</td>'),
    true,
  );
});
test("CAPTCHA solver sends a visible bounded PNG with case instructions", async () => {
  const sharp = (await import("sharp")).default;
  let task;
  const client = new AssamPortal({
    apiKey: "test",
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith("createTask")) {
        task = body;
        return Response.json({ taskId: 1 });
      }
      return Response.json({ status: "ready", solution: { text: "aB12Cd" } });
    },
  });
  await client.solve(parseForm(form(), "frmSearchFilter").captcha);
  assert.equal(task.task.case, true);
  assert.equal(task.languagePool, "en");
  const meta = await sharp(Buffer.from(task.task.body, "base64")).metadata();
  assert.equal(meta.hasAlpha, false);
  assert(meta.width <= 600 && meta.height <= 200);
});
test("official detail resolution requires a verified tender ID", async () => {
  const client = new AssamPortal();
  client.page = async () => recorded;
  assert.equal(await client.resolveDetail(ASSAM_BASE), tid);
  client.page = async () => "<p>Portal home</p>";
  await assert.rejects(client.resolveDetail(ASSAM_BASE), /exact tender/);
});
test("reference lookup returns candidates rather than silently picking one", async () => {
  const client = new AssamPortal();
  client.page = async () => form();
  client.submit = async () =>
    readFileSync(
      new URL(
        "../tools/assam-tenders/tests/fixtures/status-results.html",
        import.meta.url,
      ),
      "utf8",
    );
  const result = await client.findReference("KOKRAJHAR/2026");
  assert.equal(result.candidates.length, 10);
  assert.equal(result.candidates[0].tenderId, tid);
  assert(result.candidates[0].titleAndReference.includes("Sutradhar"));
});

test('aggregator authority ID resolves automatically, without routing by location alone', () => {
  const row={link:'https://urbanacres.in/assam-road/',title:'Road repair in Assam',detail:'Tender ID: 2026_BoTC_54225_1'};
  assert.equal(officialCandidate(row).sourceId,'assam');
  assert.equal(officialCandidate(row).tenderId,'2026_BoTC_54225_1');
  assert.equal(officialCandidate({...row,detail:'Tender ID: 2026_NHAI_271197_1'}).sourceId,'');
  assert.equal(officialCandidate({...row,link:'https://eprocure.gov.in/eprocure/app'}).ambiguous,true);
});

test('official links in cited evidence resolve without manual portal entry', () => {
  const c=officialCandidate({link:'https://example.org/notice',detail:'Tender 2026_TEST_123_1 published at https://tripuratenders.gov.in/nicgep/app.'});
  assert.equal(c.sourceId,'tripura');
  assert.equal(c.tenderId,'2026_TEST_123_1');
});

test('automatic discovery preserves exact identity and offers named ambiguous choices', async () => {
  const {resolveDiscovery}=await import('../lib/desk/portal-import/resolve.mjs');
  const known=await resolveDiscovery({detail:'2026_BoTC_54225_1'},()=>{throw Error('Unexpected model call');});
  assert.equal(known.candidate.sourceId,'assam');
  const search=async()=>({rows:[{title:'Road A',link:ASSAM_BASE,detail:tid},{title:'Road B',link:ASSAM_BASE,detail:'2026_DoWR_54236_1'}]});
  const ambiguous=await resolveDiscovery({title:'Road'},search);
  assert.equal(ambiguous.matches.length,2);
  const mismatched=await resolveDiscovery({title:'2026_X_99999_1'},search);
  assert.equal(mismatched.matches.length,0);
});

const closedNotice = (id = tid) => `<table><tr><td class="td_caption">Tender ID</td><td class="td_field">${id}</td></tr><tr><td class="td_caption">Title</td><td class="td_field">Unrelated archived bridge repairs</td></tr><tr><td class="td_caption">Document Download / Sale End Date</td><td class="td_field">01-Sep-2025 02:00 PM</td></tr><tr><td>1</td><td><span>Tendernotice_1.pdf</span></td><td>Notice</td><td>588.43</td></tr></table>`;

test('closed detail identity reaches caller verification before document availability', async () => {
  const client=new AssamPortal({apiKey:'test',fetchImpl:async()=>html(closedNotice()),sleep:async()=>{}});
  // The selected result could refer to another tender. Returning the opened ID
  // and fields lets service.sameNotice reject that mismatch first.
  assert.equal(await client.resolveDetail(ASSAM_BASE+'?service=direct&sp=test'),tid);
  assert.equal(client.resolvedFields.Title,'Unrelated archived bridge repairs');
  assert.equal(client.resolvedFields['Document Download / Sale End Date'],'01-Sep-2025 02:00 PM');
  assert.equal(client.metrics.captchaTasks,0);
  assert.equal(client.metrics.downloads,0);
});

test('unidentified closed page reports expired identity instead of unavailable selected files', async () => {
  const client=new AssamPortal({fetchImpl:async()=>html(closedNotice('')),sleep:async()=>{}});
  await assert.rejects(client.resolveDetail(ASSAM_BASE+'?service=direct&sp=test'),e=>e.status!==410 && /exact tender/.test(e.message));
});

test('verified closed document listing fails before CAPTCHA or file requests', async () => {
  const {assertDownloadAvailable}=await import('../lib/desk/portal-import/assam.mjs');
  const closed=closedNotice();
  assert.throws(()=>assertDownloadAvailable(closed),e=>e.status===410 && e.code==='SOURCE_DOWNLOAD_UNAVAILABLE' && e.message.includes('01-Sep-2025'));
  const client=new AssamPortal({apiKey:'test',fetchImpl:async()=>html(closed),sleep:async()=>{}});
  await assert.rejects(client.retrieve(tid,{detailLink:ASSAM_BASE+'?service=direct&sp=test'}),e=>e.status===410 && e.code==='SOURCE_DOWNLOAD_UNAVAILABLE');
  assert.equal(client.metrics.captchaTasks,0);
  assert.equal(client.metrics.downloads,0);
  assert.doesNotThrow(()=>assertDownloadAvailable(detail(true)));
});

test('wrong closed notice is rejected by exact ID before availability is checked', async () => {
  const client=new AssamPortal({apiKey:'test',fetchImpl:async()=>html(closedNotice('2025_OTHER_12345_1')),sleep:async()=>{}});
  client.openById=async()=>closedNotice('2025_OTHER_12345_1');
  await assert.rejects(client.retrieve(tid,{detailLink:ASSAM_BASE+'?service=direct&sp=test'}),e=>e.status!==410 && /different tender/.test(e.message));
  assert.equal(client.metrics.captchaTasks,0);
  assert.equal(client.metrics.downloads,0);
});

test('direct notice preflight takes priority over paid reference lookup', async () => {
  const {resolveDiscovery}=await import('../lib/desk/portal-import/resolve.mjs');
  const r=await resolveDiscovery({link:ASSAM_BASE+'?service=direct&sp=test',detail:'Tender Reference Number: STBR/SOPD-G/Barchalla-02/37'},()=>{throw Error('Unexpected search');});
  assert.equal(r.candidate.reference,'');
  assert.equal(r.candidate.tenderId,'');
});

test('multiple CAPTCHA challenges reuse configured key and report rejection and submission stages', async () => {
  const phases = [];
  const keys = [];
  const client = new AssamPortal({apiKey:'configured-test-key', sleep:async()=>{}, onEvent:e=>{if(e.event==='phase') phases.push(e.phase);},
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);keys.push(body.clientKey);
      return Response.json(url.endsWith('createTask') ? {taskId:keys.length} : {status:'ready',solution:{text:'aB12Cd'}});
    }});
  let submissions=0;
  client.page=async()=> ++submissions===1 ? form()+'<p>Invalid Captcha</p>' : '<p>Accepted</p>';
  await client.submit(form(),'frmSearchFilter');
  await client.submit(form('frmCaptcha'),'frmCaptcha');
  assert.equal(client.metrics.captchaTasks,3);
  assert.equal(client.metrics.captchaRejected,1);
  assert(keys.every(key=>key==='configured-test-key'));
  assert(phases.some(p=>p.includes('rejected')));
  assert(phases.some(p=>p.includes('attempt 3')));
  assert.equal(phases.filter(p=>p.includes('Submitting')).length,3);
});

test("direct detail bootstrap sets session cookies and checks identity before CAPTCHA", async () => {
  const calls = [];
  const portal = new AssamPortal({ apiKey: 'test', sleep: async () => {}, fetchImpl: async (url, options) => {
    calls.push({url, options});
    return html(calls.length === 1 ? '<html>Home</html>' : detail().replace(tid, '2026_DoWR_99999_1'));
  }});
  await assert.rejects(portal.retrieve(tid, {detailLink: ASSAM_BASE + '?service=direct&sp=Sabc'}), /form changed|session expired/i);
  // A drifted detail link falls back to one exact-ID search page; it never downloads the other tender.
  assert.ok(calls.length >= 2 && calls.length <= 3);
  assert.match(calls[1].options.headers.Cookie, /JSESSIONID=testsession/);
  assert.equal(portal.metrics.captchaTasks, 0);
});

test("binary requests get a longer bounded timeout than page requests", async () => {
  let options;
  const portal = new AssamPortal({ sleep: async () => {} });
  portal.request = async (url, fields, opts) => { options = opts; return {mime:'application/pdf', bytes:Buffer.from('%PDF-test')}; };
  await portal.binary('/nicgep/file');
  assert.equal(options.timeoutMs, 90000);
  assert.equal(portal.metrics.downloads, 1);
});


test("listed oversized packets stop before a paid CAPTCHA", () => {
  assert.throws(() => assertPacketSize({manifest:[{name:'DNIT.pdf',listedSizeKB:'22141.29'}]}), /20 MB/);
  assert.throws(() => assertPacketSize({manifest:Array.from({length:4}, (_, i) => ({name:`part${i}.pdf`,listedSizeKB:'15000'}))}), /50 MB/);
  assert.doesNotThrow(() => assertPacketSize({manifest:[{name:'normal.pdf',listedSizeKB:'unknown'}]}));
});
test("binary timeout has an actionable typed error", async () => {
  const portal = new AssamPortal(); portal.request = async () => { const e = new Error('timeout'); e.name='TimeoutError'; throw e; };
  await assert.rejects(portal.binary('/nicgep/test'), e => e.status === 504 && /No tender was saved/.test(e.message));
});
test("catalogue original HTML is extracted as inactive readable text", async () => {
  const {extractOfficialDocument} = await import('../lib/desk/portal-import/extract.mjs');
  const result = await extractOfficialDocument(Buffer.from('<html><script>unsafe()</script><body><table><tr><td>RAM 8GB</td></tr></table></body></html>'), 'text/plain', 'catalogue.txt');
  assert.equal(result.status,'TEXT'); assert.match(result.text,/RAM 8GB/); assert.doesNotMatch(result.text,/unsafe/);
});
test("exact public GeM notice bypasses model discovery", async () => {
  const {resolveDiscovery}=await import('../lib/desk/portal-import/resolve.mjs');
  const result=await resolveDiscovery({link:'https://bidplus.gem.gov.in/showbidDocument/9780729'},()=>{throw Error('Unexpected model call')});
  assert.equal(result.candidate.sourceId,'gem');assert.equal(result.candidate.publicNotice,true);
});
