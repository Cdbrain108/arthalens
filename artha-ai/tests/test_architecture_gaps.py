"""Architecture gap coverage for LangGraph orchestration (offline, no network)."""
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("OTEL_SDK_DISABLED", "true")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def test_native_tools_are_basetool():
    from langchain_core.tools import BaseTool
    from app.tools import (market_tools, financial_tools, news_tools, web_tools,
                           document_tools, filings_tools, jobs_tools)
    tools = [
        market_tools.get_quote, market_tools.get_price_history,
        market_tools.get_volume, market_tools.get_benchmark_history,
        market_tools.get_technicals,
        financial_tools.get_financials, financial_tools.get_company_metrics,
        financial_tools.calculate_ratio, financial_tools.get_peer_multiples,
        financial_tools.get_historical_multiples,
        filings_tools.get_edgar_quarterly, filings_tools.get_nse_results,
        filings_tools.get_quarterly_results,
        jobs_tools.search_jobs, jobs_tools.fetch_job_detail,
        news_tools.search_news, news_tools.fetch_news,
        web_tools.search_web, web_tools.fetch_page,
        document_tools.search_documents, document_tools.retrieve_evidence,
    ]
    assert len(tools) == 21
    for tool in tools:
        assert isinstance(tool, BaseTool), tool
        assert tool.name and tool.description, tool.name
        assert tool.args_schema is not None, tool.name
        assert callable(getattr(tool, "_run", None)), tool.name


def test_read_only_tool_cache_reuses_successful_provider_result():
    from pydantic import BaseModel
    from app.tools.base import NativeFunctionTool, clear_tool_cache

    class Args(BaseModel):
        ticker: str

    calls = []

    def provider(ticker):
        calls.append(ticker)
        return {"ok": True, "data": {"ticker": ticker}}

    clear_tool_cache()
    tool = NativeFunctionTool(
        name="cache_test_provider", description="test", args_schema=Args,
        function=provider, cache_ttl_s=30,
    )
    assert tool.invoke({"ticker": "TCS"}) == tool.invoke({"ticker": "TCS"})
    assert calls == ["TCS"]
    clear_tool_cache()


def test_tool_argument_validation_rejects_bad_input():
    from app.tools.financial_tools import calculate_ratio
    # Pydantic args_schema enforces types: inputs must be dict[str, float].
    with pytest.raises(Exception):
        calculate_ratio.args_schema.model_validate({"name": "pe", "inputs": "not-a-dict"})
    # Unknown ratio -> ok:false, never exception.
    out = calculate_ratio.invoke({"name": "nope", "inputs": {}})
    assert out["ok"] is False and out["error"]
    # Missing input -> ok:false.
    out = calculate_ratio.invoke({"name": "pe", "inputs": {"price": 100.0}})
    assert out["ok"] is False
    # Zero denominator -> ok:false (not inf).
    out = calculate_ratio.invoke({"name": "pe", "inputs": {"price": 100.0, "eps": 0.0}})
    assert out["ok"] is False
    # Non-finite -> ok:false.
    out = calculate_ratio.invoke({"name": "pe", "inputs": {"price": float("inf"), "eps": 5.0}})
    assert out["ok"] is False
    # Valid -> ok:true with retained inputs.
    out = calculate_ratio.invoke({"name": "pe", "inputs": {"price": 100.0, "eps": 5.0}})
    assert out["ok"] is True and out["data"]["value"] == 20.0
    assert out["data"]["inputs"] == {"price": 100.0, "eps": 5.0}
    assert out["source"]["provider"] == "deterministic_calculation"
    assert out["source"]["retrieved_at"]


def test_news_rss_parsing_iso_dates_and_since_filter(monkeypatch):
    import app.tools.news_tools as news

    rss = """<?xml version="1.0"?><rss><channel>
    <item><title>New deal</title><link>https://example.invalid/a</link>
    <pubDate>Mon, 02 Feb 2026 10:00:00 GMT</pubDate><source>Example</source></item>
    <item><title>Old deal</title><link>https://example.invalid/b</link>
    <pubDate>Mon, 02 Feb 2020 10:00:00 GMT</pubDate><source>Example</source></item>
    </channel></rss>"""

    class FakeResp:
        text = rss
        headers = {}
        def raise_for_status(self):
            return None

    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp())
    out = news.search_news.invoke({"query": "TCS"})
    assert out["ok"] is True
    assert len(out["data"]["items"]) == 2
    # ISO dates (was raw RFC strings before the fix).
    assert out["data"]["items"][0]["publication_date"].startswith("2026-02-02")
    # Since filter compares parsed dates, not raw strings.
    filtered = news.search_news.invoke({"query": "TCS", "since": "2025-01-01"})
    assert [i["title"] for i in filtered["data"]["items"]] == ["New deal"]
    assert out["source"]["provider"] == "google_news_rss"


def test_news_failure_envelope_is_ok_false(monkeypatch):
    import app.tools.news_tools as news
    import httpx

    def boom(*a, **k):
        raise RuntimeError("rss down")

    monkeypatch.setattr(httpx, "get", boom)
    out = news.search_news.invoke({"query": "TCS"})
    assert out["ok"] is False
    assert out["data"]["items"] == []
    assert out["error"] == "rss down"


def test_deep_news_search_fans_out_and_deduplicates(monkeypatch):
    import app.tools.news_tools as news

    calls = []

    def fake_search(query, limit=8, resolve_urls=True):
        calls.append(query)
        return [{
            "title": "Earnings update" if "earnings" in query else f"{query} event",
            "url": "https://example.invalid/story-1",
            "publication_date": "2026-02-02T10:00:00+00:00",
            "source": "Example",
        }]

    monkeypatch.setattr(news, "_rss_search", fake_search)
    monkeypatch.setattr(news, "_resolve_url", lambda url: url)
    out = news.search_news.invoke({"query": "TCS", "deep": True})
    assert out["ok"] is True
    assert len(calls) == 6
    assert len(out["data"]["items"]) == 1
    assert out["data"]["deep"] is True


def test_article_metadata_date_is_preferred_over_http_date():
    from app.tools.news_tools import _extract_publication_date

    html = '<meta property="article:published_time" content="2026-03-04T12:30:00Z">'
    assert _extract_publication_date(html).startswith("2026-03-04T12:30:00")


def test_provider_failure_envelopes_never_ok_true():
    from app.tools.web_tools import fetch_page
    out = fetch_page.invoke({"url": "https://linkedin.com/company/tcs"})
    assert out["ok"] is False
    assert "forbidden" in out["error"].lower()
    assert out["source"]["provider"] == "httpx"


def test_valuation_missing_inputs_become_gaps():
    from app.tools.financial_tools import calculate_ratio
    # P/S without revenue.
    out = calculate_ratio.invoke({"name": "ps", "inputs": {"market_cap": 1e12}})
    assert out["ok"] is False
    # EV/EBITDA without EBITDA.
    out = calculate_ratio.invoke({"name": "ev_ebitda", "inputs": {"enterprise_value": 5.0}})
    assert out["ok"] is False
    # PEG without growth.
    out = calculate_ratio.invoke({"name": "peg", "inputs": {"price": 100.0, "eps": 5.0}})
    assert out["ok"] is False


def test_document_id_filtering():
    from app.rag.retriever import Retriever
    assert Retriever._matches_filters({"document_id": "a"}, {"document_ids": ["a"]}) is True
    assert Retriever._matches_filters({"document_id": "b"}, {"document_ids": ["a"]}) is False
    # Bare-string allowlist (LLMs often skip the list wrapper) must not nuke all hits.
    assert Retriever._matches_filters({"document_id": "a"}, {"document_ids": "a"}) is True
    assert Retriever._matches_filters({"company": "TCS"}, {"company": "TCS"}) is True
    assert Retriever._matches_filters({"company": "TCS"}, {"company": "INFY"}) is False


def test_document_ids_string_normalized():
    from app.tools.document_tools import _normalize_ids, search_documents
    assert _normalize_ids("doc_1") == ["doc_1"]
    assert _normalize_ids(["doc_1"]) == ["doc_1"]
    assert _normalize_ids(None) is None
    # CrewAI validates args first: a bare string fails fast so the model
    # retries with a proper list (far better than silently filtering all hits).
    with pytest.raises(ValueError):
        search_documents.invoke({"query": "anything", "document_ids": "doc_1"})


def test_null_string_args_become_missing():
    from app.tools.base import clean_str
    assert clean_str("null") is None
    assert clean_str("None") is None
    assert clean_str("") is None
    assert clean_str("TCS") == "TCS"
    # "null" filters must behave exactly like missing filters.
    from app.tools.document_tools import _search_documents
    plain = _search_documents("revenue", document_ids=["doc_audit_tcs"])
    nulled = _search_documents("revenue", company="null", doc_type="null",
                               period="null", document_ids=["doc_audit_tcs"])
    assert (nulled["data"]["chunks"] == plain["data"]["chunks"]
            and nulled["ok"] == plain["ok"])
    from app.tools.market_tools import _suffix
    assert _suffix("$TCS", "null") == "TCS.NS"
    assert _suffix("TCS", "NSE") == "TCS.NS"


def test_evidence_ids_and_finding_links():
    from app.schemas.models import AgentResult, EvidenceItem, Finding
    ev = EvidenceItem(claim="Revenue up", value=10, unit="%",
                      source_title="yfinance info TCS", retrieved_at="2026-01-01",
                      excerpt="rev", agent="financial", source_type="provider")
    assert ev.source_type == "provider"
    f = Finding(claim="Revenue up", evidence_ids=["ev_1"])
    assert f.evidence_ids == ["ev_1"]
    r = AgentResult(agent="financial", company="TCS", timestamp="2026-01-01",
                    findings=[{"claim": "Revenue up", "evidence_ids": ["ev_1"]}],
                    evidence=[ev])
    assert r.findings[0].evidence_ids == ["ev_1"]
    # Legacy strings still accepted, serialized back as strings when unlinked.
    legacy = AgentResult(agent="m", company="C", timestamp="t", findings=["plain"])
    assert legacy.findings[0].claim == "plain"
    assert legacy.model_dump()["findings"] == ["plain"]


def test_evidence_validation_source_types():
    from app.validation.pipeline import run_validation

    def item(**over):
        base = dict(claim="c", source_title="t", retrieved_at="2026-01-01",
                    excerpt="e", agent="a")
        base.update(over)
        return base

    # Trusted provider without URL passes (yfinance-style).
    results, _, _ = run_validation([item(source_title="yfinance quote TCS",
                                         source_type="provider")])
    assert results[0].passed is True
    # Generic title without URL fails.
    results, _, _ = run_validation([item(source_title="Exchange filing",
                                         source_type="provider")])
    assert results[0].passed is False
    # Deterministic calc without URL passes only with calc_inputs.
    results, _, _ = run_validation([item(source_title="calc",
                                         source_type="deterministic_calculation",
                                         calc_inputs={"price": 1})])
    assert results[0].passed is True
    results, _, _ = run_validation([item(source_title="calc",
                                         source_type="deterministic_calculation")])
    assert results[0].passed is False
    # Web without URL fails.
    results, _, _ = run_validation([item(source_title="page",
                                         source_type="web_page")])
    assert results[0].passed is False
    # Uploaded doc with id passes.
    results, _, _ = run_validation([item(source_title="Annual report",
                                         source_type="uploaded_document",
                                         document_id="doc1")])
    assert results[0].passed is True


def test_document_routing_policy():
    from app.graph.routing import enforce_policy
    from app.schemas.models import QueryAnalysis, ResearchPlan
    base_plan = ResearchPlan(steps=[], selected_agents=["market", "news"])
    # No docs -> no document agent for price_move.
    a = QueryAnalysis(entities=[], intent="price_move")
    assert "document" not in enforce_policy(a, base_plan)
    # Docs present -> document added.
    assert "document" in enforce_policy(a, base_plan, document_ids=["d1"])
    # Filing intent routes document even without uploads.
    doc_plan = ResearchPlan(steps=[], selected_agents=[])
    assert "document" in enforce_policy(
        QueryAnalysis(entities=[], intent="document"), doc_plan)


def test_peer_multiples_needs_peers_and_handles_missing():
    from app.tools.financial_tools import get_peer_multiples
    out = get_peer_multiples.invoke({"ticker": "TCS", "exchange": "NSE", "peers": []})
    assert out["ok"] is False and "peers" in out["error"].lower()


def test_historical_multiples_returns_points_or_gap(monkeypatch):
    from app.tools import financial_tools
    fake_hist = {"ok": True, "data": {"series": [
        {"date": "2026-01-01", "close": 100.0, "volume": 10},
        {"date": "2026-01-02", "close": 110.0, "volume": 12}]},
        "source": {}, "error": None}
    monkeypatch.setattr(financial_tools, "_get_company_metrics",
                        lambda *a, **k: {"ok": True, "data": {"eps_trailing": 5.0}})
    from app.tools import market_tools
    monkeypatch.setattr(market_tools, "get_price_history",
                        type("T", (), {"invoke": staticmethod(lambda *a, **k: fake_hist)})())
    out = financial_tools._get_historical_multiples("TCS")
    assert out["ok"] is True
    assert len(out["data"]["points"]) == 2
    assert out["data"]["points"][1]["pe"] == 22.0
    assert out["data"]["eps_is_point_in_time"] is True


def test_technicals_deterministic_math(monkeypatch):
    from app.tools import market_tools
    series = [{"date": f"2026-01-0{i}", "close": 100.0 + i, "volume": 10}
              for i in range(1, 6)]
    monkeypatch.setattr(market_tools, "_get_price_history",
                        lambda *a, **k: {"ok": True, "data": {"series": series}})
    out = market_tools._get_technicals("TCS", windows=[3])
    assert out["ok"] is True
    assert out["data"]["points"] == 5
    # Exact: last 3 closes 103,104,105.
    assert out["data"]["sma"]["sma_3"] == (103.0 + 104.0 + 105.0) / 3
    assert out["data"]["total_return"] == 105.0 / 101.0 - 1.0
    assert out["data"]["computation"].startswith("total_return=")


def test_price_history_returns_full_ohlcv(monkeypatch):
    import types
    import pandas as pd
    from app.tools import market_tools
    df = pd.DataFrame({"Open": [1.0], "High": [2.0], "Low": [0.5],
                       "Close": [1.5], "Volume": [100]},
                      index=pd.to_datetime(["2026-01-01"]))
    monkeypatch.setattr("yfinance.Ticker.history", lambda self, **k: df)
    # _suffix passes exchange through; use bare ticker to avoid suffix logic.
    out = market_tools._get_price_history("AAPL.", period="5d", exchange="")
    assert out["ok"] is True
    row = out["data"]["series"][0]
    assert row == {"date": "2026-01-01", "open": 1.0, "high": 2.0,
                   "low": 0.5, "close": 1.5, "volume": 100}


def test_news_web_wiring_where_required():
    from app.agents.specialists import AGENT_REGISTRY
    from app.graph.definitions import DEF_BY_NAME
    market_tools = {tool.name for tool in AGENT_REGISTRY["market"].tools}
    assert {"get_technicals", "search_news", "get_benchmark_history"} <= market_tools
    valuation_tools = {tool.name for tool in AGENT_REGISTRY["valuation"].tools}
    assert {"get_peer_multiples", "get_historical_multiples", "search_web"} <= valuation_tools
    growth_tools = {tool.name for tool in AGENT_REGISTRY["growth"].tools}
    assert "search_news" in growth_tools
    risk_tools = {tool.name for tool in AGENT_REGISTRY["risk"].tools}
    assert {"get_financials", "get_quote", "get_technicals"} <= risk_tools
    financial_tools = {tool.name for tool in AGENT_REGISTRY["financial"].tools}
    assert "get_quarterly_results" in financial_tools
    workforce_tools = {tool.name for tool in AGENT_REGISTRY["workforce"].tools}
    assert {"search_jobs", "fetch_job_detail"} <= workforce_tools
    for name in ("market", "valuation", "growth", "risk", "financial", "workforce"):
        canonical = {tool.name for tool in DEF_BY_NAME[name]["tools"]}
        mirrored = {tool.name for tool in AGENT_REGISTRY[name].tools}
        assert canonical == mirrored, name


def test_edgar_quarterly_parses_submissions(monkeypatch):
    from app.tools import filings_tools
    monkeypatch.setattr(filings_tools, "_ticker_to_cik", lambda ticker: "0000320193")
    import httpx

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"filings": {"recent": {
                "form": ["10-Q", "8-K"],
                "accessionNumber": ["0000320193-26-000044", "0000320193-26-000045"],
                "filingDate": ["2026-08-06", "2026-08-01"],
                "reportDate": ["2026-06-30", "2026-08-01"],
                "primaryDocument": ["aapl-10q.htm", "aapl-8k.htm"]}}}

    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp())
    out = filings_tools.get_edgar_quarterly.invoke({"ticker": "AAPL"})
    assert out["ok"] is True
    assert out["data"]["filings"][0]["form"] == "10-Q"
    assert out["data"]["filings"][0]["document_url"].startswith(
        "https://www.sec.gov/Archives/edgar/data/320193/")
    assert out["source"]["provider"] == "sec_edgar"


def test_nse_results_links_are_deterministic():
    from app.tools.filings_tools import get_nse_results
    out = get_nse_results.invoke({"ticker": "TCS"})
    assert out["ok"] is True
    urls = [link["url"] for link in out["data"]["links"]]
    assert any("symbol=TCS" in url for url in urls)
    assert any("bseindia" in url for url in urls)


def test_quarterly_bundle_never_invents_legs(monkeypatch):
    from app.tools import filings_tools, financial_tools, news_tools
    monkeypatch.setattr(financial_tools, "_get_financials",
                        lambda *a, **k: {"ok": False, "error": "down"})
    monkeypatch.setattr(filings_tools, "_get_edgar_quarterly",
                        lambda *a, **k: {"ok": False, "error": "down"})
    monkeypatch.setattr(news_tools, "_search_news",
                        lambda *a, **k: {"ok": True,
                                         "data": {"items": [{"title": "Q1 beat"}]}})
    out = filings_tools._get_quarterly_results("AAPL", exchange="NASDAQ")
    assert out["ok"] is True  # news leg carries the bundle
    assert any("statement" in gap for gap in out["data"]["gaps"])
    assert out["data"]["news"][0]["title"] == "Q1 beat"


def test_jobs_unregistered_board_is_gap_not_invention():
    from app.tools.jobs_tools import search_jobs, fetch_job_detail
    out = search_jobs.invoke({"company": "TCS-No-Board-XYZ"})
    assert out["ok"] is False
    assert out["data"]["jobs"] == []
    assert "ats_registry" in out["error"].lower()
    blocked = fetch_job_detail.invoke({"url": "https://linkedin.com/company/tcs"})
    assert blocked["ok"] is False and "forbidden" in blocked["error"].lower()


def test_jobs_greenhouse_board_normalizes(monkeypatch):
    import httpx
    from app.tools import jobs_tools
    monkeypatch.setattr(jobs_tools, "_registry",
                        lambda: {"acme": {"ats": "greenhouse", "slug": "acme"}})

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"jobs": [{"title": "Backend Eng", "location": {"name": "Remote"},
                              "departments": [{"name": "Engineering"}],
                              "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/1",
                              "updated_at": "2026-01-01"}]}

    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp())
    out = jobs_tools.search_jobs.invoke({"company": "Acme"})
    assert out["ok"] is True
    assert out["data"]["jobs"][0]["title"] == "Backend Eng"
    assert out["source"]["provider"] == "greenhouse"


def test_chunker_metadata_and_section():
    from app.rag.chunker import chunk_pages, validate_chunk
    import pytest as _pytest
    pages = [{"page": 1, "text": "RISK FACTORS\nSome risk text " * 50}]
    chunks = chunk_pages(pages, "doc_1", {"company": "TCS", "source": "ar.pdf",
                                          "publication_date": "2026-01-01"})
    assert chunks
    for chunk in chunks:
        validate_chunk(chunk)
        md = chunk["metadata"]
        assert md["document_id"] == "doc_1" and md["page"] == 1
        assert md["source"] == "ar.pdf"
        assert md["publication_date"] == "2026-01-01"
        assert md["section"] == "Risk Factors"
    with _pytest.raises(ValueError):
        validate_chunk({"chunk_id": "x", "text": "t", "metadata": {"page": 1}})


def test_agentrouter_provider_constructs_without_network(monkeypatch):
    from app.config import settings
    from app.graph import runner
    monkeypatch.setattr(settings, "model_provider", "agentrouter")
    monkeypatch.setattr(settings, "agentrouter_api_key", "sk-test-key")
    monkeypatch.setattr(settings, "agentrouter_model", "deepseek-v4-flash")
    monkeypatch.setattr(settings, "agentrouter_base_url", "https://agentrouter.org/v1")
    assert settings.effective_provider == "agentrouter"
    llm = runner.build_llm()
    # Specialist Crews run the tool-loop model; meta stages use the base model.
    assert "deepseek-v4-flash" in str(getattr(llm, "model", llm))
    assert settings.agentrouter_model == "deepseek-v4-flash"
    monkeypatch.setattr(settings, "agentrouter_api_key", "your-key")
    assert settings.effective_provider == "mock"


def test_market_symbol_and_period_normalization():
    from app.tools.market_tools import _suffix, _normalize_period, _VALID_PERIODS
    assert _suffix("^NSEI", "NSE") == "^NSEI"
    assert _suffix("^GSPC", "") == "^GSPC"
    assert _suffix("TCS", "NSE") == "TCS.NS"
    assert _suffix("TCS", "BSE") == "TCS.BO"
    assert _suffix("AAPL", "NASDAQ") == "AAPL"
    assert _normalize_period("1m") == "1mo"
    assert _normalize_period("1M") == "1mo"
    assert _normalize_period("6M") == "6mo"
    assert _normalize_period("bogus") == "bogus"  # downstream rejects it
    assert _normalize_period("") is None
    assert _normalize_period("null") is None


def test_invalid_period_returns_ok_false():
    from app.tools.market_tools import _get_price_history
    out = _get_price_history("TCS", period="bogus", exchange="NSE")
    assert out["ok"] is False and "invalid period" in out["error"]


def test_prompt_safe_strips_rss_redirect_urls():
    from app.graph.meta import _prompt_safe
    items = [
        {"claim": "a", "source_url": "https://news.google.com/rss/articles/CBMiXYZ?oc=5"},
        {"claim": "b", "source_url": "https://www.moneycontrol.com/news/x"},
        {"claim": "c", "source_url": None},
    ]
    safe = _prompt_safe(items)
    assert safe[0]["source_url"] is None
    assert safe[1]["source_url"].startswith("https://www.moneycontrol.com")
    assert safe[2]["source_url"] is None
    # Stored originals untouched (scrub is prompt-only).
    assert "news.google.com" in items[0]["source_url"]


def test_rss_url_resolver_falls_back_to_original(monkeypatch):
    import httpx
    from app.tools.news_tools import _resolve_url

    def boom(*a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr(httpx, "get", boom)
    link = "https://news.google.com/rss/articles/CBMiXYZ?oc=5"
    assert _resolve_url(link) == link
