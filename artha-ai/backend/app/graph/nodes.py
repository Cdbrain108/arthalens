"""LangGraph Node Definitions.

Each node represents an isolated, deterministic stage in the stock research graph.
Every node is a pure function:
    async def node_name(state: ResearchState) -> dict[str, Any]
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from ..schemas.models import QueryAnalysis, ResearchPlan
from . import stages
from .routing import enforce_policy
from .specialists import run_all_specialists
from .state import ResearchState


def _stamp(state: ResearchState, node_name: str) -> dict[str, Any]:
    timestamps = dict(state.get("timestamps") or {})
    timestamps[node_name] = datetime.now(timezone.utc).isoformat()
    return {
        "current_node": node_name,
        "timestamps": timestamps,
    }


async def node_analyze_query(state: ResearchState) -> dict[str, Any]:
    """Extract entities, intent, time horizon, and comparison mode from query."""
    delta = await asyncio.to_thread(stages.analyze_query, deepcopy(dict(state)))
    return delta


async def node_create_plan(state: ResearchState) -> dict[str, Any]:
    """Generate initial research plan with step breakdown and recommended agents."""
    delta = await asyncio.to_thread(stages.create_plan, deepcopy(dict(state)))
    return delta


async def node_apply_routing_policy(state: ResearchState) -> dict[str, Any]:
    """Enforce deterministic routing policy and agent caps based on query type."""
    analysis = QueryAnalysis(
        entities=state.get("entities") or [],
        intent=state.get("intent"),
        time_horizon=state.get("time_horizon"),
        compare_mode=state.get("compare_mode", False),
    )
    plan_dict = state.get("research_plan") or {"steps": [], "selected_agents": []}
    plan = ResearchPlan.model_validate(plan_dict)

    selected = enforce_policy(analysis, plan, document_ids=state.get("document_ids"))
    import re
    if analysis.intent not in ('conversational', 'news', 'price_move') and re.search(r'\b(sentiment|social|reddit|investor discussion)\b', state.get('query', ''), re.I):
        if 'social' not in selected:
            selected.append('social')

    updated_plan = dict(plan_dict)
    updated_plan["selected_agents"] = list(selected)

    return {
        **_stamp(state, "apply_routing_policy"),
        "selected_agents": list(selected),
        "research_plan": updated_plan,
    }


async def node_run_specialists(state: ResearchState) -> dict[str, Any]:
    """Execute routed specialist agents concurrently with timeout protection."""
    # Note: Event emission during specialist execution is handled via runner callback
    delta = await run_all_specialists(dict(state))
    return {
        **_stamp(state, "run_specialists"),
        **delta,
    }


async def node_collect_results(state: ResearchState) -> dict[str, Any]:
    """Synchronize evidence collections and finalize specialist metrics."""
    return _stamp(state, "collect_results")


async def node_validate_evidence(state: ResearchState) -> dict[str, Any]:
    """Cross-verify all evidence, reject malformed claims, and detect factual conflicts."""
    delta = await asyncio.to_thread(stages.validate_evidence, deepcopy(dict(state)))
    return delta


async def node_challenge_thesis(state: ResearchState) -> dict[str, Any]:
    """Build adversarial Bull Case, Bear Case, and key risks from validated facts."""
    delta = await asyncio.to_thread(stages.bull_bear_risk, deepcopy(dict(state)))
    return delta


async def node_synthesize_report(state: ResearchState) -> dict[str, Any]:
    """Synthesize complete ReportJSON grounded strictly in verified findings."""
    delta = await asyncio.to_thread(stages.synthesize, deepcopy(dict(state)))
    return delta


async def node_build_report(state: ResearchState) -> dict[str, Any]:
    """Assemble final institutional report structure and calculate financial metrics."""
    delta = await asyncio.to_thread(stages.build_report, deepcopy(dict(state)))
    return delta


async def node_generate_pdf(state: ResearchState) -> dict[str, Any]:
    """Compile publication-grade PDF deliverable using HTML templates and WeasyPrint."""
    delta = await asyncio.to_thread(stages.generate_pdf, deepcopy(dict(state)))
    return delta
