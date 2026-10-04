"""Workflow orchestrator for Artha AI using LangGraph.

This module unifies graph creation and graph execution into one clear,
straightforward file:
1. `build_research_graph()`: Assembles the LangGraph `StateGraph(ResearchState)`
   connecting the 10 sequential/parallel research stages.
2. `run_research()` / `run_flow()`: Executes the graph, streaming real-time
   progress events (node, agent status, final report) to the UI & JobManager.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import os
from typing import Any, Callable

from langgraph.graph import StateGraph, START, END

from .state import ResearchState
from .nodes import (
    node_analyze_query,
    node_create_plan,
    node_apply_routing_policy,
    node_run_specialists,
    node_collect_results,
    node_validate_evidence,
    node_challenge_thesis,
    node_synthesize_report,
    node_build_report,
    node_generate_pdf,
)
from .specialists import run_all_specialists


def build_research_graph(checkpointer: Any = None) -> Any:
    """Build and compile the LangGraph StateGraph.

    The graph has 10 deterministic steps:
        START
          ↓
        analyze_query       (Detect intent, tickers, time horizon)
          ↓
        create_plan         (Propose questions and specialists)
          ↓
        apply_routing_policy(Deterministic rules & caps)
          ↓
        run_specialists     (Concurrent fan-out of 1-8 specialist agents)
          ↓
        collect_results     (Synchronize facts and signals)
          ↓
        validate_evidence   (Truth audit, conflict resolution)
          ↓
        challenge_thesis    (Adversarial Bull & Bear cases)
          ↓
        synthesize_report   (Executive synthesis)
          ↓
        build_report        (Calculates ratios & builds ReportJSON)
          ↓
        generate_pdf        (Compiles A4 PDF via Jinja2 & WeasyPrint)
          ↓
         END
    """
    workflow = StateGraph(ResearchState)

    # 1. Register all nodes
    workflow.add_node("analyze_query", node_analyze_query)
    workflow.add_node("create_plan", node_create_plan)
    workflow.add_node("apply_routing_policy", node_apply_routing_policy)
    workflow.add_node("run_specialists", node_run_specialists)
    workflow.add_node("collect_results", node_collect_results)
    workflow.add_node("validate_evidence", node_validate_evidence)
    workflow.add_node("challenge_thesis", node_challenge_thesis)
    workflow.add_node("synthesize_report", node_synthesize_report)
    workflow.add_node("build_report", node_build_report)
    workflow.add_node("generate_pdf", node_generate_pdf)

    # 2. Add linear deterministic edges connecting the nodes
    workflow.add_edge(START, "analyze_query")
    workflow.add_edge("analyze_query", "create_plan")
    workflow.add_edge("create_plan", "apply_routing_policy")
    workflow.add_edge("apply_routing_policy", "run_specialists")
    workflow.add_edge("run_specialists", "collect_results")
    workflow.add_edge("collect_results", "validate_evidence")
    workflow.add_edge("validate_evidence", "challenge_thesis")
    workflow.add_edge("challenge_thesis", "synthesize_report")
    workflow.add_edge("synthesize_report", "build_report")
    workflow.add_edge("build_report", "generate_pdf")
    workflow.add_edge("generate_pdf", END)

    return workflow.compile(checkpointer=checkpointer)


# Singleton instance of compiled graph
_graph_singleton = None


def get_graph():
    """Retrieve or lazily compile the research graph."""
    global _graph_singleton
    if _graph_singleton is None:
        _graph_singleton = build_research_graph()
    return _graph_singleton


def uses_real_llm() -> bool:
    """Return True if real LLM keys are configured (Gemini/OpenAI/Ollama)."""
    from ..llm import is_mock
    return not is_mock()


# Compatibility alias
uses_real_crew = uses_real_llm


def build_llm(temperature: float = 0.2):
    """Factory helper to obtain the active LLM."""
    from ..llm import get_llm
    return get_llm(temperature=temperature)


async def run_flow(
    query: str,
    job_id: str,
    document_ids: list[str] | None = None,
    on_event: Callable[[str, Any], None] | None = None,
) -> dict[str, Any]:
    """Execute the full research pipeline and stream status events.

    Args:
        query: User's financial research query (e.g. "Analyze TCS vs INFY")
        job_id: Unique identifier for tracking in SQLite & UI
        document_ids: List of uploaded document IDs for RAG analysis
        on_event: Callback for streaming events ('node', 'agent_done', etc.)

    Returns:
        The final completed `ResearchState` dictionary.
    """
    def emit(kind: str, payload: Any):
        if on_event:
            try:
                on_event(kind, payload)
            except Exception:
                pass

    # Initial research state
    state: ResearchState = {
        "query": query,
        "job_id": job_id,
        "document_ids": list(document_ids or []),
        "mode": "auto",
        "intent": None,
        "entities": [],
        "time_horizon": None,
        "compare_mode": False,
        "research_plan": None,
        "selected_agents": [],
        "agent_results": {},
        "evidence": [],
        "evidence_gaps": [],
        "completed_agents": [],
        "failed_agents": [],
        "errors": [],
        "validation_results": [],
        "conflicts": [],
        "rejected_evidence": [],
        "bull_case": [],
        "bear_case": [],
        "risks": [],
        "what_could_change_view": [],
        "synthesis": None,
        "report": None,
        "pdf_path": None,
        "current_node": "start",
        "timestamps": {},
    }

    async def execute_node(node_name: str, fn):
        state["current_node"] = node_name
        emit("node", node_name)
        delta = await fn(state)
        for k, v in delta.items():
            if k == "timestamps":
                state["timestamps"].update(v)
            else:
                state[k] = v
        return delta

    # 1. Analyze query
    await execute_node("analyze_query", node_analyze_query)
    emit("analysis", {
        "intent": state.get("intent"),
        "entities": state.get("entities"),
        "compare_mode": state.get("compare_mode", False),
    })

    # 2. Create research plan
    await execute_node("create_plan", node_create_plan)

    # 3. Apply routing guardrails
    await execute_node("apply_routing_policy", node_apply_routing_policy)
    emit("agents", list(state.get("selected_agents") or []))

    # 4. Run specialists (concurrent fan-out)
    state["current_node"] = "run_specialists"
    from . import specialists as graph_specialists
    from . import runner as graph_runner
    runner_fn = getattr(graph_runner, "_run_specialists_mock", None)
    if runner_fn is None or runner_fn == graph_specialists.run_all_specialists:
        runner_fn = getattr(graph_specialists, "_run_specialists_mock", None)
    if runner_fn and runner_fn != graph_specialists.run_all_specialists:
        try:
            specialist_delta = (await runner_fn(state, emit)) or {}
        except TypeError:
            specialist_delta = (await runner_fn(state, emit=emit)) or {}
    else:
        specialist_delta = (await graph_specialists.run_all_specialists(state, emit=emit)) or {}
    for k, v in specialist_delta.items():
        if k == "timestamps":
            state["timestamps"].update(v)
        else:
            state[k] = v

    # 5. Collect results
    await execute_node("collect_results", node_collect_results)

    # 6. Validate evidence (Truth audit)
    await execute_node("validate_evidence", node_validate_evidence)

    # 7. Challenge thesis (Bull / Bear / Risks)
    await execute_node("challenge_thesis", node_challenge_thesis)

    # 8. Synthesize findings
    await execute_node("synthesize_report", node_synthesize_report)

    # 9. Build structured report
    await execute_node("build_report", node_build_report)
    emit("report", state.get("report"))

    # 10. Generate PDF
    await execute_node("generate_pdf", node_generate_pdf)

    return state


async def run_research(
    query: str,
    job_id: str,
    document_ids: list[str] | None = None,
    on_event: Callable[[str, Any], None] | None = None,
) -> dict[str, Any]:
    """Alias for run_flow to maintain universal compatibility."""
    return await run_flow(query, job_id, document_ids=document_ids, on_event=on_event)
