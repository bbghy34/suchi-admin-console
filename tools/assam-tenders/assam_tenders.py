#!/usr/bin/env python3
"""Session-based Assam tender client. Python 3.10+ and curl; no pip packages."""

from __future__ import annotations

import base64
import json
import re
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import subprocess
import tempfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import (
    unquote,
    unquote_to_bytes,
    urlencode,
    urljoin,
    urlsplit,
    parse_qs,
)

BASE = "https://assamtenders.gov.in/nicgep/app"


class PortalError(RuntimeError):
    pass


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find_all(self, tag=None, **attrs):
        found = []
        for child in self.children:
            if isinstance(child, Node):
                if (tag is None or child.tag == tag) and all(
                    child.attrs.get(k) == v for k, v in attrs.items()
                ):
                    found.append(child)
                found.extend(child.find_all(tag, **attrs))
        return found

    def text(self):
        if self.tag in {"script", "style"}:
            return ""
        return " ".join(
            " ".join(
                c.text() if isinstance(c, Node) else c for c in self.children
            ).split()
        )


class DOM(HTMLParser):
    VOID = {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


@dataclass
class Page:
    url: str
    html: str

    @property
    def dom(self):
        return DOM(self.html).root


@dataclass
class SearchForm:
    page: Page
    action: str
    fields: dict[str, str]
    options: dict[str, dict[str, str]]
    captcha: bytes


def form_fields(form):
    """Serialize enabled browser form controls, including current hidden state."""
    fields, options = {}, {}
    for node in form.find_all():
        a, tag = node.attrs, node.tag
        name = a.get("name")
        if not name or "disabled" in a:
            continue
        if tag == "input":
            kind = a.get("type", "text").lower()
            if kind in {"submit", "button", "reset", "file", "image"}:
                continue
            if kind in {"checkbox", "radio"} and "checked" not in a:
                continue
            fields[name] = a.get("value", "on" if kind in {"checkbox", "radio"} else "")
        elif tag == "select":
            items = [n for n in node.find_all("option") if "disabled" not in n.attrs]
            options[name] = {n.text(): n.attrs.get("value", n.text()) for n in items}
            selected = next(
                (n for n in items if "selected" in n.attrs), items[0] if items else None
            )
            if selected:
                fields[name] = selected.attrs.get("value", selected.text())
        elif tag == "textarea":
            fields[name] = node.text()
    return fields, options


def validate_page(page):
    text = page.dom.text().lower()
    if re.search(r"session.{0,60}(?:expired|timed out)", text):
        raise PortalError(
            "Session expired. Start a fresh search; do not replay old links or tokens."
        )


def document_links(page):
    documents = []
    for a in page.dom.find_all("a"):
        name = a.text()
        href = a.attrs.get("href", "")
        if href and (
            re.search(r".+\.[A-Za-z0-9]{1,12}$", name, re.I)
            or "download as zip" in name.lower()
        ):
            documents.append({"name": name, "url": urljoin(page.url, href)})
    return documents


def status_rows(page):
    tables = page.dom.find_all("table", id="tabList")
    if not tables:
        return []
    rows = []
    for row in tables[0].find_all("tr"):
        cells = [n for n in row.children if isinstance(n, Node) and n.tag == "td"]
        links = row.find_all("a", title="View Tender Status")
        if (
            len(cells) >= 5
            and links
            and re.fullmatch(r"\d{4}_[A-Za-z0-9]+_\d+_\d+", cells[1].text())
        ):
            rows.append(
                {
                    "tender_id": cells[1].text(),
                    "title_and_reference": cells[2].text(),
                    "organisation": cells[3].text(),
                    "stage": cells[4].text(),
                    "status_url": urljoin(page.url, links[0].attrs["href"]),
                }
            )
    return rows


def detail_metadata(page):
    result = {}
    cells = page.dom.find_all("td")
    for i, cell in enumerate(cells[:-1]):
        if (
            "td_caption" in cell.attrs.get("class", "").split()
            and "td_field" in cells[i + 1].attrs.get("class", "").split()
        ):
            result[cell.text()] = cells[i + 1].text()
    return result


def document_manifest(page):
    """Include non-linked work-item names, which are delivered in the ZIP."""
    result = []
    seen = set()
    for row in page.dom.find_all("tr"):
        cells = [n for n in row.children if isinstance(n, Node) and n.tag == "td"]
        if (
            len(cells) not in {4, 5}
            or not cells[0].text().strip(".").isdigit()
            or any(c.find_all("table") for c in cells)
        ):
            continue
        index = 1 if len(cells) == 4 else 2
        name = cells[index].text().replace("Digital Signature", "").strip()
        if not re.search(r".+\.[A-Za-z0-9]{1,12}$", name, re.I):
            continue
        kind = "NIT" if len(cells) == 4 else cells[1].text()
        key = (kind, name)
        if key not in seen:
            seen.add(key)
            result.append(
                {
                    "name": name,
                    "document_type": kind,
                    "description": cells[index + 1].text(),
                    "listed_size_kb": cells[index + 2].text(),
                }
            )
    return result


class AssamTenders:
    """One anonymous cookie session; use as a context manager, serially."""

    def __init__(
        self, timeout=90, delay=2.0, retries=4, trace=None, cooldown_path=None
    ):
        self.timeout = timeout
        self.cooldown_path = Path(cooldown_path) if cooldown_path else None
        self.delay, self.retries, self.trace = delay, retries, trace
        self._last_request = 0.0
        self._temp = tempfile.TemporaryDirectory(prefix="assam-tenders-")
        self._dir = Path(self._temp.name)
        self._cookies = self._dir / "cookies.txt"
        self._cookies.touch(mode=0o600)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self._temp.cleanup()

    def request(self, url, data=None, referer=None):
        # Only follow portal actions here. External software links are catalogued,
        # not fetched or executed by this client.
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != "assamtenders.gov.in":
            raise PortalError("Expected an HTTPS Assam portal URL.")
        body = self._dir / "response.bin"
        headers = self._dir / "headers.txt"
        cmd = [
            "curl",
            "--silent",
            "--show-error",
            "--fail",
            "--location",
            "--max-redirs",
            "5",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--compressed",
            "--max-time",
            str(self.timeout),
            "--max-filesize",
            str(256 * 1024 * 1024),
            "--cookie",
            str(self._cookies),
            "--cookie-jar",
            str(self._cookies),
            "--output",
            str(body),
            "--dump-header",
            str(headers),
            "--write-out",
            "%{url_effective}\n%{content_type}\n%{http_code}",
        ]
        if referer:
            cmd += ["--referer", referer]
        if data is not None:
            cmd += [
                "--header",
                "Origin: https://assamtenders.gov.in",
                "--header",
                "Content-Type: application/x-www-form-urlencoded",
                "--data-binary",
                "@-",
            ]
        for attempt in range(self.retries + 1):
            if self.cooldown_path and self.cooldown_path.exists():
                until = json.loads(self.cooldown_path.read_text()).get("until", 0)
                if until > time.time():
                    raise PortalError(
                        "Persisted portal cooldown is active; retry after "
                        + datetime.fromtimestamp(until, timezone.utc).isoformat()
                    )
            began = time.monotonic()
            time.sleep(max(0, self.delay - (time.monotonic() - self._last_request)))
            result = subprocess.run(
                cmd + [url],
                input=urlencode(data).encode() if data is not None else None,
                capture_output=True,
            )
            self._last_request = time.monotonic()
            parts = result.stdout.decode().splitlines()
            status = int(parts[-1]) if parts and parts[-1].isdigit() else 0
            header_text = (
                headers.read_text(errors="replace") if headers.exists() else ""
            )
            if self.trace:
                from urllib.parse import parse_qs

                q = parse_qs(urlsplit(url).query)
                self.trace(
                    {
                        "method": "POST" if data is not None else "GET",
                        "page": q.get("page", [data.get("page", "") if data else ""])[
                            0
                        ],
                        "component": q.get(
                            "component", [data.get("component", "") if data else ""]
                        )[0],
                        "status": status,
                        "elapsed_seconds": round(time.monotonic() - began, 3),
                        "attempt": attempt + 1,
                        "post_fields": sorted(data) if data else [],
                    }
                )
            if not result.returncode:
                if not 200 <= status < 300:
                    raise PortalError(f"Unexpected HTTP status {status}.")
                if urlsplit(parts[0]).netloc != "assamtenders.gov.in":
                    raise PortalError("Portal redirected outside expected host.")
                break
            retryable = status in {429, 500, 502, 503, 504} or result.returncode in {
                6,
                7,
                28,
                52,
                56,
            }
            # An ambiguous POST timeout may have consumed CAPTCHA/state: restart the
            # transaction on the next run instead of replaying it.
            if data is not None and status not in {429, 503}:
                retryable = False
            wait = min(120, 5 * 2**attempt) + random.uniform(0, 2)
            retry_after = re.findall(r"(?im)^Retry-After:\s*(.+)$", header_text)
            if retry_after:
                try:
                    raw = retry_after[-1].strip()
                    seconds = (
                        float(raw)
                        if raw.isdigit()
                        else (
                            parsedate_to_datetime(raw) - datetime.now(timezone.utc)
                        ).total_seconds()
                    )
                    wait = max(wait, seconds)
                except (ValueError, TypeError):
                    pass
            if status in {429, 503} and self.cooldown_path:
                temporary = self.cooldown_path.with_suffix(".tmp")
                temporary.write_text(
                    json.dumps({"until": time.time() + wait, "status": status})
                )
                temporary.replace(self.cooldown_path)
            if not retryable or attempt == self.retries:
                raise PortalError(
                    f"HTTP request failed (status {status}, curl {result.returncode}); checkpoint retained."
                )
            if self.trace:
                self.trace(
                    {"event": "backoff", "status": status, "seconds": round(wait, 3)}
                )
            if wait > 60:
                raise PortalError(
                    f"Server requests a {wait:.0f}s cooldown; stop and run later."
                )
            print(f"HTTP {status or 'network error'}; retry in {wait:.1f}s", flush=True)
            time.sleep(wait)
        final_url, content_type = parts[0], parts[1]
        return (
            body.read_bytes(),
            final_url,
            content_type.strip(),
            headers.read_text(errors="replace"),
        )

    def captcha_form(self, page, form_id):
        forms = page.dom.find_all("form", id=form_id)
        if len(forms) != 1:
            raise PortalError(f"Expected form {form_id} is absent.")
        form = forms[0]
        fields, options = form_fields(form)
        image = form.find_all("img", id="captchaImage")
        if not image:
            raise PortalError("CAPTCHA image absent.")
        src = image[0].attrs["src"]
        if src.startswith("data:image/"):
            meta, value = src.split(",", 1)
            captcha = (
                base64.b64decode(unquote(value))
                if ";base64" in meta
                else unquote_to_bytes(value)
            )
        else:
            captcha, _, mime, _ = self.request(urljoin(page.url, src), referer=page.url)
            if not mime.startswith("image/"):
                raise PortalError("CAPTCHA response is not an image.")
        submits = form.find_all("input", type="submit")
        if len(submits) != 1:
            raise PortalError("Expected exactly one form submit button.")
        fields[submits[0].attrs["name"]] = submits[0].attrs.get("value", "")
        return SearchForm(
            page, urljoin(page.url, form.attrs["action"]), fields, options, captcha
        )

    def submit_captcha(self, form, solve_captcha):
        for attempt in range(3):
            answer = solve_captcha(form.captcha).strip()
            if len(answer) != 6:
                raise PortalError("CAPTCHA callback must return six characters.")
            body, url, mime, _ = self.request(
                form.action, {**form.fields, "captchaText": answer}, form.page.url
            )
            if "html" not in mime:
                raise PortalError("Expected an HTML page after CAPTCHA submission.")
            page = Page(url, body.decode("utf-8", errors="replace"))
            validate_page(page)
            rejected = "invalid captcha" in page.dom.text().lower()
            if self.trace:
                self.trace(
                    {
                        "event": "captcha_submission",
                        "accepted": not rejected,
                        "attempt": attempt + 1,
                    }
                )
            if hasattr(solve_captcha, "record_submission"):
                solve_captcha.record_submission(not rejected)
            if not rejected:
                return page
            if attempt == 2:
                raise PortalError("CAPTCHA rejected three times; checkpoint retained.")
            forms = [
                f
                for f in page.dom.find_all("form")
                if f.find_all("img", id="captchaImage")
            ]
            if len(forms) != 1:
                raise PortalError("CAPTCHA rejected without a fresh retry form.")
            fresh = self.captcha_form(page, forms[0].attrs["id"])
            # Retain user filters, but always use the server's new hidden fields.
            hidden = {
                n.attrs.get("name") for n in forms[0].find_all("input", type="hidden")
            }
            for key, value in form.fields.items():
                if key not in hidden and key != "captchaText" and key in fresh.fields:
                    fresh.fields[key] = value
            form = fresh
            print(
                f"CAPTCHA rejected; retrying fresh challenge ({attempt + 2}/3)",
                flush=True,
            )

    def status_search(
        self,
        solve_captcha,
        since=None,
        until=None,
        tender_id="",
        query="",
        organisation=None,
    ):
        page = self.get_page(BASE + "?page=WebTenderStatusLists&service=page")
        form = self.captcha_form(page, "frmSearchFilter")
        form.fields.update(tenderId=tender_id, KeyWord2=query)
        if organisation:
            if organisation not in form.options["OrganName"]:
                raise PortalError(f"Organisation is no longer listed: {organisation}")
            form.fields["OrganName"] = form.options["OrganName"][organisation]
        if since:
            if not organisation:
                raise ValueError(
                    "Published date status search requires an organisation."
                )
            form.fields["publishedFromDate"] = since.strftime("%d/%m/%Y")
            form.fields["publishedToDate"] = until.strftime("%d/%m/%Y")
        page = self.submit_captcha(form, solve_captcha)
        if not page.dom.find_all("table", id="tabList") or (
            not status_rows(page)
            and not re.search(
                r"no\s+(?:\w+\s+)?tenders?\s+found", page.dom.text(), re.I
            )
        ):
            raise PortalError("Status search did not produce a verified result list.")
        return page

    def organisations(self):
        page = self.get_page(BASE + "?page=WebTenderStatusLists&service=page")
        return list(self.captcha_form(page, "frmSearchFilter").options["OrganName"])[1:]

    def next_status_page(self, page):
        links = page.dom.find_all("a", id="loadNext")
        if not links:
            return None
        result = self.get_page(urljoin(page.url, links[0].attrs["href"]), page.url)
        if not result.dom.find_all("table", id="tabList"):
            raise PortalError("Status pagination did not return its results table.")
        return result

    def public_details(self, row):
        # Live verified: the Home detail action and status View action receive the
        # same opaque tender sp parameter. It is not a CAPTCHA or download token.
        sp = parse_qs(urlsplit(row["status_url"]).query).get("sp")
        if not sp or len(sp) != 1:
            raise PortalError("Status row does not have exactly one tender reference.")
        url = (
            BASE
            + "?"
            + urlencode(
                {
                    "component": "$DirectLink",
                    "page": "Home",
                    "service": "direct",
                    "session": "T",
                    "sp": sp[0],
                }
            )
        )
        page = self.get_page(url)
        metadata = detail_metadata(page)
        if metadata.get("Tender ID") != row["tender_id"]:
            raise PortalError(
                "Public detail action returned a different tender; nothing downloaded."
            )
        return page

    def unlock_documents(self, details, solve_captcha):
        gates = details.dom.find_all("a", id="docDownoad")
        if not gates:
            return details
        page = self.get_page(urljoin(details.url, gates[0].attrs["href"]), details.url)
        page = self.submit_captcha(self.captcha_form(page, "frmCaptcha"), solve_captcha)
        if page.dom.find_all("form", id="frmCaptcha") or page.dom.find_all(
            "a", id="docDownoad"
        ):
            raise PortalError("Document CAPTCHA did not unlock the download links.")
        return page

    def get_page(self, url, referer=None):
        body, final_url, content_type, _ = self.request(url, referer=referer)
        if "html" not in content_type:
            raise PortalError(f"Expected HTML, received {content_type!r}.")
        page = Page(final_url, body.decode("utf-8", errors="replace"))
        validate_page(page)
        return page

    def download(self, document, destination):
        """Fetch a current same-session document link; never save an HTML gate as PDF."""
        body, _, mime, _ = self.request(document["url"])
        prefix = body.lstrip()[:100].lower()
        if "html" in mime or prefix.startswith((b"<!doctype html", b"<html")):
            raise PortalError(
                "Document returned an HTML page (possibly a CAPTCHA/session gate); no file saved."
            )
        if not body:
            raise PortalError("Document response was empty.")
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as f:
            f.write(body)
        return {
            "path": str(destination.resolve()),
            "bytes": len(body),
            "content_type": mime,
        }


def manual_captcha(image_bytes: bytes) -> str:
    """Replace this callback with your own image-to-text function."""
    path = Path("captcha.png").resolve()
    path.write_bytes(image_bytes)
    print(f"CAPTCHA saved to {path}", flush=True)
    return input("Enter CAPTCHA exactly as shown: ").strip()
