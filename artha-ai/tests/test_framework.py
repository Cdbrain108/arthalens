"""Baseline contract tests: deterministic ratios, routing policy, validation."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.tools.financial_tools import RATIO_FORMULAS, calculate_ratio
from app.graph.routing import enforce_policy
from app.schemas.models import QueryAnalysis, ResearchPlan
from app.validation.pipeline import run_validation


def test_ratios_are_deterministic():
    assert RATIO_FORMULAS["pe"]({"price": 100, "eps": 5}) == 20
    assert RATIO_FORMULAS["roe"]({"net_income": 10, "avg_equity": 50}) == 0.2
    out = calculate_ratio.invoke({"name": "pe", "inputs": {"price": 100, "eps": 5}})
    assert out["ok"] and out["data"]["value"] == 20
    assert out["data"]["inputs"] == {"price": 100, "eps": 5}  # inputs retained


def test_routing_policy_price_move():
    a = QueryAnalysis(entities=[], intent="price_move")
    plan = ResearchPlan(steps=[], selected_agents=["valuation", "market", "news"])
    selected = enforce_policy(a, plan)
    assert "market" in selected and "news" in selected
    assert "valuation" not in selected  # over-route corrected deterministically


def test_routing_policy_long_term_minimums():
    a = QueryAnalysis(entities=[], intent="long_term", time_horizon="5y")
    plan = ResearchPlan(steps=[], selected_agents=["news"])
    selected = set(enforce_policy(a, plan))
    assert {"financial", "valuation", "market", "news", "risk", "growth"} <= selected


def test_validation_flags_missing_provenance():
    evidence = [{"claim": "Revenue grew 14%", "value": 14, "unit": "percent",
                 "source_title": "", "retrieved_at": "2026-01-01T00:00:00Z",
                 "excerpt": "", "agent": "financial"}]
    results, _conflicts, gaps = run_validation(evidence)
    assert not results[0].passed
    assert gaps, "unprovenanced claims must surface as gaps"


def test_validation_detects_numeric_conflict():
    evidence = [
        {"claim": "revenue", "value": 100.0, "unit": "cr", "source_title": "A",
         "retrieved_at": "t", "excerpt": "x", "agent": "financial"},
        {"claim": "revenue", "value": 103.0, "unit": "cr", "source_title": "B",
         "retrieved_at": "t", "excerpt": "y", "agent": "financial"},
    ]
    _r, conflicts, gaps = run_validation(evidence)
    assert conflicts and conflicts[0].resolution is None
    assert any("conflict" in g.lower() for g in gaps)
