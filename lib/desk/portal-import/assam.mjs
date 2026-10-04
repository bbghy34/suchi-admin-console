import { load } from "cheerio";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ASSAM_BASE, ASSAM_HOST, TENDER_ID, PORTALS } from "./identity.mjs";

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;
export class PortalFetchError extends Error {
  constructor(message, { status = 502, retryAt = null, code = null } = {}) {
    super(message);
    this.status = status;
    this.retryAt = retryAt;
    this.code = code;
  }
}
const text = ($, el) => $(el).text().replace(/\s+/g, " ").trim();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const failure = (message) => {
  throw new PortalFetchError(message);
};
export function captchaRejected(html) {
  const $ = load(html);
  $("script,style").remove();
  return /invalid captcha/i.test($.text());
}

export function parseDetails(html) {
  const $ = load(html);
  const fields = {};
  const cells = $("td").toArray();
  cells.forEach((cell, i) => {
    if ($(cell).hasClass("td_caption") && $(cells[i + 1]).hasClass("td_field"))
      fields[text($, cell)] = text($, cells[i + 1]);
  });
  const manifest = [];
  $("tr").each((_, row) => {
    const cols = $(row).children("td").toArray();
    if (
      ![4, 5].includes(cols.length) ||
      !/^\d+\.?$/.test(text($, cols[0])) ||
      cols.some((c) => $(c).find("table").length)
    )
      return;
    const index = cols.length === 4 ? 1 : 2;
    const name = text($, cols[index]).replace("Digital Signature", "").trim();
    if (!/.+\.[A-Za-z0-9]{1,12}$/.test(name)) return;
    if (/[\\/\x00-\x1f]/.test(name) || name.startsWith("."))
      failure("Unexpected document filename on the official page.");
    manifest.push({
      name,
      type: cols.length === 4 ? "NIT" : text($, cols[1]),
      description: text($, cols[index + 1]),
      listedSizeKB: text($, cols[index + 2]),
    });
  });
  if (new Set(manifest.map((d) => d.name)).size !== manifest.length)
    failure("Duplicate document names need manual review.");
  return { fields, manifest };
}

export function assertDownloadAvailable(html, details = parseDetails(html)) {
  if (!details.manifest.length) return;
  const $ = load(html);
  const names = new Set(details.manifest.map(d => d.name));
  const available = $('a[href]').toArray().some(a =>
    $(a).attr('id') === 'docDownoad' || names.has(text($, a)) || /download as zip/i.test(text($, a)));
  if (!available) {
    const end = details.fields['Document Download / Sale End Date'];
    throw new PortalFetchError(
      `The official portal lists the documents but does not provide download links.${end ? ` Document download end: ${end}.` : ''} Open the official notice or upload a copy you already have.`,
      { status: 410, code: "SOURCE_DOWNLOAD_UNAVAILABLE" },
    );
  }
}

export function assertPacketSize(details) {
  const listed = details.manifest.map(d => ({ ...d, bytes: Number(String(d.listedSizeKB || '').replaceAll(',', '')) * 1024 }));
  const large = listed.find(d => Number.isFinite(d.bytes) && d.bytes > MAX_FILE);
  if (large) throw new PortalFetchError(`${large.name} is listed above the 20 MB file limit. Download this packet from the official portal and upload the needed documents manually.`, { status: 413 });
  if (listed.reduce((sum, d) => sum + (Number.isFinite(d.bytes) ? d.bytes : 0), 0) > MAX_TOTAL)
    throw new PortalFetchError('The listed documents exceed the 50 MB import limit. Use manual intake for this packet.', { status: 413 });
}

export function publicEvidence(html) {
  const $ = load(html);
  $("script, style, input, textarea, select, img").remove();
  const tables = $("table")
    .toArray()
    .map((table) =>
      $(table)
        .find("tr")
        .toArray()
        .map((row) =>
          $(row)
            .children("td,th")
            .toArray()
            .map((c) => text($, c)),
        ),
    );
  return { schemaVersion: 1, text: text($, $.root()), tables };
}

export function parseForm(html, formId, base = ASSAM_BASE) {
  const $ = load(html);
  const form = $(`form[id="${formId}"]`);
  if (form.length !== 1)
    failure("The government form changed or the session expired. Try again.");
  const fields = {},
    hidden = new Set();
  form.find("input,select,textarea").each((_, element) => {
    const el = $(element),
      name = el.attr("name"),
      type = (el.attr("type") || "").toLowerCase();
    if (
      !name ||
      el.is("[disabled]") ||
      ["button", "reset", "file", "image"].includes(type)
    )
      return;
    if (["checkbox", "radio"].includes(type) && !el.is("[checked]")) return;
    if (type === "hidden") hidden.add(name);
    fields[name] = String(el.val() ?? "");
  });
  const image = form.find("img#captchaImage").attr("src") || "";
  if (!image.startsWith("data:image/") || !image.includes(";base64,"))
    failure("The CAPTCHA image format changed.");
  const captcha = Buffer.from(
    decodeURIComponent(image.split(",")[1]),
    "base64",
  );
  if (!captcha.length || captcha.length > 1024 * 1024)
    failure("Invalid CAPTCHA image.");
  return {
    fields,
    hidden,
    captcha,
    action: new URL(form.attr("action"), base).href,
  };
}

export function zipFiles(bytes) {
  let total = 0,
    count = 0;
  const names = new Set();
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (file.name.endsWith("/")) return false;
      const pieces = file.name.replaceAll("\\", "/").split("/");
      if (
        file.name.startsWith("/") ||
        pieces.includes("..") ||
        pieces.some((p) => p.includes(":"))
      )
        failure("Unsafe path in the tender ZIP.");
      const name = pieces.at(-1);
      if (names.has(name)) failure("Duplicate filenames in the tender ZIP.");
      names.add(name);
      total += file.originalSize;
      count += 1;
      if (file.originalSize > MAX_FILE || total > MAX_TOTAL || count > 40)
        failure(
          "The tender ZIP exceeds the supported size. Use the official portal for this packet.",
        );
      return true;
    },
  });
  const files = new Map();
  for (const [name, buffer] of Object.entries(entries)) {
    if (buffer.length > MAX_FILE) failure("A document exceeds 20 MB.");
    files.set(
      name.replaceAll("\\", "/").split("/").at(-1),
      Buffer.from(buffer),
    );
  }
  return files;
}

export function validateDocument(name, bytes) {
  if (!bytes.length || bytes.length > MAX_FILE)
    failure("A document is empty or larger than 20 MB.");
  const head = bytes.subarray(0, 100).toString().trim().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html"))
    failure(
      "The portal returned a session or CAPTCHA page instead of a file. Try again.",
    );
  if (/\.pdf$/i.test(name) && bytes.subarray(0, 5).toString() !== "%PDF-")
    failure("Invalid PDF received from the portal.");
  if (
    /\.xls$/i.test(name) &&
    bytes.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1"
  )
    failure("Invalid Excel file received from the portal.");
  if (/\.(xlsx|docx)$/i.test(name) && bytes.subarray(0, 2).toString() !== "PK")
    failure("Invalid Office document received from the portal.");
}

/** One tender per user action. Cookies and CAPTCHA answers never leave this instance. */
export class AssamPortal {
  constructor({
    portal = PORTALS[0],
    apiKey,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    deadlineMs = 240000,
    onEvent = () => {},
  } = {}) {
    if (!PORTALS.some((p) => p === portal))
      throw new Error("Unregistered portal");
    this.portal = portal;
    this.base = portal.base;
    this.host = portal.host;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.now = now;
    this.deadline = now() + deadlineMs;
    this.cookies = new Map();
    this.lastRequest = 0;
    this.onEvent = onEvent;
    this.metrics = {
      requests: 0,
      retries: 0,
      captchaTasks: 0,
      captchaRejected: 0,
      captchaCostUSD: 0,
      downloads: 0,
      bytes: 0,
      captchaMs: 0,
      downloadMs: 0,
    };
  }
  remaining() {
    const ms = this.deadline - this.now();
    if (ms < 100)
      failure("Official retrieval timed out. Nothing was saved; try again.");
    return ms;
  }
  async wait(ms) {
    if (ms >= this.remaining())
      failure("Official retrieval timed out. Try again.");
    await this.sleep(ms);
  }
  async request(rawUrl, fields = null, { timeoutMs = 30000 } = {}) {
    let url = new URL(rawUrl, this.base);
    let redirects = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (
        url.origin !== `https://${this.host}` ||
        !url.pathname.startsWith(
          this.portal.path.slice(0, this.portal.path.lastIndexOf("/") + 1),
        ) ||
        url.username ||
        url.password
      )
        failure("Unexpected government download destination.");
      await this.wait(Math.max(0, 2000 - (this.now() - this.lastRequest)));
      this.metrics.requests++;
      const response = await this.fetchImpl(url.href, {
        method: fields ? "POST" : "GET",
        redirect: "manual",
        cache: "no-store",
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Suchii-Tender-Import/1.0",
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(fields
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                Origin: `https://${this.host}`,
                Referer: this.base,
              }
            : {}),
        },
        body: fields ? new URLSearchParams(fields).toString() : undefined,
        signal: AbortSignal.timeout(Math.min(timeoutMs, this.remaining())),
      });
      this.lastRequest = this.now();
      for (const cookie of response.headers.getSetCookie?.() || []) {
        const pair = cookie.split(";")[0],
          index = pair.indexOf("=");
        if (index > 0)
          this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      this.onEvent({
        event: "request",
        status: response.status,
        page: url.searchParams.get("page") || fields?.page || "",
        attempt: attempt + 1,
      });
      if (response.status === 429 || response.status === 503) {
        const raw = response.headers.get("retry-after");
        const seconds =
          raw && /^\d+$/.test(raw)
            ? Number(raw)
            : raw
              ? (Date.parse(raw) - this.now()) / 1000
              : 60;
        const retryAt =
          this.now() +
          Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000;
        await response.body?.cancel();
        throw new PortalFetchError(
          "The government portal is busy. Please try again after its cooldown.",
          { status: 429, retryAt },
        );
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || ++redirects > 3)
          failure("Unexpected portal redirect.");
        url = new URL(location, url);
        if (
          response.status === 303 ||
          ([301, 302].includes(response.status) && fields)
        )
          fields = null;
        attempt--;
        continue;
      }
      if (response.status >= 500 && !fields && attempt < 2) {
        await response.body?.cancel();
        this.metrics.retries++;
        this.onEvent({ event: "phase", phase: "The government portal is responding slowly. Waiting briefly before retrying…" });
        await this.wait(5000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        failure(
          `Government portal request failed (${response.status}). Try again later.`,
        );
      }
      const limit = MAX_TOTAL;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        failure("Official response exceeds 50 MB.");
      }
      const chunks = [];
      let length = 0;
      const reader = response.body.getReader();
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > limit) {
          await reader.cancel();
          failure("Official response exceeds 50 MB.");
        }
        chunks.push(item.value);
      }
      return {
        bytes: Buffer.concat(chunks),
        mime: response.headers.get("content-type") || "",
        url: url.href,
      };
    }
    failure("The government portal could not be reached.");
  }
  async page(url, fields) {
    const response = await this.request(url, fields);
    this.resolvedUrl = response.url;
    if (!response.mime.includes("html"))
      failure("The government portal returned an unexpected page.");
    const html = response.bytes.toString("utf8");
    if (/session.{0,60}(expired|timed out)/i.test(load(html).text()))
      failure("The government session expired. Try again.");
    return html;
  }
  async solve(image) {
    const started = this.now();
    try {
      if (++this.metrics.captchaTasks > 4)
        failure("CAPTCHA retry limit reached. Try again later.");
      this.onEvent({ event: "phase", phase: `Solving CAPTCHA · attempt ${this.metrics.captchaTasks}…` });
      const call = async (method, fields) => {
        const response = await this.fetchImpl(
          `https://api.2captcha.com/${method}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientKey: this.apiKey, ...fields }),
            signal: AbortSignal.timeout(Math.min(20000, this.remaining())),
          },
        );
        if (!response.ok)
          failure("The CAPTCHA service is unavailable. Try again later.");
        const data = await response.json();
        if (data.errorId)
          failure(
            "The CAPTCHA service could not solve this challenge. Check its account balance or try later.",
          );
        return data;
      };
      // The portal PNG has transparent pixels. Flatten before recognition so black
      // characters stay visible regardless of the solver's image viewer background.
      const readable = await sharp(image, { limitInputPixels: 1000000 })
        .flatten({ background: "#ffffff" })
        .resize({ width: 600, height: 200, fit: "inside" })
        .png()
        .toBuffer();
      const created = await call("createTask", {
        languagePool: "en",
        task: {
          type: "ImageToTextTask",
          body: readable.toString("base64"),
          case: true,
          minLength: 6,
          maxLength: 6,
          comment:
            "CASE SENSITIVE: type exactly as shown. Lowercase letters must stay lowercase. Six characters.",
        },
      });
      if (!created.taskId) failure("The CAPTCHA service did not create a task.");
      this.lastCaptchaTaskId = created.taskId;
      const end = Math.min(this.deadline, this.now() + 120000);
      while (this.now() < end) {
        await this.wait(5000);
        const result = await call("getTaskResult", { taskId: created.taskId });
        if (result.status === "processing") continue;
        const answer = result.solution?.text?.trim();
        if (result.status !== "ready" || !answer || answer.length !== 6)
          failure("The CAPTCHA service returned an unusable answer.");
        this.metrics.captchaCostUSD += Number(result.cost) || 0;
        return answer;
      }
      failure("The CAPTCHA service timed out. Try again later.");
    } finally { this.metrics.captchaMs += this.now() - started; }
  }
  async submit(html, formId, overrides = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const form = parseForm(html, formId, this.base);
      const answer = await this.solve(form.captcha);
      this.onEvent({ event: "phase", phase: "Submitting CAPTCHA…" });
      html = await this.page(form.action, {
        ...form.fields,
        ...overrides,
        captchaText: answer,
      });
      if (!captchaRejected(html)) return html;
      this.metrics.captchaRejected++;
      this.reportIncorrectCaptcha();
      this.onEvent({ event: "phase", phase: attempt < 2 ? "CAPTCHA rejected; trying again…" : "CAPTCHA rejected after three attempts." });
    }
    throw new PortalFetchError("The portal rejected three CAPTCHA answers. No files were downloaded. Try again later.", { code: "CAPTCHA_REJECTED" });
  }
  /** Tell 2Captcha the portal rejected its answer, so that answer is refunded. Never blocks or fails a download. */
  reportIncorrectCaptcha() {
    const taskId = this.lastCaptchaTaskId;
    this.lastCaptchaTaskId = null;
    if (!taskId || !this.apiKey) return;
    Promise.resolve()
      .then(() => this.fetchImpl("https://api.2captcha.com/reportIncorrect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: this.apiKey, taskId }),
        signal: AbortSignal.timeout(5000),
      }))
      .then(() => { this.metrics.captchaReported = (this.metrics.captchaReported || 0) + 1; })
      .catch(() => {});
  }
  async binary(url) {
    if (++this.metrics.downloads > 12)
      failure("This packet has too many downloads for one import.");
    this.onEvent({ event: "phase", phase: `Downloading file ${this.metrics.downloads}…` });
    let response;
    const started = this.now();
    try { response = await this.request(url, null, { timeoutMs: 90000 }); }
    catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError")
        throw new PortalFetchError("The official file download exceeded its time limit. No tender was saved. Try later or download from the official portal.", { status: 504 });
      throw error;
    } finally { this.metrics.downloadMs += this.now() - started; }
    if (response.mime.includes("html"))
      failure("The document session expired. Try again.");
    this.metrics.bytes += response.bytes.length;
    if (this.metrics.bytes > MAX_TOTAL)
      failure("This tender exceeds the 50 MB import limit.");
    return response.bytes;
  }
  async resolveDetail(link) {
    if (!this.cookies.size) await this.page(this.base);
    const html = await this.page(link);
    const details = parseDetails(html);
    // Resolve identity before checking file availability. Session-sequenced links
    // can open an unrelated closed notice; the caller must compare it with the
    // selected result before reporting anything about that result's documents.
    const id = details.fields["Tender ID"];
    this.resolvedFields = details.fields;
    if (!TENDER_ID.test(id || ""))
      failure(
        "This link has expired or is not an exact tender. Enter the Tender ID from the official notice.",
      );
    return id;
  }
  async findReference(reference) {
    if (
      typeof reference !== "string" ||
      reference.trim().length < 4 ||
      reference.length > 150
    )
      failure("Enter the official tender reference number (4–150 characters).");
    let html = await this.page(
      this.base + "?page=WebTenderStatusLists&service=page",
    );
    html = await this.submit(html, "frmSearchFilter", {
      tenderRefNo: reference.trim(),
    });
    const $ = load(html);
    const candidates = $("table#tabList tr")
      .toArray()
      .flatMap((row) => {
        const cells = $(row).children("td");
        const tenderId = text($, cells.eq(1));
        if (!TENDER_ID.test(tenderId)) return [];
        return [
          {
            tenderId,
            titleAndReference: text($, cells.eq(2)),
            organisation: text($, cells.eq(3)),
            status: text($, cells.eq(4)),
          },
        ];
      });
    return {
      candidates: candidates.slice(0, 10),
      more: !!$("a#loadNext").length,
    };
  }
  async openById(tenderId) {
    let html = await this.page(this.base + "?page=WebTenderStatusLists&service=page");
    html = await this.submit(html, "frmSearchFilter", { tenderId });
    const $ = load(html);
    const matches = $("table#tabList tr")
      .toArray()
      .filter((row) => text($, $(row).children("td").eq(1)) === tenderId);
    if (matches.length !== 1)
      failure(
        "The exact tender ID was not found on the official portal. Check the ID and try again.",
      );
    const href = $(matches[0])
      .find('a[title="View Tender Status"]')
      .attr("href");
    const sp = href && new URL(href, this.base).searchParams.getAll("sp");
    if (sp?.length !== 1) failure("The official tender link changed.");
    return this.page(
      this.base +
        "?" +
        new URLSearchParams({
          component: "$DirectLink",
          page: "Home",
          service: "direct",
          session: "T",
          sp: sp[0],
        }),
    );
  }
  async retrieve(tenderId, { detailLink = null } = {}) {
    if (!TENDER_ID.test(tenderId)) failure("Invalid tender ID.");
    if (!this.apiKey)
      throw new PortalFetchError("Official retrieval is not configured yet.", {
        status: 503,
      });
    this.onEvent({ event: "phase", phase: "Finding the official tender" });
    let html;
    if (detailLink) {
      const direct = new URL(detailLink, this.base);
      if (direct.pathname !== this.portal.path || direct.searchParams.get('service') !== 'direct' || !direct.searchParams.has('sp'))
        failure('Choose an official tender detail link.');
      // A public detail link already identifies the notice. Verify its ID below
      // before solving the download challenge; avoid a second paid search CAPTCHA.
      if (!this.cookies.size) await this.page(this.base);
      html = await this.page(direct.href);
      // Portal "sp" links are session-sequenced: a reopened link can land on
      // another tender or a list page. Fall back to the exact-ID search.
      if (parseDetails(html).fields["Tender ID"] !== tenderId) {
        this.onEvent({ event: "phase", phase: "Detail link expired · searching the portal by Tender ID" });
        html = await this.openById(tenderId);
      }
    } else {
      html = await this.openById(tenderId);
    }
    const details = parseDetails(html);
    if (details.fields["Tender ID"] !== tenderId)
      failure(
        "The official portal returned a different tender. Nothing was saved.",
      );
    if (!details.manifest.length || details.manifest.length > 40)
      failure("No supported document list was found for this tender.");
    this.resolvedFields = details.fields;
    assertDownloadAvailable(html, details);
    assertPacketSize(details);
    const evidence = publicEvidence(html);
    let dom = load(html);
    const gate = dom("a#docDownoad").attr("href");
    if (gate) {
      this.onEvent({ event: "phase", phase: "Unlocking official files" });
      html = await this.page(new URL(gate, this.base).href);
      html = await this.submit(html, "frmCaptcha");
      dom = load(html);
    }
    if (
      dom("form#frmCaptcha,a#docDownoad").length ||
      parseDetails(html).fields["Tender ID"] !== tenderId
    )
      failure("The document CAPTCHA did not unlock this tender.");
    const links = new Map(
      dom("a[href]")
        .toArray()
        .map((a) => [
          text(dom, a),
          new URL(dom(a).attr("href"), this.base).href,
        ]),
    );
    const zipLink = [...links].find(([name]) =>
      /download as zip/i.test(name),
    )?.[1];
    let archive = null,
      unpacked = null;
    const documents = [];
    this.onEvent({ event: "phase", phase: "Downloading official files" });
    for (const item of details.manifest) {
      let bytes;
      if (links.has(item.name)) bytes = await this.binary(links.get(item.name));
      else {
        if (!zipLink)
          failure(`No official download was found for ${item.name}.`);
        if (!unpacked) {
          archive = await this.binary(zipLink);
          unpacked = zipFiles(archive);
        }
        bytes = unpacked.get(item.name);
        if (!bytes)
          failure(
            "The official ZIP is missing a listed document. Nothing was saved.",
          );
      }
      validateDocument(item.name, bytes);
      documents.push({ ...item, bytes, sha256: hash(bytes) });
    }
    // Retain the original packet too, including any unlisted supporting files.
    if (archive)
      documents.push({
        name: "official-work-items.zip",
        type: "Other",
        bytes: archive,
        sha256: hash(archive),
      });
    return {
      ...details,
      portal: this.portal,
      evidence,
      documents,
      metrics: { ...this.metrics },
      retrievedAt: new Date(this.now()).toISOString(),
    };
  }
}
