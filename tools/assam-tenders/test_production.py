import csv
import io
import json
import sqlite3
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from assam_tenders import AssamTenders, BASE, Page, PortalError
from evidence import extract, snapshot
from ingest import LimitReached, Pipeline, Store, main
from test_ingest import DETAILS, FakeClient, TID


class ProductionTests(unittest.TestCase):
    def store(self, path):
        store = Store(path)
        self.addCleanup(store.db.close)
        store.discover({"tender_id": TID}, "Org")
        return store

    def test_snapshot_strips_session_secrets_but_keeps_tables(self):
        page = Page(
            BASE + "?sp=PRIVATE",
            '<script>SECRET</script><input value="PRIVATE"><img src="data:image/png;base64,PRIVATE"><table><tr><td>EMD</td><td>100</td></tr></table><a href="/nicgep/app?page=Details&amp;sp=PRIVATE&amp;tokenSecret=PRIVATE">PDF</a>',
        )
        data = snapshot(page)
        self.assertNotIn("PRIVATE", json.dumps(data))
        self.assertNotIn("SECRET", json.dumps(data))
        self.assertIn("100", data["text"])
        self.assertIn("page=Details", data["html"])

    @patch("ingest.pdf_metadata", return_value={"Pages": "3"})
    def test_default_skips_even_old_completed_tenders(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = self.store(d)
            Pipeline(FakeClient(), store, None).process({"tender_id": TID})
            store.db.execute(
                "UPDATE tenders SET last_checked='2000-01-01T00:00:00+05:30'"
            )
            store.db.commit()
            client = FakeClient()
            self.assertFalse(Pipeline(client, store, None).process({"tender_id": TID}))
            self.assertEqual(client.calls, [])

    @patch("ingest.pdf_metadata", return_value={"Pages": "3"})
    def test_explicit_metadata_refresh_reuses_unchanged_files(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = self.store(d)
            Pipeline(FakeClient(), store, None).process({"tender_id": TID})
            client = FakeClient()
            self.assertTrue(
                Pipeline(client, store, None, refresh_known=True).process(
                    {"tender_id": TID}
                )
            )
            self.assertEqual(client.calls, [])
            self.assertEqual(
                store.db.execute("SELECT count(*) FROM document_versions").fetchone()[
                    0
                ],
                3,
            )

    @patch("ingest.pdf_metadata", return_value={"Pages": "3"})
    def test_interrupted_forced_refresh_resumes_without_repeat_download(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = self.store(d)
            Pipeline(FakeClient(), store, None).process({"tender_id": TID})
            client = FakeClient()
            with self.assertRaises(LimitReached):
                Pipeline(
                    client,
                    store,
                    None,
                    max_downloads=1,
                    refresh_known=True,
                    refresh_files=True,
                ).process({"tender_id": TID})
            self.assertEqual(client.calls, ["Tendernotice_1.pdf"])
            self.assertEqual(
                store.db.execute("SELECT count(*) FROM refresh_jobs").fetchone()[0], 1
            )
            client = FakeClient()
            Pipeline(client, store, None).process({"tender_id": TID})
            self.assertEqual(client.calls, ["Download as zip file"])
            self.assertEqual(
                store.db.execute("SELECT count(*) FROM refresh_jobs").fetchone()[0], 0
            )

    @patch("ingest.pdf_metadata", return_value={"Pages": "3"})
    def test_changed_manifest_triggers_refresh_and_retains_old_version(self, _):
        with tempfile.TemporaryDirectory() as d:
            store = self.store(d)
            Pipeline(FakeClient(), store, None).process({"tender_id": TID})
            original = store.db.execute(
                "SELECT metadata FROM documents WHERE name='Tendernotice_1.pdf'"
            ).fetchone()[0]
            old = json.loads(original)
            client = FakeClient()
            client.public_details = lambda row: Page(
                BASE, DETAILS.replace(">NIT<", ">Revised NIT<")
            )
            download = client.download

            def changed(doc, path):
                download(doc, path)
                if doc["name"] == "Tendernotice_1.pdf":
                    Path(path).write_bytes(b"%PDF-1.7\nupdated")

            client.download = changed
            Pipeline(client, store, None, refresh_known=True).process(
                {"tender_id": TID}
            )
            self.assertEqual(len(client.calls), 2)
            self.assertEqual(
                store.db.execute("SELECT count(*) FROM document_versions").fetchone()[
                    0
                ],
                4,
            )
            self.assertTrue((Path(d) / old["object_path"]).exists())

    def test_csv_formula_escaping_does_not_change_database(self):
        with tempfile.TemporaryDirectory() as d:
            store = self.store(d)
            store.db.execute(
                "UPDATE tenders SET metadata=?",
                (json.dumps({"Title": '=HYPERLINK("x")'}),),
            )
            store.db.commit()
            store.exports()
            with (Path(d) / "tenders.csv").open() as f:
                self.assertTrue(next(csv.DictReader(f))["title"].startswith("'="))
            self.assertIn(
                "=HYPERLINK",
                store.db.execute("SELECT metadata FROM tenders").fetchone()[0],
            )

    def test_future_schema_not_modified(self):
        with tempfile.TemporaryDirectory() as d:
            conn = sqlite3.connect(Path(d) / "state.sqlite3")
            conn.execute("PRAGMA user_version=999")
            conn.close()
            with self.assertRaises(PortalError):
                Store(d)
            conn = sqlite3.connect(Path(d) / "state.sqlite3")
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM sqlite_master WHERE type='table'"
                ).fetchone()[0],
                0,
            )
            conn.close()

    def test_cooldown_survives_new_process(self):
        import time

        with tempfile.TemporaryDirectory() as d:
            cooldown = Path(d) / "cooldown.json"
            cooldown.write_text(json.dumps({"until": time.time() + 100}))
            with AssamTenders(cooldown_path=cooldown) as client, patch(
                "assam_tenders.subprocess.run"
            ) as run:
                with self.assertRaisesRegex(PortalError, "cooldown"):
                    client.request(BASE)
                run.assert_not_called()

    def test_terminal_429_persists_retry_after(self):
        with tempfile.TemporaryDirectory() as d:
            cooldown = Path(d) / "cooldown.json"
            with AssamTenders(retries=0, delay=0, cooldown_path=cooldown) as client:
                (client._dir / "headers.txt").write_text(
                    "HTTP/1.1 429 Too Many Requests\nRetry-After: 900\n"
                )
                with patch(
                    "assam_tenders.subprocess.run",
                    return_value=subprocess.CompletedProcess(
                        [], 22, (BASE + "\ntext/html\n429").encode(), b""
                    ),
                ):
                    with self.assertRaises(PortalError):
                        client.request(BASE)
            self.assertEqual(json.loads(cooldown.read_text())["status"], 429)

    def test_offline_status_needs_no_solver(self):
        with tempfile.TemporaryDirectory() as d, patch(
            "sys.argv", ["ingest", "--output-dir", d, "--status"]
        ), patch("ingest.TwoCaptcha") as solver, patch(
            "ingest.AssamTenders"
        ) as client, redirect_stdout(
            io.StringIO()
        ):
            main()
            solver.assert_not_called()
            client.assert_not_called()

    def test_zero_limit_does_no_network(self):
        with tempfile.TemporaryDirectory() as d, patch(
            "sys.argv",
            ["ingest", "--output-dir", d, "--solver", "manual", "--limit", "0"],
        ), patch("ingest.AssamTenders") as client, redirect_stdout(io.StringIO()):
            self.assertEqual(main(), 0)
            client.return_value.__enter__.return_value.organisations.assert_not_called()
            result = json.loads((Path(d) / "last-run.json").read_text())
            self.assertEqual(result["status"], "limited")
            self.assertEqual(result["metrics"]["requests"], 0)
            self.assertEqual(len(list((Path(d) / "runs").glob("*.json"))), 1)

    def test_xlsx_extraction_preserves_formula_and_hidden_sheet(self):
        import openpyxl

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "book.xlsx"
            book = openpyxl.Workbook()
            book.active["A1"] = "=1+2"
            book.create_sheet("Hidden").sheet_state = "hidden"
            book.save(path)
            book.close()
            result = extract(path, Path(d))
            data = json.loads((Path(d) / result["workbook_path"]).read_text())
            self.assertEqual(data["sheets"][0]["cells"][0]["value"], "=1+2")
            self.assertEqual(data["sheets"][1]["visibility"], "hidden")

    def test_zip_existing_symlink_cannot_escape(self):
        import zipfile
        from ingest import unpack

        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "files").mkdir()
            (root / "outside").mkdir()
            (root / "files" / "nested").symlink_to(
                root / "outside", target_is_directory=True
            )
            with zipfile.ZipFile(root / "archive.zip", "w") as z:
                z.writestr("nested/evil.pdf", "bad")
            with self.assertRaises(PortalError):
                unpack(root / "archive.zip", root / "files")
            self.assertFalse((root / "outside" / "evil.pdf").exists())


class RecordedPortalTests(unittest.TestCase):
    def test_recorded_detail_all_documents_and_amounts(self):
        from assam_tenders import detail_metadata, document_manifest

        page = Page(
            BASE,
            (Path(__file__).parent / "tests/fixtures/public-details.html").read_text(),
        )
        meta = detail_metadata(page)
        self.assertEqual(meta["Tender ID"], TID)
        self.assertEqual(meta["Tender Value in ₹"], "2,29,99,654")
        self.assertEqual(meta["EMD Amount in ₹"], "4,59,993")
        self.assertEqual(
            {d["name"] for d in document_manifest(page)},
            {"Tendernotice_1.pdf", "bid_sutradhar.pdf", "BOQ_85151.xls"},
        )

    def test_recorded_status_pages(self):
        from assam_tenders import status_rows

        for name, count in [("status-results", 10), ("status-last", 7)]:
            page = Page(
                BASE,
                (
                    Path(__file__).parent / ("tests/fixtures/" + name + ".html")
                ).read_text(),
            )
            rows = status_rows(page)
            self.assertEqual(len(rows), count)
            self.assertEqual(len({r["tender_id"] for r in rows}), count)

    def test_cli_discovery_completion_then_no_repeat_downloads(self):
        from assam_tenders import status_rows

        listing = Page(
            BASE,
            '<table id="tabList"><tr><td>1</td><td>'
            + TID
            + '</td><td>[Work][REF]</td><td>Org</td><td>Open</td><td><a title="View Tender Status" href="?sp=fake">View</a></td></tr></table>Total records: 1',
        )

        class Client(FakeClient):
            def __init__(self, **kw):
                super().__init__()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def status_search(self, *a, **kw):
                return listing

            def next_status_page(self, page):
                return None

        clients = []

        def create(**kw):
            client = Client()
            clients.append(client)
            return client

        with tempfile.TemporaryDirectory() as d, patch(
            "ingest.AssamTenders", side_effect=create
        ), patch("ingest.pdf_metadata", return_value={"Pages": "3"}), patch(
            "ingest.extract", return_value={"status": "fixture"}
        ), redirect_stdout(
            io.StringIO()
        ):
            argv = [
                "ingest",
                "--output-dir",
                d,
                "--solver",
                "manual",
                "--organisation",
                "Org",
                "--since",
                "2026-09-01",
                "--until",
                "2026-09-30",
            ]
            with patch("sys.argv", argv):
                self.assertEqual(main(), 0)
            with patch("sys.argv", argv):
                self.assertEqual(main(), 0)
            self.assertEqual(len(clients[0].calls), 2)
            self.assertEqual(clients[1].calls, [])
            result = json.loads((Path(d) / "checkpoint.json").read_text())
            self.assertEqual(result["counts"], {"complete": 1})
            self.assertEqual(result["coverage"][0]["through_date"], "2026-09-30")

    def test_missing_pagination_results_never_advance_coverage(self):
        listing = Page(BASE, '<table id="tabList"></table>Total records: 27')

        class Client:
            def __init__(self, **kw):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def status_search(self, *a, **kw):
                return listing

            def next_status_page(self, p):
                return None

        with tempfile.TemporaryDirectory() as d, patch(
            "ingest.AssamTenders", Client
        ), redirect_stdout(io.StringIO()):
            with patch(
                "sys.argv",
                [
                    "ingest",
                    "--output-dir",
                    d,
                    "--solver",
                    "manual",
                    "--organisation",
                    "Org",
                ],
            ):
                self.assertEqual(main(), 1)
            result = json.loads((Path(d) / "checkpoint.json").read_text())
            self.assertEqual(result["coverage"], [])
            result = json.loads((Path(d) / "last-run.json").read_text())
            self.assertEqual(result["status"], "failed")


if __name__ == "__main__":
    unittest.main()
