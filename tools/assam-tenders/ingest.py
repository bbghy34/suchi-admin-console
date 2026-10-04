#!/usr/bin/env python3
"""Resumable tender/document ingestion. SQLite checkpoints + cumulative CSV exports."""

from __future__ import annotations
import argparse
import calendar
import csv
import fcntl
import hashlib
import importlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import zipfile
import time
import uuid
import signal
from evidence import retain_snapshot, extract
from datetime import date, datetime, timedelta
from pathlib import Path, PurePosixPath
from zoneinfo import ZoneInfo

from assam_tenders import (
    AssamTenders,
    PortalError,
    detail_metadata,
    document_links,
    document_manifest,
    manual_captcha,
    status_rows,
)
from captcha_solver import TwoCaptcha, SolverError

ROOT = Path(__file__).resolve().parent
IST = ZoneInfo("Asia/Kolkata")


def now():
    return datetime.now(IST).isoformat(timespec="seconds")


def previous_month(day):
    year, month = (day.year - 1, 12) if day.month == 1 else (day.year, day.month - 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    temp.replace(path)


class LimitReached(Exception):
    pass


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.root / "state.sqlite3")
        self.db.row_factory = sqlite3.Row
        if self.db.execute("PRAGMA user_version").fetchone()[0] > 1:
            self.db.close()
            raise PortalError("Checkpoint schema is newer than this CLI.")
        self.db.executescript("""
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS refresh_jobs(tender_id TEXT PRIMARY KEY, manifest_hash TEXT, epoch TEXT);
        CREATE TABLE IF NOT EXISTS refreshed_assets(tender_id TEXT, name TEXT, epoch TEXT, PRIMARY KEY(tender_id,name));
        CREATE TABLE IF NOT EXISTS document_versions(
          tender_id TEXT, name TEXT, sha256 TEXT, metadata TEXT,
          PRIMARY KEY(tender_id,name,sha256));
        CREATE TABLE IF NOT EXISTS observations(
          tender_id TEXT, observed_at TEXT, kind TEXT, path TEXT);
        CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tenders(
          tender_id TEXT PRIMARY KEY, organisation TEXT NOT NULL, listing TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
          first_seen TEXT NOT NULL, completed_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS documents(
          tender_id TEXT NOT NULL, name TEXT NOT NULL, metadata TEXT NOT NULL,
          PRIMARY KEY(tender_id,name));
        CREATE TABLE IF NOT EXISTS assets(
          tender_id TEXT NOT NULL, name TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,
          PRIMARY KEY(tender_id,name));
        CREATE TABLE IF NOT EXISTS coverage(organisation TEXT PRIMARY KEY,through_date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(
          organisation TEXT PRIMARY KEY, from_date TEXT NOT NULL,to_date TEXT NOT NULL,
          last_page INTEGER NOT NULL DEFAULT 0,last_tender_id TEXT,discovered INTEGER NOT NULL DEFAULT 0);
        """)

        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version > 1:
            raise PortalError("Checkpoint schema is newer than this CLI.")
        columns = {r[1] for r in self.db.execute("PRAGMA table_info(tenders)")}
        for name in ("last_checked", "files_checked", "manifest_hash"):
            if name not in columns:
                self.db.execute(f"ALTER TABLE tenders ADD COLUMN {name} TEXT")
        for row in self.db.execute(
            "SELECT tender_id,name,metadata FROM documents"
        ).fetchall():
            meta = json.loads(row["metadata"])
            self.db.execute(
                "INSERT OR IGNORE INTO document_versions VALUES(?,?,?,?)",
                (row["tender_id"], row["name"], meta["sha256"], row["metadata"]),
            )
        self.db.execute("PRAGMA user_version=1")
        self.db.commit()

    def observe(self, tid, kind, page):
        path = retain_snapshot(self.root, tid, kind, page)
        self.db.execute(
            "INSERT INTO observations VALUES(?,?,?,?)", (tid, now(), kind, path)
        )
        self.db.commit()
        return path

    def preserve(self, path):
        digest = sha256(path)
        target = self.root / "objects" / digest[:2] / digest
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            temporary = target.with_suffix(".part")
            shutil.copyfile(path, temporary)
            temporary.replace(target)
        return str(target.relative_to(self.root))

    def discover(self, row, organisation):
        # Session URLs/tokens remain in memory; durable identity is Tender ID.
        safe = {k: v for k, v in row.items() if not k.endswith("url")}
        self.db.execute(
            "INSERT INTO tenders(tender_id,organisation,listing,first_seen) VALUES(?,?,?,?) ON CONFLICT(tender_id) DO UPDATE SET listing=excluded.listing",
            (row["tender_id"], organisation, json.dumps(safe), now()),
        )
        self.db.commit()

    def asset(self, tender_id, name):
        row = self.db.execute(
            "SELECT * FROM assets WHERE tender_id=? AND name=?", (tender_id, name)
        ).fetchone()
        if row:
            path = self.root / row["path"]
            if path.is_file() and sha256(path) == row["sha256"]:
                return path
        return None

    def save_asset(self, tender_id, name, path):
        self.db.execute(
            "INSERT OR REPLACE INTO assets VALUES(?,?,?,?)",
            (tender_id, name, str(path.relative_to(self.root)), sha256(path)),
        )
        self.db.commit()

    def complete(self, tender_id):
        row = self.db.execute(
            "SELECT status FROM tenders WHERE tender_id=?", (tender_id,)
        ).fetchone()
        if not row or row["status"] != "complete":
            return False
        docs = self.db.execute(
            "SELECT metadata FROM documents WHERE tender_id=?", (tender_id,)
        ).fetchall()
        for doc in docs:
            meta = json.loads(doc[0])
            path = self.root / meta["local_path"]
            if not path.exists() or sha256(path) != meta["sha256"]:
                self.db.execute(
                    "UPDATE tenders SET status='pending',error='File missing or changed' WHERE tender_id=?",
                    (tender_id,),
                )
                self.db.commit()
                return False
        return bool(docs)

    def exports(self):
        tenders, documents = [], []
        for row in self.db.execute(
            "SELECT * FROM tenders ORDER BY first_seen,tender_id"
        ):
            meta = json.loads(row["metadata"])
            listing = json.loads(row["listing"])
            combined = listing.get("title_and_reference", "")
            title, separator, reference = combined.rpartition("][")
            common = dict(
                tender_id=row["tender_id"],
                title=meta.get("Title", title.lstrip("[") if separator else combined),
                organisation=row["organisation"],
                reference=meta.get(
                    "Tender Reference Number",
                    reference.rstrip("]") if separator else "",
                ),
                stage=listing.get("stage", ""),
                published=meta.get("Published Date", meta.get("Publish Date", "")),
                closing=meta.get("Bid Submission End Date", ""),
                tender_value=meta.get("Tender Value in ₹", ""),
                emd=meta.get("EMD Amount in ₹", ""),
                location=meta.get("Location", ""),
            )
            tenders.append(
                {
                    **common,
                    "status": row["status"],
                    "first_seen": row["first_seen"],
                    "completed_at": row["completed_at"],
                    "last_checked": row["last_checked"],
                    "files_checked": row["files_checked"],
                    "attempts": row["attempts"],
                    "error": row["error"],
                    "metadata_json": row["metadata"],
                }
            )
            for doc in self.db.execute(
                "SELECT metadata FROM documents WHERE tender_id=? ORDER BY name",
                (row["tender_id"],),
            ):
                d = json.loads(doc[0])
                documents.append(
                    {
                        **common,
                        **{
                            k: (
                                json.dumps(v, ensure_ascii=False)
                                if isinstance(v, dict)
                                else v
                            )
                            for k, v in d.items()
                        },
                    }
                )
        self._csv(
            "document-versions.csv",
            [dict(row) for row in self.db.execute("SELECT * FROM document_versions")],
            ["tender_id", "name", "sha256", "metadata"],
        )
        self._csv(
            "observations.csv",
            [dict(row) for row in self.db.execute("SELECT * FROM observations")],
            ["tender_id", "observed_at", "kind", "path"],
        )
        self._csv("tenders.csv", tenders, ["tender_id", "status"])
        self._csv(
            "documents.csv", documents, ["tender_id", "name", "local_path", "sha256"]
        )
        atomic_json(
            self.root / "checkpoint.json",
            {
                "updated_at": now(),
                "coverage": [
                    dict(r) for r in self.db.execute("SELECT * FROM coverage")
                ],
                "jobs": [dict(r) for r in self.db.execute("SELECT * FROM jobs")],
                "counts": dict(
                    self.db.execute(
                        "SELECT status,count(*) FROM tenders GROUP BY status"
                    ).fetchall()
                ),
            },
        )

    def _csv(self, name, rows, default):
        fields = list(dict.fromkeys(k for row in rows for k in row)) or default
        path = self.root / name
        temp = path.with_suffix(".csv.tmp")
        with temp.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            # CSV opened in Excel must not execute portal-supplied formulas.
            writer.writerows(
                {
                    k: (
                        "'" + v
                        if isinstance(v, str)
                        and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
                        else v
                    )
                    for k, v in row.items()
                }
                for row in rows
            )
            f.flush()
            os.fsync(f.fileno())
        temp.replace(path)


def pdf_metadata(path):
    result = subprocess.run(
        ["pdfinfo", "-isodates", str(path)], capture_output=True, text=True, timeout=45
    )
    if result.returncode:
        raise PortalError("PDF metadata validation failed: " + path.name)
    values = dict(
        line.split(":", 1) for line in result.stdout.splitlines() if ":" in line
    )
    return {k.strip(): v.strip() for k, v in values.items()}


def validate_file(path, name):
    with path.open("rb") as f:
        head = f.read(1024)
    suffix = Path(name).suffix.lower()
    if suffix == ".pdf" and not head.startswith(b"%PDF-"):
        raise PortalError(f"Invalid PDF signature: {name}")
    if suffix == ".xls" and not head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise PortalError(f"Invalid XLS signature: {name}")
    if suffix in {".zip", ".xlsx", ".docx"} and not zipfile.is_zipfile(path):
        raise PortalError(f"Invalid ZIP container: {name}")


def unpack(archive, folder):
    """Extract regular files, preserving subdirectories, with traversal/size checks."""
    result = {}
    with zipfile.ZipFile(archive) as z:
        files = [i for i in z.infolist() if not i.is_dir()]
        if sum(i.file_size for i in files) > 500 * 1024 * 1024 or len(files) > 1000:
            raise PortalError("ZIP exceeds the configured extraction limit.")
        for item in files:
            p = PurePosixPath(item.filename.replace("\\", "/"))
            if (
                p.is_absolute()
                or ".." in p.parts
                or (item.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise PortalError("Unsafe path in document ZIP.")
            if p.name in result:
                raise PortalError("Ambiguous duplicate filename in document ZIP.")
            target = folder.joinpath(*p.parts)
            if not target.resolve().is_relative_to(folder.resolve()):
                raise PortalError(
                    "ZIP target escapes extraction directory through a symlink."
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".part")
            with z.open(item) as src, tmp.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            tmp.replace(target)
            result[p.name] = target
    return result


class Pipeline:
    def __init__(
        self,
        client,
        store,
        solver,
        max_downloads=None,
        refresh_known=False,
        refresh_files=False,
        extract_content=False,
    ):
        self.client, self.store, self.solver = client, store, solver
        self.max_downloads, self.downloads = max_downloads, 0
        self.refresh_known, self.refresh_files = refresh_known, refresh_files
        self.extract_content = extract_content
        self.refresh_assets = False
        self.refresh_epoch = None
        self.cache_hits = 0
        self.checked = set()
        self.bytes_downloaded = 0

    def fetch(self, tender_id, document, name):
        existing = self.store.asset(tender_id, name)
        marker = self.store.db.execute(
            "SELECT epoch FROM refreshed_assets WHERE tender_id=? AND name=?",
            (tender_id, name),
        ).fetchone()
        refreshed = marker and marker[0] == self.refresh_epoch
        if existing and (not self.refresh_assets or refreshed):
            self.cache_hits += 1
            return existing
        if self.max_downloads is not None and self.downloads >= self.max_downloads:
            raise LimitReached(
                "Download limit reached; resume with the same output directory."
            )
        self.downloads += 1
        folder = self.store.root / "downloads" / tender_id / "assets"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        tmp = folder / (name + ".part")
        tmp.unlink(missing_ok=True)
        self.client.download(document, tmp)
        validate_file(tmp, name)
        if path.exists():
            self.store.preserve(path)
        self.store.preserve(tmp)
        tmp.replace(path)
        self.bytes_downloaded += path.stat().st_size
        self.store.save_asset(tender_id, name, path)
        if self.refresh_epoch:
            self.store.db.execute(
                "INSERT OR REPLACE INTO refreshed_assets VALUES(?,?,?)",
                (tender_id, name, self.refresh_epoch),
            )
            self.store.db.commit()
        print(
            f"Downloaded {tender_id}/{name} ({path.stat().st_size:,} bytes)", flush=True
        )
        return path

    def process(self, row):
        tid = row["tender_id"]
        if not re.fullmatch(r"\d{4}_[A-Za-z0-9]+_\d+_\d+", tid):
            raise PortalError("Unsafe or unexpected tender ID.")
        if tid in self.checked:
            return False
        previous = self.store.db.execute(
            "SELECT * FROM tenders WHERE tender_id=?", (tid,)
        ).fetchone()
        if self.store.complete(tid) and not self.refresh_known:
            print(f"Skip complete {tid}", flush=True)
            return False
        db = self.store.db
        db.execute(
            "UPDATE tenders SET status='processing',attempts=attempts+1,error=NULL WHERE tender_id=?",
            (tid,),
        )
        db.commit()
        try:
            page = self.client.public_details(row)
            self.store.observe(tid, "details", page)
            meta = detail_metadata(page)
            meta["_capture_scope"] = "public_details_and_nit_work_documents"
            meta["_related_history_links"] = [
                a.attrs.get("title", "") or a.text()
                for a in page.dom.find_all("a")
                if "corrigendum" in (a.attrs.get("title", "") + " " + a.text()).lower()
            ]
            db.execute(
                "UPDATE tenders SET metadata=? WHERE tender_id=?",
                (json.dumps(meta, ensure_ascii=False), tid),
            )
            db.commit()
            manifest = document_manifest(page)
            if not manifest:
                raise PortalError(
                    "No document manifest; tender remains pending for investigation."
                )
            if len({d["name"] for d in manifest}) != len(manifest):
                raise PortalError(
                    "Duplicate document filenames across manifest sections need review."
                )
            manifest_hash = hashlib.sha256(
                json.dumps(manifest, sort_keys=True).encode()
            ).hexdigest()
            self.refresh_epoch = None
            self.refresh_assets = self.refresh_files or bool(
                previous["manifest_hash"] and previous["manifest_hash"] != manifest_hash
            )
            db.execute(
                "UPDATE tenders SET manifest_hash=? WHERE tender_id=?",
                (manifest_hash, tid),
            )
            db.commit()
            job = db.execute(
                "SELECT manifest_hash,epoch FROM refresh_jobs WHERE tender_id=?", (tid,)
            ).fetchone()
            if self.refresh_assets or job:
                self.refresh_assets = True
                self.refresh_epoch = (
                    job["epoch"]
                    if job and job["manifest_hash"] == manifest_hash
                    else uuid.uuid4().hex
                )
                db.execute(
                    "INSERT OR REPLACE INTO refresh_jobs VALUES(?,?,?)",
                    (tid, manifest_hash, self.refresh_epoch),
                )
                db.commit()
            page = self.client.unlock_documents(page, self.solver)
            if detail_metadata(page).get("Tender ID") != tid:
                raise PortalError("Unlocked page returned a different tender.")
            self.store.observe(tid, "unlocked-details", page)
            links = document_links(page)
            by_name = {d["name"]: d for d in links}
            zip_link = next(
                (d for d in links if "download as zip" in d["name"].lower()), None
            )
            extracted = None
            for doc in manifest:
                filename = doc["name"]
                if Path(filename).name != filename or filename in {".", ".."}:
                    raise PortalError("Unexpected document filename.")
                if filename in by_name:
                    path = self.fetch(tid, by_name[filename], filename)
                    delivery = "individual"
                else:
                    if not zip_link:
                        raise PortalError(f"No download link or ZIP for {filename}.")
                    if extracted is None:
                        archive = self.fetch(tid, zip_link, "work-items.zip")
                        extracted = unpack(
                            archive, self.store.root / "downloads" / tid / "files"
                        )
                    if filename not in extracted:
                        raise PortalError(f"ZIP missing listed document {filename}.")
                    path = extracted[filename]
                    delivery = "zip"
                validate_file(path, filename)
                pdf = pdf_metadata(path) if filename.lower().endswith(".pdf") else {}
                record = {
                    **doc,
                    "local_path": str(path.relative_to(self.store.root)),
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                    "delivery": delivery,
                    "downloaded_at": now(),
                    "pdf_pages": pdf.get("Pages", ""),
                    "pdf_title": pdf.get("Title", ""),
                    "pdf_author": pdf.get("Author", ""),
                    "pdf_creation_date": pdf.get("CreationDate", ""),
                    "pdf_metadata": pdf,
                    "object_path": self.store.preserve(path),
                    "extraction": (
                        extract(path, self.store.root)
                        if self.extract_content
                        else {"status": "not_requested"}
                    ),
                }
                previous_doc = db.execute(
                    "SELECT metadata FROM documents WHERE tender_id=? AND name=?",
                    (tid, filename),
                ).fetchone()
                if previous_doc:
                    old_record = json.loads(previous_doc[0])
                    if old_record.get("sha256") == record["sha256"]:
                        record["downloaded_at"] = old_record["downloaded_at"]
                db.execute(
                    "INSERT OR IGNORE INTO document_versions VALUES(?,?,?,?)",
                    (
                        tid,
                        filename,
                        record["sha256"],
                        json.dumps(record, ensure_ascii=False),
                    ),
                )
                db.execute(
                    "INSERT OR REPLACE INTO documents VALUES(?,?,?)",
                    (tid, filename, json.dumps(record, ensure_ascii=False)),
                )
                db.commit()
                self.store.exports()
            # Remove obsolete current rows only after the whole new manifest succeeds.
            names = {d["name"] for d in manifest}
            for old in db.execute(
                "SELECT name FROM documents WHERE tender_id=?", (tid,)
            ).fetchall():
                if old[0] not in names:
                    db.execute(
                        "DELETE FROM documents WHERE tender_id=? AND name=?",
                        (tid, old[0]),
                    )
            db.execute(
                "UPDATE tenders SET status='complete',completed_at=?,last_checked=?,files_checked=?,manifest_hash=?,error=NULL WHERE tender_id=?",
                (
                    now(),
                    now(),
                    (
                        now()
                        if self.refresh_assets or not previous["files_checked"]
                        else previous["files_checked"]
                    ),
                    manifest_hash,
                    tid,
                ),
            )
            db.execute("DELETE FROM refresh_jobs WHERE tender_id=?", (tid,))
            db.commit()
            self.checked.add(tid)
            return True
        except Exception as exc:
            db.execute(
                "UPDATE tenders SET status='pending',error=? WHERE tender_id=?",
                (str(exc), tid),
            )
            db.commit()
            raise
        finally:
            self.store.exports()


def load_local_env():
    path = ROOT / ".env.local"
    if path.exists() and not os.environ.get("TWOCAPTCHA_API_KEY"):
        for line in path.read_text().splitlines():
            if line.startswith("TWOCAPTCHA_API_KEY="):
                os.environ["TWOCAPTCHA_API_KEY"] = line.partition("=")[2].strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output-dir", default=str(ROOT / "data"))
    ap.add_argument(
        "--solver", default="2captcha", help="2captcha, manual, or module:function"
    )
    ap.add_argument(
        "--organisation",
        action="append",
        help="Exact portal label; repeatable. Default: every listed organisation",
    )
    ap.add_argument("--query", default="")
    ap.add_argument(
        "--lookback-days",
        type=int,
        help="Bootstrap N days before --until; exclusive with --since",
    )
    ap.add_argument(
        "--refresh-known",
        action="store_true",
        help="Explicitly recheck known tenders; obeys --limit. Off by default",
    )
    ap.add_argument(
        "--refresh-files",
        action="store_true",
        help="With --refresh-known, re-fetch binaries even when their manifest is unchanged",
    )
    ap.add_argument(
        "--rescan",
        action="store_true",
        help="Explicitly rediscover the whole stored bootstrap range; completed files remain cached",
    )
    ap.add_argument(
        "--reextract",
        action="store_true",
        help="Rebuild extraction from downloaded originals, offline",
    )
    ap.add_argument(
        "--since",
        type=date.fromisoformat,
        help="Initial bootstrap date; default: one calendar month ago",
    )
    ap.add_argument(
        "--until", type=date.fromisoformat, default=datetime.now(IST).date()
    )
    ap.add_argument("--overlap-days", type=int, default=2)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--retries", type=int, default=4)
    ap.add_argument(
        "--max-tenders",
        "--limit",
        dest="max_tenders",
        type=int,
        help="Maximum tenders processed or refreshed in this invocation",
    )
    ap.add_argument("--max-downloads", type=int)
    ap.add_argument("--max-captcha-tasks", type=int, default=500)
    ap.add_argument(
        "--status",
        action="store_true",
        help="Print local checkpoint without network requests",
    )
    args = ap.parse_args()
    if args.lookback_days is not None:
        if args.since or args.lookback_days < 0:
            ap.error("Use --since OR a nonnegative --lookback-days")
        args.since = args.until - timedelta(days=args.lookback_days)
    if args.refresh_files and not args.refresh_known:
        ap.error("--refresh-files requires --refresh-known")
    if (
        args.delay < 1
        or args.retries < 0
        or args.overlap_days < 0
        or any(
            x is not None and x < 0
            for x in (args.max_tenders, args.max_downloads, args.max_captcha_tasks)
        )
    ):
        ap.error(
            "Delay must be at least 1 second; limits/retries/overlap must be nonnegative."
        )
    os.umask(0o077)
    root = Path(args.output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".ingest.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            ap.exit(1, "Another ingestion run holds this output directory.\n")
        store = Store(root)
        if args.reextract:
            for row in store.db.execute(
                "SELECT tender_id,name,metadata FROM documents"
            ).fetchall():
                record = json.loads(row["metadata"])
                path = root / record["local_path"]
                if sha256(path) != record["sha256"]:
                    raise PortalError("Local file checksum failed: " + row["name"])
                record["object_path"] = store.preserve(path)
                record["extraction"] = extract(path, root)
                store.db.execute(
                    "UPDATE documents SET metadata=? WHERE tender_id=? AND name=?",
                    (json.dumps(record), row["tender_id"], row["name"]),
                )
                store.db.execute(
                    "UPDATE document_versions SET metadata=? WHERE tender_id=? AND name=? AND sha256=?",
                    (
                        json.dumps(record),
                        row["tender_id"],
                        row["name"],
                        record["sha256"],
                    ),
                )
                store.db.commit()
            store.exports()
            store.db.close()
            return 0
        if args.status:
            store.exports()
            print((root / "checkpoint.json").read_text())
            store.db.close()
            return
        if not all(shutil.which(binary) for binary in ("pdfinfo", "pdftotext", "curl")):
            ap.exit(1, "curl, pdfinfo and pdftotext are required (install Poppler).\n")
        for module in ("xlrd", "openpyxl"):
            importlib.import_module(module)
        load_local_env()
        if args.solver == "2captcha":
            solver = TwoCaptcha(max_tasks=args.max_captcha_tasks)
        elif args.solver == "manual":
            solver = manual_captcha
        else:
            module, function = args.solver.rsplit(":", 1)
            solver = getattr(importlib.import_module(module), function)
        start = args.since or previous_month(args.until)
        db = store.db
        for key, value in (
            ("bootstrap_since", start.isoformat()),
            ("query", args.query),
        ):
            old = db.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
            if old and (
                (key == "query" and old[0] != value)
                or (
                    key == "bootstrap_since"
                    and args.since
                    and args.lookback_days is None
                    and old[0] != value
                )
            ):
                ap.exit(
                    1,
                    "Filters differ from this checkpoint. Use a different output directory.\n",
                )
            db.execute("INSERT OR IGNORE INTO config VALUES(?,?)", (key, value))
        db.commit()
        start = date.fromisoformat(
            db.execute(
                "SELECT value FROM config WHERE key='bootstrap_since'"
            ).fetchone()[0]
        )
        if start > args.until:
            ap.error("since must not be after until")
        processed = 0
        run_id = (
            datetime.now(IST).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
        )
        started = time.monotonic()
        metrics = {
            "requests": 0,
            "http_429": 0,
            "retries": 0,
            "request_seconds": 0,
            "discovered": 0,
            "organisations_completed": 0,
        }
        run_summary = {
            "run_id": run_id,
            "schema_version": 1,
            "parameters": {
                k: (v.isoformat() if isinstance(v, date) else v)
                for k, v in vars(args).items()
            },
            "started_at": now(),
            "status": "running",
            "downloads": 0,
            "completed_this_run": 0,
        }

        def trace(event):
            if event.get("event", "request") == "request":
                metrics["requests"] += 1
                metrics["http_429"] += event.get("status") == 429
                metrics["retries"] += event.get("attempt", 1) > 1
                metrics["request_seconds"] += event.get("elapsed_seconds", 0)
            with (root / "requests.jsonl").open("a") as f:
                f.write(json.dumps({"at": now(), "run_id": run_id, **event}) + "\n")

        atomic_json(root / "last-run.json", run_summary)
        try:
            with AssamTenders(
                delay=args.delay,
                retries=args.retries,
                trace=trace,
                cooldown_path=root / "cooldown.json",
            ) as client:
                pipe = Pipeline(
                    client,
                    store,
                    solver,
                    args.max_downloads,
                    args.refresh_known,
                    args.refresh_files,
                    True,
                )
                if args.max_tenders == 0 or args.max_downloads == 0:
                    raise LimitReached("Zero limit; no network ingestion performed.")
                organisations = list(
                    dict.fromkeys(args.organisation or client.organisations())
                )
                run_summary["organisations"] = organisations
                for org in organisations:
                    if args.max_tenders is not None and processed >= args.max_tenders:
                        raise LimitReached("Tender limit reached.")
                    old = db.execute(
                        "SELECT through_date FROM coverage WHERE organisation=?", (org,)
                    ).fetchone()
                    since = (
                        max(
                            start,
                            date.fromisoformat(old[0])
                            - timedelta(days=args.overlap_days),
                        )
                        if old
                        else start
                    )
                    if args.rescan:
                        since = start
                    if old and args.until < date.fromisoformat(old[0]):
                        raise PortalError(
                            "until predates an existing coverage checkpoint; use another output directory for historical reruns."
                        )
                    print(f"Discover {org}: {since} to {args.until}", flush=True)
                    db.execute(
                        "INSERT OR REPLACE INTO jobs(organisation,from_date,to_date) VALUES(?,?,?)",
                        (org, since.isoformat(), args.until.isoformat()),
                    )
                    db.commit()
                    page = client.status_search(
                        solver,
                        since=since,
                        until=args.until,
                        organisation=org,
                        query=args.query,
                    )
                    rows = []
                    seen = set()
                    page_number = 0
                    totals = set()
                    while page is not None:
                        store.observe("_discovery", "status", page)
                        batch = status_rows(page)
                        page_number += 1
                        signature = tuple(r["tender_id"] for r in batch)
                        if signature in seen:
                            raise PortalError(
                                "Status pagination repeated a page; checkpoint not advanced."
                            )
                        seen.add(signature)
                        for row in batch:
                            store.discover(row, org)
                        rows.extend(batch)
                        db.execute(
                            "UPDATE jobs SET last_page=? WHERE organisation=?",
                            (page_number, org),
                        )
                        db.commit()
                        total_match = re.search(
                            r"Total records:\s*(\d+)", page.dom.text(), re.I
                        )
                        total = int(total_match.group(1)) if total_match else None
                        if total is not None:
                            totals.add(total)
                        page = client.next_status_page(page)
                    unique = {r["tender_id"]: r for r in rows}
                    metrics["discovered"] += len(unique)
                    if rows and not totals:
                        raise PortalError("Result count absent; coverage retained.")
                    if len(totals) > 1:
                        raise PortalError(
                            "Result count changed during pagination; retry discovery."
                        )
                    if total is not None and len(unique) != total:
                        raise PortalError(
                            f"Discovery count mismatch: parsed {len(unique)}, portal {total}."
                        )
                    # Recover unfinished tenders outside the current date window by stable ID.
                    pending = {
                        r[0]
                        for r in db.execute(
                            "SELECT tender_id FROM tenders WHERE organisation=? AND status!='complete'",
                            (org,),
                        )
                    }
                    for pending_id in sorted(pending - set(unique)):
                        found = client.status_search(solver, tender_id=pending_id)
                        matches = [
                            r
                            for r in status_rows(found)
                            if r["tender_id"] == pending_id
                        ]
                        if len(matches) != 1:
                            raise PortalError(
                                "Pending tender no longer discoverable: " + pending_id
                            )
                        store.discover(matches[0], org)
                        unique[pending_id] = matches[0]
                    db.execute(
                        "UPDATE jobs SET discovered=1 WHERE organisation=?", (org,)
                    )
                    db.commit()
                    store.exports()
                    for row in unique.values():
                        if (
                            args.max_tenders is not None
                            and processed >= args.max_tenders
                        ):
                            raise LimitReached("Tender limit reached.")
                        if pipe.process(row):
                            processed += 1
                        db.execute(
                            "UPDATE jobs SET last_tender_id=? WHERE organisation=?",
                            (row["tender_id"], org),
                        )
                        db.commit()
                    metrics["organisations_completed"] += 1
                    db.execute(
                        "INSERT OR REPLACE INTO coverage VALUES(?,?)",
                        (org, args.until.isoformat()),
                    )
                    db.execute("DELETE FROM jobs WHERE organisation=?", (org,))
                    db.commit()
                    store.exports()
                # Old publication dates fall outside the incremental discovery window.
                # Rediscover those IDs explicitly; never persist session action URLs.
                known = (
                    db.execute(
                        "SELECT tender_id,organisation FROM tenders WHERE status='complete' ORDER BY COALESCE(last_checked,''),tender_id"
                    ).fetchall()
                    if args.refresh_known
                    else []
                )
                for item in known:
                    if (
                        item["organisation"] not in organisations
                        or item["tender_id"] in pipe.checked
                    ):
                        continue
                    if args.max_tenders is not None and processed >= args.max_tenders:
                        raise LimitReached(
                            "Tender limit reached before refresh queue completed."
                        )
                    result = client.status_search(solver, tender_id=item["tender_id"])
                    matches = [
                        r
                        for r in status_rows(result)
                        if r["tender_id"] == item["tender_id"]
                    ]
                    if len(matches) != 1:
                        raise PortalError(
                            "Known tender unavailable during refresh: "
                            + item["tender_id"]
                        )
                    store.discover(matches[0], item["organisation"])
                    if pipe.process(matches[0]):
                        processed += 1
                run_summary["status"] = "complete"
        except LimitReached as exc:
            run_summary.update(status="limited", message=str(exc))
            print(str(exc), flush=True)
        except KeyboardInterrupt:
            run_summary.update(
                status="interrupted",
                message="Interrupted; resume with the same output directory.",
            )
        except Exception as exc:
            run_summary.update(
                status="failed", error_type=type(exc).__name__, message=str(exc)
            )
            print("Stopped: " + str(exc), flush=True)
        finally:
            run_summary.update(
                finished_at=now(),
                completed_this_run=processed,
                downloads=pipe.downloads if "pipe" in locals() else 0,
                captcha_tasks=getattr(solver, "tasks", None),
                captcha_metrics=getattr(solver, "metrics", {}),
                duration_seconds=round(time.monotonic() - started, 3),
                metrics=metrics,
                bytes_downloaded=pipe.bytes_downloaded if "pipe" in locals() else 0,
                cache_hits=pipe.cache_hits if "pipe" in locals() else 0,
            )
            store.exports()
            atomic_json(root / "last-run.json", run_summary)
            (root / "runs").mkdir(exist_ok=True)
            atomic_json(root / "runs" / (run_id + ".json"), run_summary)
            store.db.close()
            print(json.dumps(run_summary, indent=2))
        if run_summary["status"] == "failed":
            return 1
        if run_summary["status"] == "interrupted":
            return 130
    return 0


if __name__ == "__main__":

    def stop(signum, frame):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, stop)
    try:
        raise SystemExit(main())
    except (PortalError, SolverError, ImportError, OSError, ValueError) as exc:
        print(f"Startup/offline error: {exc}", flush=True)
        raise SystemExit(1)
