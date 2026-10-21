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
    "explain", "in", "on", "to", "at", "of", "by", "is", "it", "an",
    "as", "or", "do", "if", "for", "the", "and", "a", "are", "how"
}


def _qa_tokens(value: str) -> set[str]:
    # Support 2-letter financial metrics like PE, PB, DE, RO while filtering stopwords
    return {token for token in re.findall(r"[a-z0-9]{2,}", (value or "").lower())
            if token not in _QA_STOPWORDS}


def _extractive_report_answer(question: str, report: dict, context: dict | None) -> ReportAnswer:
    """Offline extraction across all synthesized report sections and findings."""
    context = context or {}
    query_tokens = _qa_tokens(question)

    is_decision_qa = bool(query_tokens & {"buy", "sell", "hold", "invest", "stance", "verdict", "action", "better", "compare", "winner", "horizon", "recommend", "allocation"})
    current_price_terms = (query_tokens & {"current", "latest", "today", "now"}) and (query_tokens & {"price", "quote", "live", "ticker"})
    if current_price_terms and not is_decision_qa:
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

    # 0. Specialized Verdict Structs (Comparison, Action, Discovery)
    company_obj = (report or {}).get("company") or {}
    cv = company_obj.get("comparison_verdict")
    if isinstance(cv, dict):
        cv_text = f"WINNER: {cv.get('winner_name')} ({cv.get('winner_ticker')}) — {cv.get('winner_reason')}. VALUE PICK: {cv.get('value_name')} ({cv.get('value_ticker')}) — {cv.get('value_reason')}. HOLD vs SELL: {cv.get('hold_vs_sell_guidance')}."
        overlap = len(query_tokens & _qa_tokens(cv_text))
        if any(w in query_tokens for w in ("winner", "better", "compare", "difference", "hold", "sell", "buy")):
            overlap += 8
        if overlap:
            candidates.append((overlap + 5, "Peer Comparison Verdict", cv_text, None))

    ad = company_obj.get("action_decision")
    if isinstance(ad, dict):
        ad_text = f"ACTION DIRECTIVE: {ad.get('headline')}. Existing Shareholders: {ad.get('existing_holders')}. New Capital: {ad.get('fresh_buyers')}. Investment Horizon: {ad.get('long_term_directive')} | {ad.get('short_term_directive')}. Exit Trigger: {ad.get('sell_triggers')}."
        overlap = len(query_tokens & _qa_tokens(ad_text))
        if any(w in query_tokens for w in ("buy", "sell", "hold", "action", "decision", "dip")):
            overlap += 8
        if overlap:
            candidates.append((overlap + 5, "Investment Action Directive", ad_text, None))

    dp = company_obj.get("discovery_portfolio")
    if isinstance(dp, dict):
        dp_text = f"PORTFOLIO BLUEPRINT: {dp.get('headline')}. Summary: {dp.get('summary')}. Deployment: {dp.get('deployment_strategy')}."
        overlap = len(query_tokens & _qa_tokens(dp_text))
        if any(w in query_tokens for w in ("invest", "money", "portfolio", "allocation", "organization", "good")):
            overlap += 8
        if overlap:
            candidates.append((overlap + 5, "Portfolio Discovery Blueprint", dp_text, None))

    # 1. Executive Summary
    exec_summary = (report or {}).get("executive_summary")
    if isinstance(exec_summary, str) and exec_summary.strip():
        overlap = len(query_tokens & _qa_tokens(exec_summary))
        if overlap:
            candidates.append((overlap + 2, "Executive Summary", exec_summary.strip(), None))

    # 2. Overall Assessment / Verdict
    assessment = (report or {}).get("overall_assessment") or (report or {}).get("verdict")
    if isinstance(assessment, dict):
        for field in ("headline", "rationale", "classification"):
            val = str(assessment.get(field) or "").strip()
            overlap = len(query_tokens & _qa_tokens(val))
            if val and overlap:
                candidates.append((overlap + 3, f"Verdict ({field.title()})", val, None))

    # 3. Dual-Thesis Cases (Bull case, Bear case, Triggers, Deductions, Decision Framework)
    for case_type in ("bull_case", "bear_case", "what_could_change_view", "reasoned_deductions"):
        items = (report or {}).get(case_type) or []
        for item in items:
            text = str(item.get("claim", item.get("point", "")) if isinstance(item, dict) else item).strip()
            overlap = len(query_tokens & _qa_tokens(text))
            # Boost matches if the query explicitly asks for bull, bear, or risk
            if ("bull" in query_tokens and "bull" in case_type) or \
               ("bear" in query_tokens and "bear" in case_type) or \
               ("risk" in query_tokens and "bear" in case_type):
                overlap += 4
            if text and overlap:
                candidates.append((overlap + 2, case_type.replace('_', ' ').title(), text, None))

    # 4. Audited Key Metrics
    metrics = (report or {}).get("metrics") or {}
    if isinstance(metrics, dict):
        for m_key, m_val in metrics.items():
            metric_label = m_key.replace('_', ' ').upper()
            val_str = str(m_val)
            metric_str = f"{metric_label}: {val_str}"
            overlap = len(query_tokens & _qa_tokens(f"{m_key} {metric_label}"))
            if ("pe" in query_tokens and "pe" in m_key) or \
               ("pb" in query_tokens and "pb" in m_key) or \
               ("roe" in query_tokens and "roe" in m_key) or \
               ("debt" in query_tokens and "debt" in m_key) or \
               ("margin" in query_tokens and "opm" in m_key):
                overlap += 5
            if overlap:
                candidates.append((overlap + 4, "Audited Metric", metric_str, None))

    # 5. Valuation Scenarios
    for scen in (report or {}).get("valuation_scenarios") or []:
        if isinstance(scen, dict):
            scen_text = f"Multiple {scen.get('multiple')} ({scen.get('implied_price')}): {scen.get('description')}"
            overlap = len(query_tokens & _qa_tokens(scen_text))
            if "pe" in query_tokens or "valuation" in query_tokens:
                overlap += 3
            if overlap:
                candidates.append((overlap + 2, "Valuation Scenario", scen_text, None))

    # 6. Quarterly Financial Performance
    for q_row in (report or {}).get("quarterly_table") or []:
        if isinstance(q_row, dict):
            q_text = f"{q_row.get('period')}: Revenue {q_row.get('revenue')}, Net Profit {q_row.get('net_profit')} ({q_row.get('yoy_growth')})"
            overlap = len(query_tokens & _qa_tokens(q_text))
            if "revenue" in query_tokens or "profit" in query_tokens or "margin" in query_tokens or "ebitda" in query_tokens:
                overlap += 3
            if overlap:
                candidates.append((overlap + 2, "Quarterly Financials", q_text, None))

    # 7. Specialist Agent Findings and Sections
    for section, value in (report or {}).items():
        if not isinstance(value, dict):
            continue
        for field in ("summary", "findings", "swot", "risks", "strengths"):
            raw = value.get(field)
            texts = raw if isinstance(raw, list) else [raw]
            for text in texts:
                text = str(text.get("claim", "") if isinstance(text, dict) else text or "").strip()
                overlap = len(query_tokens & _qa_tokens(text))
                if text and overlap:
                    candidates.append((overlap, section.replace('_', ' ').title(), text, None))

    # 8. Validated Context Evidence
    source_hits: list[dict] = []
    for item in context.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        text = " ".join(str(item.get(key) or "") for key in ("claim", "excerpt", "source_title"))
        overlap = len(query_tokens & _qa_tokens(text))
        if text.strip() and overlap:
            candidates.append((overlap + 1, str(item.get("agent", "Evidence")).title(),
                               item.get("claim") or item.get("excerpt") or text, item))

    candidates.sort(key=lambda item: item[0], reverse=True)
    top = candidates[:6]
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
        lines.append(f"**{section}:** {text}")
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
        answer="Based on the generated report findings:\n\n" + "\n\n".join(f"* {line}" for line in lines),
        sources=source_hits[:8],
        evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
        follow_up_research_needed=False,
    )


def _answer_report_question(question: str, report: dict, context: dict | None) -> ReportAnswer:
    if is_mock():
        return _extractive_report_answer(question, report, context)
    try:
        from ..graph.meta import answer_report_question
        ans = answer_report_question(question, report, context)
        # If the LLM claim states the question is not established, but our deterministic extractor
        # finds verified findings (such as peer verdicts, executive summaries, bull/bear triggers),
        # use the verified report findings so the user receives a factual, grounded answer.
        if ans and (ans.follow_up_research_needed or "not established" in (ans.answer or "").lower()):
            extractive = _extractive_report_answer(question, report, context)
            if extractive and not extractive.follow_up_research_needed:
                return extractive
        return ans
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


@router.api_route("/{job_id}/pdf", methods=["GET", "HEAD"])
async def get_pdf(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    real_id = job.job_id
    clean_id = real_id.replace("research_", "")
    input_clean = job_id.replace("research_", "")

    path = jobs.get_pdf_path(real_id) or jobs.get_pdf_path(job_id)

    # Search comprehensive candidate filenames
    if not path or not os.path.exists(path):
        candidates = [
            os.path.join(settings.reports_dir, f"{real_id}.pdf"),
            os.path.join(settings.reports_dir, f"{job_id}.pdf"),
            os.path.join(settings.reports_dir, f"{clean_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_{real_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_research_{clean_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_{clean_id}.pdf"),
            os.path.join(str(settings.BASE_DIR), f"arthalens_research_{clean_id}.pdf"),
            os.path.join(str(settings.BASE_DIR), f"arthalens_{real_id}.pdf"),
            f"D:/arthalens_research_{clean_id}.pdf",
            f"D:/arthalens_research_{input_clean}.pdf",
            f"D:/{real_id}.pdf",
            f"D:/{clean_id}.pdf",
        ]
        for cand in candidates:
            if cand and os.path.exists(cand):
                path = cand
                break

    # On-demand PDF generation if report JSON exists but PDF was not generated yet
    if not path or not os.path.exists(path):
        report_data = jobs.get_report(real_id) or jobs.get_report(job_id)
        if report_data:
            try:
                from ..report.pdf import render_pdf
                from ..schemas.models import ReportJSON
                path = render_pdf(ReportJSON.model_validate(report_data), real_id)
                jobs.attach_report(real_id, report_data, path)
            except Exception as e:
                logger.error("Failed to render PDF on-demand for %s: %s", real_id, e)

    if not path or not os.path.exists(path):
        raise HTTPException(404, "PDF not ready")

    response = FileResponse(
        path,
        media_type="application/pdf",
        content_disposition_type="inline",
        filename=f"arthalens_{real_id}.pdf",
    )
    response.headers["content-disposition"] = f'inline; filename="arthalens_{real_id}.pdf"'
    response.headers["content-type"] = "application/pdf"
    response.headers["access-control-allow-origin"] = "*"
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
