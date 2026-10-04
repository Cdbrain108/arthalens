"""Specialist agent execution for LangGraph.

Runs routed specialists concurrently with isolated timeouts and error containment.
Supports both deterministic ₹0 mock mode and live LLM tool-calling execution.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable

from ..config import settings
from ..llm import is_mock
from ..schemas.models import AgentResult, EvidenceItem


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_result(result: AgentResult, name: str, state: dict[str, Any]) -> AgentResult:
    result = result.model_copy(deep=True)
    result.agent = name
    if not result.company:
        entities = state.get("entities") or [{}]
        result.company = entities[0].get("name", "UNKNOWN")
    if not result.timestamp:
        result.timestamp = _now()
    for item in result.evidence:
        item.agent = name
    return result


def run_specialist_mock(name: str, state: dict[str, Any]) -> AgentResult:
    """Deterministic offline path: calls real Python tools and builds AgentResult."""
    from ..agents.specialists import AGENT_REGISTRY

    if name not in AGENT_REGISTRY:
        raise ValueError(f"unknown specialist agent: {name}")

    delta = AGENT_REGISTRY[name]().run_mock(state)
    result = (delta.get("agent_results") or {}).get(name)
    if result is None:
        raise ValueError(f"no specialist mock result for '{name}'")
    return _normalize_result(AgentResult.model_validate(result), name, state)


def run_specialist_live(name: str, state: dict[str, Any], base_result: AgentResult | None = None) -> AgentResult:
    """Live LLM execution grounded in verified provider metrics with structured Pydantic output."""
    from ..agents.specialists import AGENT_REGISTRY
    from ..llm import get_structured_llm

    if name not in AGENT_REGISTRY:
        raise ValueError(f"unknown specialist agent: {name}")

    agent_cls = AGENT_REGISTRY[name]
    agent = agent_cls()

    # Pre-seed document context if document specialist is run
    doc_context = ""
    if name == "document" and state.get("document_ids"):
        try:
            from ..tools.document_tools import search_documents
            out = search_documents.invoke({
                "query": state.get("query", ""),
                "document_ids": state.get("document_ids", [])
            })
            chunks = ((out or {}).get("data") or {}).get("chunks", []) or []
            if chunks:
                doc_context = "\nPre-indexed Document Excerpts:\n" + "\n".join(
                    f"[{c.get('chunk_id')}] {c.get('text', '')[:400]}" for c in chunks[:5]
                )
        except Exception:
            pass

    # Provide verified real-world tool findings and evidence context to the LLM
    data_context = ""
    if base_result and base_result.findings:
        finding_bullets = "\n".join(f"- {f.claim if hasattr(f, 'claim') else str(f)}" for f in base_result.findings)
        data_context = (
            "\nVERIFIED PRIMARY DATA & FILINGS (Current 2026, FY25/FY26 Audited & Latest Reported Quarters):\n"
            f"{finding_bullets}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Base your findings, reasoning, and signals strictly on the verified numbers above.\n"
            "2. Note that current annual audited filings cover FY25 and FY26, and quarterly filings cover 2026. Do NOT invent or default to stale historical periods (such as FY24) as current.\n"
            "3. Provide institutional-grade analysis comparing or evaluating these specific figures."
        )

    entities = state.get("entities") or [{}]
    target_names = " and ".join(e.get("name") or e.get("ticker", "UNKNOWN") for e in entities)
    prompt = (
        f"{agent.system_prompt}\n\n"
        f"Research Target: {target_names}\n"
        f"Query: {state.get('query')}\n"
        f"Research Plan: {state.get('research_plan')}\n"
        f"{doc_context}\n"
        f"{data_context}\n\n"
        "Execute your specialized institutional investigation. Emit verified findings and analytical insights."
    )

    llm = get_structured_llm("specialist", AgentResult)
    result = llm.invoke(prompt)

    # Preserve verified grounded evidence from tools so validation never rejects proven facts
    if base_result and base_result.evidence:
        existing_claims = {e.claim.lower().strip() for e in (result.evidence or [])}
        combined_evidence = list(result.evidence or [])
        for bev in base_result.evidence:
            if bev.claim.lower().strip() not in existing_claims:
                combined_evidence.append(bev)
        result.evidence = combined_evidence

    if base_result and not result.findings:
        result.findings = base_result.findings

    return _normalize_result(result, name, state)


def execute_specialist(name: str, state: dict[str, Any]) -> AgentResult:
    """Dispatches specialist execution based on mock mode or live provider."""
    if name == "news":
        from .news import run_news_specialist
        return run_news_specialist(state)

    det_result = None
    try:
        det_result = run_specialist_mock(name, state)
    except Exception:
        pass

    if is_mock():
        if det_result:
            return det_result
        return run_specialist_mock(name, state)

    try:
        live_result = run_specialist_live(name, state, base_result=det_result)
        if live_result and (live_result.evidence or live_result.findings):
            return live_result
    except Exception:
        pass

    if det_result:
        return det_result
    return run_specialist_mock(name, state)


async def run_all_specialists(
    state: dict[str, Any],
    emit: Callable[[str, Any], None] | None = None
) -> dict[str, Any]:
    """Runs all routed specialists concurrently with timeout & error resilience."""
    selected = list(dict.fromkeys(state.get("selected_agents") or []))
    if not selected:
        # Return a delta, rather than the entire (possibly large) state. This
        # keeps LangGraph merges cheap for conversational queries and avoids
        # accidentally replacing fields written by an earlier node.
        return {}

    results: dict[str, Any] = {}
    completed: list[str] = []
    failed: list[str] = []
    errors: list[dict[str, Any]] = []
    gaps: list[str] = list(state.get("evidence_gaps") or [])
    timestamps: dict[str, str] = dict(state.get("timestamps") or {})

    timeout_s = settings.agent_timeout_s

    async def run_one(name: str):
        if emit:
            emit("node", f"{name}_agent")
        try:
            res: AgentResult = await asyncio.wait_for(
                asyncio.to_thread(execute_specialist, name, deepcopy(state)),
                timeout=timeout_s,
            )
            results[name] = res.model_dump()
            completed.append(name)
            timestamps[name] = _now()
            gaps.extend(res.data_gaps)
            if emit:
                emit("agent_done", name)
        except Exception as exc:
            err_msg = f"timed out after {timeout_s}s" if isinstance(exc, TimeoutError) else str(exc)
            failure = {"agent": name, "error": err_msg}
            errors.append(failure)
            failed.append(name)
            gaps.append(f"agent '{name}' failed: {err_msg}")
            if emit:
                emit("agent_failed", failure)

    tasks = [asyncio.create_task(run_one(name)) for name in selected]
    try:
        await asyncio.gather(*tasks)
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    # Sort results in routed order for deterministic reproducibility
    ordered_results = {name: results[name] for name in selected if name in results}
    ordered_evidence = [
        item
        for name in selected
        for item in (ordered_results.get(name, {}).get("evidence") or [])
    ]

    return {
        "agent_results": ordered_results,
        "evidence": ordered_evidence,
        "completed_agents": sorted(set(completed)),
        "failed_agents": sorted(set(failed)),
        "errors": errors,
        "evidence_gaps": sorted(set(gaps)),
        "timestamps": timestamps,
    }


# Backwards compatibility alias for test monkeypatching
_run_specialists_mock = run_all_specialists
