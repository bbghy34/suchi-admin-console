import csv
import io
import json
import subprocess
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

from assam_tenders import (
    AssamTenders,
    BASE,
    DOM,
    Page,
    PortalError,
    SearchForm,
    detail_metadata,
    document_manifest,
    form_fields,
    status_rows,
)
from captcha_solver import TwoCaptcha, SolverError
from ingest import LimitReached, Pipeline, Store, previous_month, unpack

TID = "2026_DoWR_54237_1"
DETAILS = """<table><tr><td class="td_caption">Tender ID</td><td class="td_field">2026_DoWR_54237_1</td></tr>
<tr><span><td class="td_caption">Tender Value in ₹</td><td class="td_field">2,29,99,654</td></span><td class="td_caption">Product Category</td><td class="td_field">Civil Works</td></tr></table>
<table><tr><td>1</td><td><a href="/nit">Tendernotice_1.pdf</a></td><td>NIT</td><td>3.0</td></tr></table>
<a href="/zip">Download as zip file</a><table><tr><td>1</td><td>Tender Documents</td><td>bid.pdf</td><td>Bid document</td><td>2</td></tr>
<tr><td>2</td><td>BOQ</td><td>BOQ.xls</td><td>BOQ</td><td>1</td></tr></table>"""


class FakeClient:
    def __init__(self):
        self.calls = []

    def public_details(self, row):
        return Page(BASE, DETAILS)

    def unlock_documents(self, page, solver):
        return page

    def download(self, document, destination):
        self.calls.append(document["name"])
        if "zip" in document["name"]:
            with zipfile.ZipFile(destination, "w") as z:
                z.writestr("bid.pdf", b"%PDF-1.7\nfixture")
                z.writestr("BOQ.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1fixture")
        else:
            Path(destination).write_bytes(b"%PDF-1.7\nfixture")


class Tests(unittest.TestCase):
    def test_month_boundary(self):
        self.assertEqual(previous_month(date(2026, 3, 31)), date(2026, 2, 28))
        self.assertEqual(previous_month(date(2024, 3, 31)), date(2024, 2, 29))
        self.assertEqual(previous_month(date(2026, 1, 30)), date(2025, 12, 30))

    def test_form_preserves_hidden_and_ignores_unchecked(self):
        form = DOM(
            '<form><input type="hidden" name="tokenSecret" value="new"><input type="checkbox" name="no"><input type="checkbox" name="yes" checked><select name="kind"><option value="1">One</option><option selected value="4">Open Tender</option></select></form>'
        ).root.find_all("form")[0]
        fields, options = form_fields(form)
        self.assertEqual(fields, {"tokenSecret": "new", "yes": "on", "kind": "4"})
        self.assertEqual(options["kind"]["Open Tender"], "4")

    def test_invalid_html_wrappers_metadata(self):
        m = detail_metadata(Page(BASE, DETAILS))
        self.assertEqual(m["Tender Value in ₹"], "2,29,99,654")
        self.assertEqual(m["Tender ID"], TID)
        self.assertNotIn("1", m)

    def test_nonlinked_work_documents(self):
        docs = document_manifest(Page(BASE, DETAILS))
        self.assertEqual(
            [d["name"] for d in docs], ["Tendernotice_1.pdf", "bid.pdf", "BOQ.xls"]
        )

    def test_status_icon_link(self):
        page = Page(
            BASE,
            '<table id="tabList"><tr><td>1.</td><td>'
            + TID
            + '</td><td>[Title][REF]</td><td>Department</td><td>To_be_Opened</td><td><a title="View Tender Status" href="?page=WebTenderStatusLists&amp;sp=Sopaque"><img></a></td></tr></table>',
        )
        rows = status_rows(page)
        self.assertEqual(rows[0]["tender_id"], TID)
        self.assertIn("sp=Sopaque", rows[0]["status_url"])

    def test_zip_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            archive = Path(d) / "bad.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("../escape.pdf", "bad")
            with self.assertRaises(PortalError):
                unpack(archive, Path(d) / "files")
            self.assertFalse((Path(d) / "escape.pdf").exists())

    def test_duplicate_zip_names_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            archive = Path(d) / "bad.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("a/same.pdf", "a")
                z.writestr("b/same.pdf", "b")
            with self.assertRaises(PortalError):
                unpack(archive, Path(d) / "files")

    @patch("ingest.pdf_metadata", return_value={"Pages": "3", "Author": "Test"})
    def test_partial_resume_and_no_duplicate_csv(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = Store(d)
            row = {
                "tender_id": TID,
                "status_url": "https://example.invalid/session-token",
            }
            store.discover(row, "Org")
            client = FakeClient()
            with self.assertRaises(LimitReached):
                Pipeline(client, store, None, max_downloads=1).process(row)
            self.assertEqual(client.calls, ["Tendernotice_1.pdf"])
            self.assertFalse(store.complete(TID))
            self.assertNotIn(
                "session-token",
                store.db.execute("select listing from tenders").fetchone()[0],
            )
            # Reopen SQLite as a fresh invocation: completed asset is not fetched again.
            store.db.close()
            store = Store(d)
            self.addCleanup(store.db.close)
            resumed = FakeClient()
            pipe = Pipeline(resumed, store, None)
            self.assertTrue(pipe.process(row))
            self.assertEqual(resumed.calls, ["Download as zip file"])
            self.assertTrue(store.complete(TID))
            self.assertFalse(pipe.process(row))
            self.assertEqual(resumed.calls, ["Download as zip file"])
            with (Path(d) / "documents.csv").open() as f:
                rows = list(csv.DictReader(f))
            self.assertEqual(len(rows), 3)
            self.assertEqual(len({r["name"] for r in rows}), 3)
            self.assertEqual(rows[0]["tender_id"], TID)

    @patch("ingest.pdf_metadata", return_value={"Pages": "3"})
    def test_corrupted_completed_file_is_pending(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = Store(d)
            row = {"tender_id": TID}
            store.discover(row, "Org")
            self.addCleanup(store.db.close)
            Pipeline(FakeClient(), store, None).process(row)
            (Path(d) / "downloads" / TID / "assets" / "Tendernotice_1.pdf").write_bytes(
                b"broken"
            )
            self.assertFalse(store.complete(TID))

    def test_http_429_retry_after_and_backoff(self):
        with AssamTenders(delay=0, retries=1) as client:
            calls = []

            def run(cmd, **kw):
                calls.append(cmd)
                (client._dir / "headers.txt").write_text(
                    "HTTP/1.1 429 Too Many Requests\nRetry-After: 12\n"
                    if len(calls) == 1
                    else "HTTP/1.1 200 OK\n"
                )
                (client._dir / "response.bin").write_bytes(b"<html>ok</html>")
                return subprocess.CompletedProcess(
                    cmd,
                    22 if len(calls) == 1 else 0,
                    (
                        BASE + "\ntext/html\n" + ("429" if len(calls) == 1 else "200")
                    ).encode(),
                    b"",
                )

            with patch("assam_tenders.subprocess.run", side_effect=run), patch(
                "assam_tenders.time.sleep"
            ) as sleep:
                body, *_ = client.request(BASE)
            self.assertEqual(body, b"<html>ok</html>")
            self.assertEqual(len(calls), 2)
            self.assertTrue(any(c.args[0] >= 12 for c in sleep.call_args_list))

    def test_post_timeout_not_replayed(self):
        with AssamTenders(delay=0, retries=4) as client:
            with patch(
                "assam_tenders.subprocess.run",
                return_value=subprocess.CompletedProcess([], 28, b"\n\n000", b""),
            ) as run:
                with self.assertRaises(PortalError):
                    client.request(BASE, {"captchaText": "secret"})
            self.assertEqual(run.call_count, 1)

    def test_html_not_saved_as_pdf(self):
        with tempfile.TemporaryDirectory() as d, AssamTenders() as client:
            target = Path(d) / "bad.pdf"
            with patch.object(
                client,
                "request",
                return_value=(b"<html>captcha</html>", BASE, "text/html", ""),
            ):
                with self.assertRaises(PortalError):
                    client.download({"url": BASE}, target)
            self.assertFalse(target.exists())

    def test_2captcha_key_not_in_argv(self):
        solver = TwoCaptcha(key="test-secret")
        with patch(
            "captcha_solver.subprocess.run",
            return_value=subprocess.CompletedProcess(
                [], 0, b'{"errorId":0,"taskId":7}', b""
            ),
        ) as run:
            solver.call("createTask", {"task": {}})
        self.assertNotIn("test-secret", str(run.call_args.args))
        self.assertIn(b"test-secret", run.call_args.kwargs["input"])

    def test_solver_budget_and_poll(self):
        solver = TwoCaptcha(key="test", max_tasks=1)
        with patch.object(
            solver,
            "call",
            side_effect=[
                {"taskId": 1},
                {"status": "processing"},
                {"status": "ready", "solution": {"text": "Ab123C"}},
            ],
        ), patch("captcha_solver.time.sleep"):
            from PIL import Image
            import io

            image = io.BytesIO()
            Image.new("RGBA", (6, 2), (0, 0, 0, 0)).save(image, format="PNG")
            self.assertEqual(solver(image.getvalue()), "Ab123C")
        with self.assertRaises(SolverError):
            solver(b"another")

    def test_captcha_retry_uses_new_state(self):
        form_html = '<form id="frmCaptcha" action="/nicgep/app"><input type="hidden" name="tokenSecret" value="NEW"><input name="captchaText"><img id="captchaImage" src="data:image/png;base64,aW1hZ2U="><input type="submit" name="Submit" value="Submit"></form>'
        initial = SearchForm(
            Page(BASE, ""),
            BASE,
            {"tokenSecret": "OLD", "captchaText": "", "Submit": "Submit"},
            {},
            b"old-image",
        )
        with AssamTenders() as client:
            results = [
                (("Invalid Captcha!" + form_html).encode(), BASE, "text/html", ""),
                (b"<html>unlocked</html>", BASE, "text/html", ""),
            ]
            with patch.object(client, "request", side_effect=results) as request:
                solver = unittest.mock.Mock(side_effect=["ABC123", "DEF456"])
                page = client.submit_captcha(initial, solver)
            self.assertIn("unlocked", page.html)
            self.assertEqual(request.call_args_list[1].args[1]["tokenSecret"], "NEW")
            self.assertEqual(solver.call_args_list[1].args[0], b"image")

    def test_public_details_wrong_id_rejected(self):
        with AssamTenders() as client, patch.object(
            AssamTenders, "get_page", return_value=Page(BASE, DETAILS)
        ):
            with self.assertRaises(PortalError):
                client.public_details(
                    {
                        "tender_id": "2026_Other_12345_1",
                        "status_url": BASE + "?sp=Sopaque",
                    }
                )


if __name__ == "__main__":
    unittest.main()
