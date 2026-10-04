"""Research routes — job lifecycle (API_SPEC.md)."""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import settings
from ..llm import is_mock
from ..schemas.models import ReportAnswer
from ..storage.jobs import JobManager
from ..graph.runner import run_research

logger = logging.getLogger("bullseye.research")

router = APIRouter(prefix="/research", tags=["research"])
jobs = JobManager()

# asyncio keeps only weak references to tasks; an unreferenced background task
# can be garbage-collected mid-run, silently killing a research job.
_running_tasks: set[asyncio.Task] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResearchRequest(BaseModel):
    query: str
    document_ids: list[str] = []
    mode: str = "auto"


class ReportQuestion(BaseModel):
    question: str


def _on_task_done(task: asyncio.Task) -> None:
    _running_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        logger.error("research task crashed", exc_info=task.exception())


def _report_context(final: dict) -> dict:
    """Persist the minimum validated packet needed for grounded follow-ups."""
    return {key: final.get(key) for key in (
        "query", "entities", "intent", "time_horizon", "compare_mode",
        "selected_agents", "agent_results", "evidence", "evidence_gaps",
        "bull_case", "bear_case", "risks", "what_could_change_view",
    )}


_QA_STOPWORDS = {
    "what", "when", "where", "which", "does", "this", "that", "about",
    "with", "from", "have", "been", "were", "will", "should", "could",
    "would", "there", "their", "into", "over", "your", "report", "tell",
}


def _qa_tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]{3,}", (value or "").lower())
            if token not in _QA_STOPWORDS}


def _extractive_report_answer(question: str, report: dict, context: dict | None) -> ReportAnswer:
    """Useful offline fallback for mock mode and temporary provider outages."""
    context = context or {}
    query_tokens = _qa_tokens(question)
    # A completed report is a historical snapshot.  Do not fill a request for
    # "today/latest/current/now" with loosely related historical bullets: that
    # looks helpful but can be mistaken for a live quote or live news answer.
    current_terms = query_tokens & {"current", "latest", "today", "now"}
    if current_terms:
        gaps = list((report or {}).get("evidence_gaps") or [])[:5]
        gaps.insert(0, "The completed report is a historical snapshot and does not establish live current data.")
        return ReportAnswer(
            answer=("This completed report cannot answer a live current-data question "
                    "without a fresh research run. Please start fresh research for "
                    "the latest price, news, or market status."),
            sources=[],
            evidence_gaps=list(dict.fromkeys(gaps)),
            follow_up_research_needed=True,
        )
    candidates: list[tuple[int, str, str, dict | None]] = []
    for section, value in (report or {}).items():
        if not isinstance(value, dict):
            continue
        for field in ("summary", "findings"):
            raw = value.get(field)
            texts = raw if isinstance(raw, list) else [raw]
            for text in texts:
                text = str(text or "").strip()
                overlap = len(query_tokens & _qa_tokens(text))
                if text and overlap:
                    candidates.append((overlap, section, text, None))

    source_hits: list[dict] = []
    for item in context.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        text = " ".join(str(item.get(key) or "") for key in ("claim", "excerpt", "source_title"))
        overlap = len(query_tokens & _qa_tokens(text))
        if text.strip() and overlap:
            candidates.append((overlap + 1, item.get("agent", "evidence"),
                               item.get("claim") or item.get("excerpt") or text, item))

    candidates.sort(key=lambda item: item[0], reverse=True)
    top = candidates[:5]
    if not top:
        return ReportAnswer(
            answer=("That question is not established by the completed report. "
                    "I have not run a fresh search, so I will not infer an answer."),
            evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
            follow_up_research_needed=True,
        )

    lines = []
    seen = set()
    for _, section, text, item in top:
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"{section.replace('_', ' ').title()}: {text}")
        if item:
            source = {
                "title": item.get("source_title"),
                "url": item.get("source_url"),
                "publication_date": item.get("publication_date"),
            }
            source_key = (source["title"], source["url"])
            if source_key not in {(s.get("title"), s.get("url")) for s in source_hits}:
                source_hits.append(source)
    return ReportAnswer(
        answer="Based on the generated report:\n" + "\n".join(f"- {line}" for line in lines),
        sources=source_hits[:8],
        evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
        follow_up_research_needed=False,
    )


def _answer_report_question(question: str, report: dict, context: dict | None) -> ReportAnswer:
    if is_mock():
        return _extractive_report_answer(question, report, context)
    try:
        from ..graph.meta import answer_report_question
        return answer_report_question(question, report, context)
    except Exception:
        logger.exception("report Q&A provider failed; using extractive fallback")
        return _extractive_report_answer(question, report, context)


async def _run_job(job_id: str, query: str, document_ids: list[str]):
    """Execute the compiled LangGraph and persist progress events."""
    status = jobs.get(job_id)
    if status is None:
        return
    status.status = "running"
    status.current_node = "analyze_query"
    jobs.update(status)

    def start_step(node: str) -> None:
        # Sequential pipeline nodes close the previous one; parallel agent
        # steps ("<name>_agent") coexist until their own done/failed event.
        if any(s["node"] == node for s in status.steps):
            return
        if not node.endswith("_agent"):
            for step in status.steps:
                if step["state"] == "running" and not step["node"].endswith("_agent"):
                    step.update(state="done", at=_now())
        status.steps.append({"node": node, "state": "running", "at": None})

    def finish_step(node: str, state: str = "done") -> None:
        for step in status.steps:
            if step["node"] == node and step["state"] == "running":
                step.update(state=state, at=_now())

    def finish_running_steps(state: str = "done") -> None:
        for step in status.steps:
            if step["state"] == "running":
                step.update(state=state, at=_now())

    def on_event(kind: str, payload) -> None:
        if kind == "node":
            status.current_node = payload
            start_step(payload)
            if payload == "validate_evidence":
                status.status = "validating"
            elif payload in ("bull_bear_risk", "challenge_thesis",
                              "synthesize", "synthesize_report"):
                status.status = "synthesizing"
            elif payload in ("build_report", "generate_pdf"):
                status.status = "rendering"
        elif kind == "analysis" and payload:
            status.intent = payload.get("intent", "")
            status.entities = list(payload.get("entities", []))
        elif kind == "agents" and payload:
            status.selected_agents = list(payload)
        elif kind == "agent_done" and payload:
            finish_step(f"{payload}_agent")
            if payload not in status.completed_agents:
                status.completed_agents.append(payload)
        elif kind == "agent_failed" and payload:
            agent = payload.get("agent", "unknown")
            finish_step(f"{agent}_agent", "failed")
            if agent not in status.failed_agents:
                status.failed_agents.append(agent)
            status.errors.append({"node": f"{agent}_agent",
                                  "error": payload.get("error", "")})
            status.agent_statuses[agent] = 'timed_out' if 'timed out' in payload.get('error', '') else 'failed'
        elif kind == "agent_status" and payload:
            agent = payload['agent']
            status.agent_statuses[agent] = payload['status']
            status.agent_details[agent] = payload
            for step in status.steps:
                if step['node'] == f'{agent}_agent':
                    step.update(state='done' if payload['status'] == 'completed' else payload['status'], at=_now())
        elif kind == "report":
            status.status = "rendering"
        jobs.update(status)

    try:
        final = await run_research(query, job_id, document_ids, on_event=on_event)
        report_attached = jobs.attach_report(job_id, final.get("report"), final.get("pdf_path"),
                                             _report_context(final))
        status.status = "succeeded"
        status.current_node = "done"
        status.failed_agents = list(final.get("failed_agents", []))
        status.agent_statuses.update(final.get('agent_statuses') or {})
        finish_running_steps()
        if not report_attached:
            status.errors.append({"node": "attach_report",
                                  "error": "report could not be persisted"})
        jobs.update(status)
    except asyncio.CancelledError:
        # Server shutdown / --reload cancels in-flight jobs; mark them failed
        # so they never stay "running" (and polled) forever.
        status.status = "failed"
        status.errors.append({"node": status.current_node,
                              "error": "job interrupted (server shutdown or cancellation)"})
        finish_running_steps("failed")
        jobs.update(status)
        raise
    except Exception as exc:
        status.status = "failed"
        finish_running_steps("failed")
        status.errors.append({"node": status.current_node, "error": str(exc)})
        jobs.update(status)
        logger.exception("research job %s failed at %s", job_id, status.current_node)


@router.post("", status_code=202)
async def start_research(req: ResearchRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(400, "query is required")
    job_id = jobs.create(req.query.strip())
    task = asyncio.create_task(_run_job(job_id, req.query.strip(), req.document_ids))
    _running_tasks.add(task)
    task.add_done_callback(_on_task_done)
    return {"job_id": job_id, "status": "queued"}


@router.get("/history")
async def research_history(limit: int = 50):
    return [j.model_dump() for j in jobs.history(limit)]


@router.get("/{job_id}")
async def get_research(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job.model_dump()


@router.get("/{job_id}/status")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job.model_dump()


@router.get("/{job_id}/report")
async def get_report(job_id: str):
    if not jobs.get(job_id):
        raise HTTPException(404, "job not found")
    report = jobs.get_report(job_id)
    if not report:
        raise HTTPException(404, "report not ready")
    return report


@router.post("/{job_id}/ask")
async def ask_report(job_id: str, req: ReportQuestion):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "question is required")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job.status != "succeeded":
        raise HTTPException(409, "report is not ready")
    report = jobs.get_report(job_id)
    if not report:
        raise HTTPException(404, "report not ready")
    answer = await asyncio.to_thread(
        _answer_report_question, question, report, jobs.get_context(job_id))
    return answer.model_dump()


@router.get("/{job_id}/pdf")
async def get_pdf(job_id: str):
    if not jobs.get(job_id):
        raise HTTPException(404, "job not found")
    path = jobs.get_pdf_path(job_id)
    if not path or not os.path.exists(path):
        # Backward compatibility with PDFs written before pdf_path was persisted.
        fallback = os.path.join(settings.reports_dir, f"{job_id}.pdf")
        path = fallback if os.path.exists(fallback) else None
    if not path:
        raise HTTPException(404, "PDF not ready")
    response = FileResponse(path, media_type="application/pdf",
                            filename=f"bullseye_{job_id}.pdf")
    # The same endpoint supports the in-app iframe viewer as well as download.
    # The frontend can still force a download with its download action.
    response.headers["content-disposition"] = (
        f'inline; filename="bullseye_{job_id}.pdf"')
    return response


@router.get("/{job_id}/charts/{chart_name}")
async def get_chart(job_id: str, chart_name: str):
    chart_clean = os.path.basename(chart_name).replace(".png", "")
    chart_path = os.path.join(settings.reports_dir, "charts", f"{chart_clean}.png")
    if not os.path.exists(chart_path) and chart_clean in ("scorecard", "thematic_balance"):
        alt = "thematic_balance.png" if chart_clean == "scorecard" else "scorecard.png"
        alt_path = os.path.join(settings.reports_dir, "charts", alt)
        if os.path.exists(alt_path):
            chart_path = alt_path
    if not os.path.exists(chart_path):
        raise HTTPException(404, "chart not found")
    return FileResponse(chart_path, media_type="image/png")
