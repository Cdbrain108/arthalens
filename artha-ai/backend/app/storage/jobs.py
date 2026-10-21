"""Job manager — lifecycle, provenance, SQLite persistence (WAL)."""
import json
import logging
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone

from ..config import settings
from ..schemas.models import JobStatus

logger = logging.getLogger("bullseye.storage")

TERMINAL_STATUSES = {"succeeded", "failed"}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
PRAGMA journal_mode=WAL;
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_status(raw: str) -> JobStatus | None:
    try:
        return JobStatus(**json.loads(raw))
    except Exception:
        logger.warning("corrupt job row skipped", exc_info=True)
        return None


class JobManager:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or settings.sqlite_path
        parent = os.path.dirname(os.path.abspath(self.db_path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._conn()) as conn, conn:
            conn.executescript(_SCHEMA)
            # lightweight migration for report persistence
            cols = [r["name"] for r in conn.execute("PRAGMA table_info(jobs)").fetchall()]
            if "report_json" not in cols:
                conn.execute("ALTER TABLE jobs ADD COLUMN report_json TEXT")
            if "pdf_path" not in cols:
                conn.execute("ALTER TABLE jobs ADD COLUMN pdf_path TEXT")
            if "context_json" not in cols:
                conn.execute("ALTER TABLE jobs ADD COLUMN context_json TEXT")

    def _conn(self):
        # check_same_thread=False: all callers live on the event loop, but
        # connections are cheap and short-lived; timeout absorbs WAL contention.
        conn = sqlite3.connect(self.db_path, check_same_thread=False, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def create(self, query: str) -> str:
        job_id = f"research_{uuid.uuid4().hex[:12]}"
        status = JobStatus(job_id=job_id, status="queued", query=query)
        now = _now()
        with closing(self._conn()) as conn, conn:
            conn.execute(
                "INSERT INTO jobs (job_id, query, status, state_json, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (job_id, query, "queued", status.model_dump_json(), now, now))
        return job_id

    def update(self, status: JobStatus) -> None:
        with closing(self._conn()) as conn, conn:
            conn.execute(
                "UPDATE jobs SET status=?, state_json=?, updated_at=? WHERE job_id=?",
                (status.status, status.model_dump_json(), _now(), status.job_id))

    def get(self, job_id: str) -> JobStatus | None:
        if not job_id:
            return None
        with closing(self._conn()) as conn:
            row = conn.execute("SELECT state_json FROM jobs WHERE job_id=?",
                               (job_id,)).fetchone()
            if not row and not job_id.startswith("research_"):
                row = conn.execute("SELECT state_json FROM jobs WHERE job_id=?",
                                   (f"research_{job_id}",)).fetchone()
            elif not row and job_id.startswith("research_"):
                row = conn.execute("SELECT state_json FROM jobs WHERE job_id=?",
                                   (job_id.replace("research_", ""),)).fetchone()
        return _parse_status(row["state_json"]) if row else None

    def history(self, limit: int = 50) -> list[JobStatus]:
        limit = max(1, min(int(limit), 200))
        with closing(self._conn()) as conn:
            rows = conn.execute(
                "SELECT state_json FROM jobs ORDER BY created_at DESC LIMIT ?",
                (limit,)).fetchall()
        statuses = (_parse_status(r["state_json"]) for r in rows)
        return [s for s in statuses if s is not None]

    def attach_report(self, job_id: str, report: dict | None, pdf_path: str | None,
                      context: dict | None = None) -> bool:
        """Persist the final report and PDF location.

        Returns False (and logs) on failure — a succeeded job with a lost
        report must be visible in the job's errors, not silently 404 later.
        """
        try:
            with closing(self._conn()) as conn, conn:
                cursor = conn.execute(
                    "UPDATE jobs SET report_json=?, pdf_path=?, context_json=?, updated_at=? WHERE job_id=?",
                    (json.dumps(report or {}), pdf_path, json.dumps(context or {}), _now(), job_id))
            if cursor.rowcount == 0:
                logger.warning("attach_report: unknown job %s", job_id)
                return False
            return True
        except (sqlite3.Error, TypeError, ValueError):
            logger.exception("attach_report: could not persist report for %s", job_id)
            return False

    def get_report(self, job_id: str) -> dict | None:
        if not job_id:
            return None
        with closing(self._conn()) as conn:
            try:
                row = conn.execute("SELECT report_json FROM jobs WHERE job_id=?",
                                   (job_id,)).fetchone()
                if not row and not job_id.startswith("research_"):
                    row = conn.execute("SELECT report_json FROM jobs WHERE job_id=?",
                                       (f"research_{job_id}",)).fetchone()
                elif not row and job_id.startswith("research_"):
                    row = conn.execute("SELECT report_json FROM jobs WHERE job_id=?",
                                       (job_id.replace("research_", ""),)).fetchone()
            except sqlite3.Error:
                logger.exception("get_report: database error for %s", job_id)
                return None
        if not row or not row["report_json"]:
            return None
        try:
            report = json.loads(row["report_json"])
        except (ValueError, TypeError):
            logger.warning("get_report: corrupt report for %s", job_id)
            return None
        return report or None

    def get_pdf_path(self, job_id: str) -> str | None:
        if not job_id:
            return None
        with closing(self._conn()) as conn:
            row = conn.execute("SELECT pdf_path FROM jobs WHERE job_id=?",
                               (job_id,)).fetchone()
            if not row and not job_id.startswith("research_"):
                row = conn.execute("SELECT pdf_path FROM jobs WHERE job_id=?",
                                   (f"research_{job_id}",)).fetchone()
            elif not row and job_id.startswith("research_"):
                row = conn.execute("SELECT pdf_path FROM jobs WHERE job_id=?",
                                   (job_id.replace("research_", ""),)).fetchone()
        return row["pdf_path"] if row and row["pdf_path"] else None

    def get_context(self, job_id: str) -> dict | None:
        with closing(self._conn()) as conn:
            try:
                row = conn.execute("SELECT context_json FROM jobs WHERE job_id=?",
                                   (job_id,)).fetchone()
            except sqlite3.Error:
                logger.exception("get_context: database error for %s", job_id)
                return None
        if not row or not row["context_json"]:
            return None
        try:
            context = json.loads(row["context_json"])
        except (ValueError, TypeError):
            logger.warning("get_context: corrupt context for %s", job_id)
            return None
        return context if isinstance(context, dict) else None

    def fail_stale_jobs(self, reason: str) -> int:
        """Mark every non-terminal job failed (server restarted mid-run).

        Without this, a crash or --reload restart leaves jobs 'running' in the
        database forever and the UI polls a status that can never change.
        """
        # Read and update in one transaction. The previous implementation
        # opened a new connection for every stale row, making server startup
        # increasingly slow as job history accumulated.
        recovered = 0
        with closing(self._conn()) as conn, conn:
            rows = conn.execute(
                "SELECT job_id, state_json FROM jobs WHERE status NOT IN (?, ?)",
                tuple(TERMINAL_STATUSES),
            ).fetchall()
            for row in rows:
                status = _parse_status(row["state_json"])
                if status is None or status.status in TERMINAL_STATUSES:
                    continue
                status.status = "failed"
                status.errors.append({"node": status.current_node or "startup",
                                      "error": reason})
                conn.execute(
                    "UPDATE jobs SET status=?, state_json=?, updated_at=? WHERE job_id=?",
                    (status.status, status.model_dump_json(), _now(), status.job_id))
                recovered += 1
        if recovered:
            logger.info("failed %d stale job(s): %s", recovered, reason)
        return recovered
