"""Offline regressions for the LangGraph pipeline; never invoke providers or data tools."""
import asyncio
import json
import os
from pathlib import Path
import socket
import sys
import threading
from types import SimpleNamespace

import pytest

os.environ.setdefault("OTEL_SDK_DISABLED", "true")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.graph import runner, stages
from app.graph import specialists as graph_specialists
from app.graph.routing import ALL_AGENTS, ROUTING_TABLE, enforce_policy
from app.schemas.models import AgentResult, Entity, QueryAnalysis, ResearchPlan, ReportJSON


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Network/provider access is forbidden in pipeline regressions")

    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(runner, "build_llm", forbidden)
    monkeypatch.setattr(stages, "is_mock", lambda: True)
    from app.agents.specialists import AGENT_REGISTRY
    for cls in AGENT_REGISTRY.values():
        monkeypatch.setattr(cls, "run_mock", forbidden)


def evidence(agent="market", claim="Verified price", **overrides):
    item = dict(claim=claim, source_title="Exchange filing",
                source_url="https://example.invalid/filing", retrieved_at="2026-01-01",
                publication_date="2026-01-01", excerpt=claim, agent=agent,
                value=100, unit="INR")
    item.update(overrides)
    return item


def result(name="market", items=None, **overrides):
    fields = dict(agent=name, company="TCS", timestamp="2026-01-01",
                  findings=["Verified price"],
                  evidence=[evidence(name)] if items is None else items)
    fields.update(overrides)
    return AgentResult(**fields)


def state(selected=None):
    return dict(query="Why did TCS move today?", job_id="offline-job",
                entities=[{"name": "TCS", "ticker": "TCS", "exchange": "NSE"}],
                selected_agents=selected or ["market", "news"],
                agent_results={}, evidence=[], errors=[], evidence_gaps=[],
                completed_agents=[], failed_agents=[], timestamps={})


def render(template: str, state: dict) -> str:
    company = (state.get("entities") or [{}])[0].get("name", "UNKNOWN")
    plan = state.get("research_plan") or {}
    steps = plan.get("steps", [])
    required_evidence = plan.get("required_evidence", [])
    brief = template.format(query=state.get("query", ""), company=company, steps=steps)
    brief += "\nRequired evidence checklist: " + json.dumps(required_evidence, ensure_ascii=False)
    context = {key: state.get(key) for key in
               ("entities", "time_horizon", "compare_mode", "document_ids")}
    return brief + "\nResearch context: " + json.dumps(context, ensure_ascii=False)


@pytest.mark.parametrize("intent", list(ROUTING_TABLE))
@pytest.mark.parametrize("compare_mode", [False, True])
def test_routing_cap_never_drops_required_agents(intent, compare_mode):
    analysis = QueryAnalysis(entities=[Entity(name="TCS", ticker="TCS")], intent=intent,
                             time_horizon="5y", compare_mode=compare_mode)
    plan = ResearchPlan(steps=[], selected_agents=ALL_AGENTS)
    selected = set(enforce_policy(analysis, plan))
    assert ROUTING_TABLE[intent]["min"] <= selected
    assert not (ROUTING_TABLE[intent]["never"] & selected)
    assert selected <= set(ALL_AGENTS)  # concurrency must never truncate scope


def test_document_agent_unroutable_for_price_move_unless_uploaded_or_filing_intent():
    plan = ResearchPlan(steps=[], selected_agents=["market", "news"])
    pm = QueryAnalysis(entities=[], intent="price_move")
    assert "document" not in enforce_policy(pm, plan)
    assert "document" in enforce_policy(pm, plan, document_ids=["doc_1"])
    doc_intent = QueryAnalysis(entities=[], intent="document")
    assert "document" in enforce_policy(doc_intent, plan)


def test_live_brief_includes_tickers_comparison_and_documents():
    brief = render("{query} / {company} / {steps}", {
        "query": "Compare these companies", "entities": [
            {"name": "One", "ticker": "AAA", "exchange": "NSE"},
            {"name": "Two", "ticker": "BBB", "exchange": "NASDAQ"}],
        "document_ids": ["uploaded-report"], "compare_mode": True,
        "time_horizon": "5y", "research_plan": {"steps": ["market"]}})
    for expected in ("AAA", "BBB", "NASDAQ", "uploaded-report", "5y"):
        assert expected in brief


@pytest.mark.parametrize("format", ["pydantic", "raw", "json_dict"])
def test_task_output_formats_share_identity_normalization(format):
    original = result("spoofed", company="TCS and INFY", timestamp="")
    value = {"pydantic": original, "raw": original.model_dump_json(),
             "json_dict": original.model_dump()}[format]
    if isinstance(value, str):
        parsed_res = AgentResult.model_validate_json(value)
    elif isinstance(value, dict):
        parsed_res = AgentResult.model_validate(value)
    else:
        parsed_res = value
    parsed = graph_specialists._normalize_result(parsed_res, "market", state())
    assert parsed.agent == parsed.evidence[0].agent == "market"
    assert parsed.company == "TCS and INFY"
    assert parsed.timestamp
    assert original.agent == "spoofed" and not original.timestamp


def test_specialists_are_parallel_isolate_failure_and_emit_on_loop(monkeypatch):
    working = state()
    barrier = threading.Barrier(2)
    loop_thread = threading.get_ident()
    events = []

    def worker(name, snapshot):
        assert threading.get_ident() != loop_thread
        snapshot["entities"][0]["name"] = "worker-only mutation"
        barrier.wait(timeout=5)
        if name == "market":
            raise ValueError("broken specialist")
        return result(name, data_gaps=["news coverage incomplete"])

    def emit(kind, payload):
        assert threading.get_ident() == loop_thread
        events.append((kind, payload))

    monkeypatch.setattr(graph_specialists, "execute_specialist", worker)
    asyncio.run(graph_specialists.run_all_specialists(working, emit))
    delta = asyncio.run(graph_specialists.run_all_specialists(working, emit))
    for k, v in delta.items():
        if k == "timestamps":
            working["timestamps"].update(v)
        else:
            working[k] = v
    assert working["completed_agents"] == ["news"]
    assert working["failed_agents"] == ["market"]
    assert working["errors"] == [{"agent": "market", "error": "broken specialist"}]
    assert working["entities"][0]["name"] == "TCS"
    assert "news coverage incomplete" in working["evidence_gaps"]
    assert ("agent_done", "news") in events


def test_live_specialist_without_evidence_falls_back_to_grounded_mock(monkeypatch):
    live = result("market", items=[], findings=[])
    grounded = result("market", items=[evidence("market", claim="Grounded fallback")])

    monkeypatch.setattr(graph_specialists, "is_mock", lambda: False)
    monkeypatch.setattr(graph_specialists, "run_specialist_live", lambda name, snapshot, base_result=None: live)
    monkeypatch.setattr(graph_specialists, "run_specialist_mock", lambda name, snapshot: grounded)

    assert graph_specialists.execute_specialist("market", state(["market"])) == grounded


def test_specialist_timeout_discards_late_results(monkeypatch):
    started, release, finished = threading.Event(), threading.Event(), threading.Event()
    working = state(["market"])
    events = []

    def worker(*args):
        started.set()
        try:
            assert release.wait(5)
            return result()
        finally:
            finished.set()

    from app.config import settings
    monkeypatch.setattr(settings, "agent_timeout_s", 0.05)
    monkeypatch.setattr(graph_specialists, "execute_specialist", worker)

    async def check():
        try:
            delta = await graph_specialists.run_all_specialists(working, lambda *args: events.append(args))
            for k, v in delta.items():
                if k == "timestamps":
                    working["timestamps"].update(v)
                else:
                    working[k] = v
            assert started.is_set()
            assert working["failed_agents"] == ["market"]
            assert "timed out" in working["errors"][0]["error"]
        finally:
            release.set()
            await asyncio.to_thread(finished.wait, 5)
        await asyncio.sleep(0)
        assert working["completed_agents"] == []
        assert [kind for kind, _ in events] == ["node", "agent_failed"]

    asyncio.run(check())


def test_evidence_gate_filters_nested_results_conflicts_and_citations():
    good = evidence()
    bad = evidence(claim="Unsupported moonshot", source_url=None)
    conflict_a = evidence(claim="Revenue", value=10, unit="cr", source_title="A")
    conflict_b = evidence(claim="Revenue", value=20, unit="cr", source_title="B")
    working = state(["market"])
    working["evidence"] = [good, bad, conflict_a, conflict_b, {"claim": "Malformed"}]
    working["agent_results"] = {"market": result(items=[good, bad],
        findings=["Unsupported moonshot"], positive_signals=["Unsupported moonshot"],
        data_gaps=["Missing annual filing"]).model_dump()}
    working.update(stages.validate_evidence(working))
    assert [item["claim"] for item in working["evidence"]] == ["Verified price"]
    assert len(working["rejected_evidence"]) == 4
    assert len(working["validation_results"]) == 5
    assert working["agent_results"]["market"]["findings"] == ["Verified price"]
    assert working["agent_results"]["market"]["positive_signals"] == []
    assert "Missing annual filing" in working["evidence_gaps"]
    working.update(stages.bull_bear_risk(working))
    working.update(stages.synthesize(working))
    working.update(stages.build_report(working))
    report = working["report"]
    assert report["market"]["findings"] == ["Verified price"]
    assert "Unsupported moonshot" not in json.dumps(report["bull_case"])
    assert len(report["sources"]) == 1
    assert report["financial"]["findings"] == []
    assert report["financial"]["summary"].startswith("Unavailable")


def test_rejected_raw_evidence_is_never_sent_to_live_synthesizer(monkeypatch):
    working = state(["market"])
    working["evidence"] = [evidence(), evidence(claim="bad", source_url=None,
                                              excerpt="RAW_REJECTED_SECRET")]
    working["agent_results"] = {"market": result().model_dump()}
    working.update(stages.validate_evidence(working))
    captured = []
    monkeypatch.setattr(stages, "is_mock", lambda: False)

    def fake_synthesize(state):
        captured.append(json.dumps(state.get("evidence", [])))
        return ReportJSON(query=working["query"])

    monkeypatch.setattr(stages.meta, "synthesize", fake_synthesize)
    stages.synthesize(working)
    assert len(captured) == 1
    assert "RAW_REJECTED_SECRET" not in captured[0]


@pytest.mark.parametrize("live", [False, True])
def test_no_evidence_never_produces_investment_rating_or_calls_llm(monkeypatch, live):
    monkeypatch.setattr(stages, "is_mock", lambda: not live)
    working = state(["market"])
    working["agent_results"] = {"market": result(items=[], positive_signals=["BUY"] * 5).model_dump()}
    for stage in (stages.validate_evidence, stages.bull_bear_risk,
                  stages.synthesize, stages.build_report):
        working.update(stage(working))
    report = working["report"]
    assert report["overall_assessment"]["classification"] == "INSUFFICIENT EVIDENCE"
    assert report["sources"] == []
    assert not report["bull_case"] and not report["bear_case"]
    assert report["market"]["findings"] == []


@pytest.mark.parametrize("live", [False, True])
def test_pipeline_routes_mode_preserves_timestamps_and_report(monkeypatch, live):
    calls, events = [], []
    monkeypatch.setattr(runner, "uses_real_llm", lambda: live)

    def worker(name, snapshot):
        calls.append(name)
        return result(name)

    monkeypatch.setattr(graph_specialists, "execute_specialist", worker)
    monkeypatch.setattr(stages, "render_pdf", lambda *args, **kwargs: "offline.pdf")
    final = asyncio.run(runner.run_research("Why did TCS move today?", "offline-job",
        on_event=lambda *args: events.append(args)))
    assert sorted(calls) == ["market", "news"]
    assert final["selected_agents"] == ["market", "news"]
    assert final["pdf_path"] == "offline.pdf"
    assert [item["agent"] for item in final["evidence"]] == ["market", "news"]
    assert events[-1] == ("node", "generate_pdf")


def test_live_stages_and_specialists_share_the_routed_plan(monkeypatch):
    roles, specialist_calls = [], []
    monkeypatch.setattr(stages, "is_mock", lambda: False)
    from app.schemas.models import ChallengeOutput
    from app.graph import meta as graph_meta

    outputs = {
        "analyzer": QueryAnalysis(entities=[{"name": "TCS", "ticker": "TCS"}],
                                  intent="price_move"),
        "planner": ResearchPlan(steps=["market", "news"],
                                selected_agents=["valuation", "market"]),
        "challenger": ChallengeOutput(bull_case=["Verified price"], bear_case=[],
                                      risks=[], what_could_change_view=[]),
        "synthesizer": ReportJSON(query="Why did TCS move today?"),
    }

    def fake_analyze(query):
        roles.append("analyzer")
        return outputs["analyzer"]

    def fake_plan(query, analysis):
        roles.append("planner")
        assert isinstance(analysis, QueryAnalysis)
        return outputs["planner"]

    def fake_challenge(query, ev):
        roles.append("challenger")
        return outputs["challenger"]

    def fake_synthesize(state):
        roles.append("synthesizer")
        return outputs["synthesizer"]

    def specialist(name, snapshot):
        specialist_calls.append(name)
        assert snapshot["research_plan"]["selected_agents"] == ["market", "news"]
        return result(name)

    monkeypatch.setattr(graph_meta, "analyze", fake_analyze)
    monkeypatch.setattr(graph_meta, "plan", fake_plan)
    monkeypatch.setattr(graph_meta, "challenge", fake_challenge)
    monkeypatch.setattr(graph_meta, "synthesize", fake_synthesize)
    monkeypatch.setattr(graph_specialists, "execute_specialist", specialist)
    monkeypatch.setattr(stages, "render_pdf", lambda *args, **kwargs: "offline.pdf")
    final = asyncio.run(runner.run_research("Why did TCS move today?", "offline-job"))
    assert roles == ["analyzer", "planner", "challenger", "synthesizer"]
    assert sorted(specialist_calls) == ["market", "news"]
    assert final["failed_agents"] == []
