"""Coverage, provenance and isolation tests with explicit provider fixtures."""
import asyncio
import threading
import time
from types import SimpleNamespace

from app.agents.collectors import collect
from app.graph.routing import BROAD_AGENTS, enforce_policy
from app.schemas.models import QueryAnalysis, ResearchPlan, AgentResult
from app.tools.base import NativeFunctionTool


def state(**extra):
    return {'query': 'Research Example', 'entities': [{'name': 'Example', 'ticker': 'EX', 'exchange': 'NASDAQ'}], **extra}


def envelope(data):
    return {'ok': True, 'data': data, 'source': {'title': 'yfinance test fixture', 'url': 'https://example.invalid/source', 'retrieved_at': '2026-09-01'}}


def test_financial_collects_all_statements_preserves_zero_and_calculation_inputs(monkeypatch):
    calls = []
    original = NativeFunctionTool.invoke
    def invoke(tool, args):
        calls.append((tool.name, args))
        if tool.name in ('calculate_ratio', 'compute_growth'):
            return original(tool, args)
        if tool.name == 'get_financials':
            if args['statement'] == 'income':
                return envelope({'currency': 'USD', 'basis': 'provider-reported', 'line_items': {'2025-12-31': {'Total Revenue': 110, 'Net Income': 0, 'Operating Income': 20}, '2024-12-31': {'Total Revenue': 100, 'Net Income': 10}}})
            if args['statement'] == 'cashflow':
                return envelope({'currency': 'USD', 'line_items': {'2025-12-31': {'Operating Cash Flow': 25, 'Free Cash Flow': 15}}})
            raise RuntimeError('balance outage')
        return {'ok': False, 'error': 'metrics unavailable'}
    monkeypatch.setattr(NativeFunctionTool, 'invoke', invoke)
    result = collect('financial', state())
    assert result.status == 'partial'
    assert {args['statement'] for name, args in calls if name == 'get_financials'} == {'income', 'balance', 'cashflow'}
    assert any(e.metric == 'net_income' and e.value == 0 for e in result.evidence)
    growth = next(e for e in result.evidence if e.metric == 'revenue_growth_pct')
    assert round(growth.value, 4) == 10
    assert growth.calc_inputs == {'current': 110, 'previous': 100}
    assert growth.formula and growth.period == '2024-12-31 to 2025-12-31'
    assert all(f.evidence_ids for f in result.findings)
    assert any('balance' in gap for gap in result.data_gaps)
    assert any(e.metric == 'free_cash_flow' for e in result.evidence)


def test_workforce_invokes_official_ats_and_no_invented_hiring_metrics(monkeypatch):
    calls = []
    def invoke(tool, args):
        calls.append(tool.name)
        if tool.name == 'search_jobs':
            return envelope({'jobs': [{'title': 'Engineer', 'url': 'https://example.invalid/jobs/1'}]})
        return envelope({'results': [{'title': 'Unpermitted', 'url': 'https://linkedin.com/jobs', 'body': 'Growth 900%'}]})
    monkeypatch.setattr(NativeFunctionTool, 'invoke', invoke)
    result = collect('workforce', state())
    assert calls == ['search_jobs', 'search_web']
    assert len(result.evidence) == 1
    assert result.evidence[0].coverage == 'official ATS listing'
    assert all(e.value is None for e in result.evidence)
    assert '900' not in result.model_dump_json()


def test_document_selection_is_enforced_twice(monkeypatch):
    def invoke(tool, args):
        assert args['document_ids'] == ['selected']
        return envelope({'chunks': [{'text': 'Allowed', 'metadata': {'document_id': 'selected', 'page': 2}}, {'text': 'Other upload secret', 'metadata': {'document_id': 'other', 'page': 4}}]})
    monkeypatch.setattr(NativeFunctionTool, 'invoke', invoke)
    result = collect('document', state(document_ids=['selected']))
    assert len(result.evidence) == 1 and result.evidence[0].page == 2
    assert result.evidence[0].source_type == 'uploaded_document'
    assert 'secret' not in result.model_dump_json()


def test_broad_scope_is_not_truncated_and_news_remains_focused():
    plan = ResearchPlan(steps=[], selected_agents=['news', 'jobs'])
    selected = enforce_policy(QueryAnalysis(entities=[], intent='general'), plan, ['doc'])
    assert BROAD_AGENTS | {'document'} == set(selected)
    assert enforce_policy(QueryAnalysis(entities=[], intent='news'), plan, ['doc']) == ['news']


def test_all_selected_agents_run_with_bounded_concurrency_and_empty_not_success(monkeypatch):
    from app.graph import specialists
    from app.config import settings
    active = peak = 0
    lock = threading.Lock()
    called = []
    def execute(name, snapshot):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
            called.append(name)
        time.sleep(.015)
        with lock:
            active -= 1
        return AgentResult(agent=name, company='Example', timestamp='2026-09-01')
    monkeypatch.setattr(settings, 'agent_concurrency', 2)
    monkeypatch.setattr(specialists, 'execute_specialist', execute)
    result = asyncio.run(specialists.run_all_specialists(state(selected_agents=sorted(BROAD_AGENTS))))
    assert set(called) == BROAD_AGENTS and peak == 2
    assert result['completed_agents'] == []
    assert set(result['agent_statuses'].values()) == {'unavailable'}


def test_live_model_cannot_replace_tool_evidence_or_invent_metric(monkeypatch):
    from app.graph.specialists import run_specialist_live
    from app import llm
    base = AgentResult(agent='market', company='Example', timestamp='2026-09-01', evidence=[{
        'evidence_id': 'ev_real', 'claim': 'Price 20', 'value': 20, 'unit': 'USD', 'agent': 'market', 'source_title': 'Provider', 'source_url': 'https://example.invalid', 'excerpt': 'Price 20', 'retrieved_at': '2026-09-01'}])
    forged = base.model_copy(deep=True)
    forged.evidence[0].value = 900
    from app.schemas.models import Finding
    forged.findings = [Finding(claim='Price 900', evidence_ids=['ev_real'])]
    monkeypatch.setattr(llm, 'get_structured_llm', lambda *args: SimpleNamespace(invoke=lambda prompt: forged))
    result = run_specialist_live('market', state(), base)
    assert result.evidence[0].value == 20
    assert not result.findings
    assert result.data_gaps
