"""Unit and integration tests for LangGraph state machine orchestration."""
import sys
import os
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import pytest
from app.graph.state import ResearchState
from app.graph.builder import build_research_graph
from app.graph.runner import run_research, run_flow
from app.graph.routing import enforce_policy, ALL_AGENTS
from app.graph.definitions import AGENT_DEFS, DEF_BY_NAME
from app.schemas.models import QueryAnalysis, ResearchPlan


def test_graph_compiles_cleanly():
    """Verify LangGraph StateGraph builds and compiles without errors."""
    graph = build_research_graph()
    assert graph is not None
    assert hasattr(graph, "invoke") or hasattr(graph, "ainvoke")


def test_agent_definitions_complete():
    """Verify all 9 agents are registered with complete metadata and tools."""
    assert len(AGENT_DEFS) == 11
    assert len(DEF_BY_NAME) == 11
    for name in ALL_AGENTS:
        assert name in DEF_BY_NAME
        defn = DEF_BY_NAME[name]
        assert defn["name"] == name
        assert defn["role"]
        assert defn["goal"]
        assert defn["backstory"]
        assert len(defn["tools"]) > 0


def test_routing_policy_long_term():
    """Verify routing policy selects fundamental agents for long-term questions."""
    analysis = QueryAnalysis(
        entities=[{"name": "TCS", "ticker": "TCS", "exchange": "NSE"}],
        intent="long_term",
        time_horizon="5y",
        compare_mode=False,
    )
    plan = ResearchPlan(steps=["Analysis"], selected_agents=["financial", "valuation", "market"])
    selected = enforce_policy(analysis, plan)
    assert {"financial", "valuation", "market", "news", "risk", "growth"} <= set(selected)


def test_routing_policy_price_move():
    """Verify routing policy excludes valuation on fast price move queries."""
    analysis = QueryAnalysis(
        entities=[{"name": "TCS", "ticker": "TCS", "exchange": "NSE"}],
        intent="price_move",
        time_horizon="1d",
        compare_mode=False,
    )
    plan = ResearchPlan(steps=["Check move"], selected_agents=["valuation", "market", "news"])
    selected = enforce_policy(analysis, plan)
    assert "market" in selected and "news" in selected
    assert "valuation" not in selected


def test_full_graph_execution_mock(monkeypatch, tmp_path, offline_data_tools):
    """Test full LangGraph execution in deterministic mock mode."""
    from app.config import settings
    monkeypatch.setattr(settings, "model_provider", "mock")
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(settings, "reports_dir", str(tmp_path / "reports"))
    events = []

    def on_event(kind, payload):
        events.append((kind, payload))

    result = asyncio.run(run_research(
        query="Should I hold TCS for the next 5 years?",
        job_id="test-job-langgraph-1",
        on_event=on_event,
    ))

    assert result["current_node"] == "generate_pdf"
    assert result["report"] is not None
    assert result["report"]["query"] == "Should I hold TCS for the next 5 years?"
    assert result['agent_statuses']
    assert all(status == 'unavailable' for status in result['agent_statuses'].values())
    assert result["pdf_path"] is not None

    # Check that lifecycle events fired
    node_events = [payload for kind, payload in events if kind == "node"]
    assert "analyze_query" in node_events
    assert "create_plan" in node_events
    assert "apply_routing_policy" in node_events
    assert "generate_pdf" in node_events
