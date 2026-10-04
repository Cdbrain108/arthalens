"""Trust regressions discovered in the handoff, with no live provider calls."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.report.schema import assemble_report, grounding_coverage
from app.tools.financial_tools import compute_growth
from app.validation.pipeline import run_validation


def item(**changes):
    return {"claim": "Reported P/E", "value": 15.08, "unit": "x", "metric": "pe_ratio",
            "entity": "TCS", "period": "2026-10-03", "basis": "trailing",
            "source_title": "Quote provider", "source_url": "https://example.com/quote",
            "retrieved_at": "2026-10-03T00:00:00Z", "excerpt": "Reported P/E 15.08",
            "agent": "valuation", "evidence_id": "ev_one", **changes}


def test_growth_matches_handoff_hand_calculation_and_retains_inputs():
    out = compute_growth.invoke({"current": 72275, "previous": 63437,
                                 "current_period": "2026-06-30", "previous_period": "2025-06-30"})
    assert out["data"]["value"] == pytest.approx(13.931934360074)
    assert out["data"]["inputs"] == {"current": 72275, "previous": 63437}
    assert not compute_growth.invoke({"current": 100, "previous": 0,
                                      "current_period": "now", "previous_period": "before"})["ok"]


def test_conflicts_use_metric_entity_period_not_sentence():
    _, conflicts, _ = run_validation([item(), item(claim="Another P/E description", value=14,
                                                   source_title="Other provider", evidence_id="ev_two")])
    assert len(conflicts) == 1
    assert conflicts[0].evidence_ids == ["ev_one", "ev_two"]
    _, conflicts, _ = run_validation([item(), item(value=14, period="2025-10-03", source_title="Other")])
    assert conflicts == []


def test_report_never_trusts_model_defaults_or_keyword_recommendations():
    state = {"query": "Should I hold TCS?", "entities": [{"name": "TCS", "ticker": "TCS"}],
             "intent": "long_term", "evidence": [], "agent_results": {}}
    report = assemble_report({"query": state["query"], "executive_summary": "Cash conversion >90%",
                              "overall_assessment": {"classification": "BUY"},
                              "financial": {"metrics": {"roe_pct": "47.7%"}}}, state)
    assert report.overall_assessment["classification"] == "INSUFFICIENT EVIDENCE"
    assert report.financial["metrics"] == {}
    assert "90%" not in report.model_dump_json()
    assert not report.reasoned_deductions and not report.valuation_scenarios


def test_grounding_counts_original_claims_without_floor():
    state = {"evidence": [item()], "agent_results": {"valuation": {
        "findings": [{"claim": "Reported P/E", "evidence_ids": ["ev_one"]},
                     {"claim": "Unsupported growth", "evidence_ids": ["ev_missing"]}]}}}
    assert grounding_coverage(state)["percentage"] == 50


def test_complete_citations_and_typed_metric_provenance():
    evidence = [item(evidence_id=f"ev_{n}", source_title=f"Provider {n}") for n in range(40)]
    report = assemble_report({"query": "TCS"}, {"entities": [{"name": "TCS", "ticker": "TCS"}],
                              "evidence": evidence, "agent_results": {}, "intent": "general"})
    assert len(report.sources) == 40
    assert report.financial["ratios_table"][0]["evidence_id"] == "ev_0"
    assert report.financial["ratios_table"][0]["sector"] == "Not established"
