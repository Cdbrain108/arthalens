"""Offline verification for every fix listed in fixes/00_PLAN.md.

    python fixes/verify_fixes.py          # from artha-ai/ (or anywhere)

Network-free and token-free by construction. `MODEL_PROVIDER=mock` is set
before the app is imported, which is what makes report assembly skip the live
quote path, and every check either parses source or drives the deterministic
report layer over a synthetic, already-validated state. Nothing here spends a
Tavily credit, an LLM token, or a rupee.

Exit code 0 = every check passed.
"""
from __future__ import annotations

import ast
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]        # artha-ai/
BACKEND = ROOT / "backend"

# Before any app import: Settings() is constructed at module import time, and
# `effective_provider == "mock"` is what keeps _live_metrics() off the network.
os.environ["MODEL_PROVIDER"] = "mock"
sys.path.insert(0, str(BACKEND))

NOW = datetime.now(timezone.utc).isoformat()
FAILED: list[str] = []
PASSED = 0


def check(name: str):
    """Run a check immediately on definition; record, never raise."""
    def wrap(fn):
        global PASSED
        try:
            detail = fn() or ""
            PASSED += 1
            print(f"  ok    {name}" + (f"  ({detail})" if detail else ""))
        except AssertionError as exc:
            FAILED.append(name)
            print(f"  FAIL  {name}\n          {exc}")
        except Exception as exc:                  # noqa: BLE001 - reported, not raised
            FAILED.append(name)
            print(f"  ERROR {name}\n          {type(exc).__name__}: {exc}")
        return fn
    return wrap


def source(rel: str) -> str:
    return (BACKEND / rel).read_text(encoding="utf-8")


# --------------------------------------------------------------------------
print("\n[1] Syntax and templates")

EDITED = [
    "app/config.py", "app/llm_mock.py", "app/schemas/models.py",
    "app/crew/routing.py", "app/crew/meta.py", "app/crew/runner.py",
    "app/crew/stages.py", "app/crew/agents/_base.py",
    "app/crew/agents/news/agent.py", "app/crew/agents/news/task.py",
    "app/agents/base.py", "app/tools/news_tools.py",
    "app/report/schema.py", "app/report/pdf.py",
]


@check("every edited module parses")
def _():
    for rel in EDITED:
        ast.parse(source(rel), filename=rel)
    return f"{len(EDITED)} modules"


@check("report.html.j2 parses, and agent notes precede the citation index")
def _():
    from jinja2 import Environment
    src = source("app/report/templates/report.html.j2")
    Environment().parse(src)
    notes_at = src.index("Specialist Agent Reasoning")
    sources_at = src.index("Sources &amp; Citations")
    assert notes_at < sources_at, "the agent section must come before Sources"
    assert "{{ f.claim }}" in src or "f.claim if f is mapping" in src, \
        "the specialist macro must print findings, not summaries alone"


# --------------------------------------------------------------------------
print("\n[2] Ask 1 - a news-only query is a single-lane run")


@check("news intent routes to exactly one agent")
def _():
    from app.crew.routing import enforce_policy
    from app.schemas.models import Entity, QueryAnalysis, ResearchPlan
    analysis = QueryAnalysis(entities=[Entity(name="Infosys", ticker="INFY.NS")],
                             intent="news")
    # The planner over-proposing is the realistic case; policy must still trim.
    plan = ResearchPlan(steps=[], selected_agents=["market", "news", "financial",
                                                   "valuation", "risk"])
    got = enforce_policy(analysis, plan)
    assert got == ["news"], got
    return "planner proposed 5, policy dispatched 1"


@check("an uploaded document still outranks the news exclusion")
def _():
    from app.crew.routing import enforce_policy
    from app.schemas.models import Entity, QueryAnalysis, ResearchPlan
    analysis = QueryAnalysis(entities=[Entity(name="Infosys")], intent="news")
    got = enforce_policy(analysis, ResearchPlan(steps=[], selected_agents=[]),
                         document_ids=["doc-1"])
    assert got == ["news", "document"], got


@check("other intents are untouched")
def _():
    from app.crew.routing import enforce_policy
    from app.schemas.models import Entity, QueryAnalysis, ResearchPlan
    analysis = QueryAnalysis(entities=[Entity(name="Infosys")], intent="general")
    got = enforce_policy(analysis, ResearchPlan(steps=[], selected_agents=[]))
    assert got == ["financial", "market", "news"], got


@check("mock mode agrees with live routing on news")
def _():
    from app.llm_mock import mock_analyze, mock_plan
    for query in ("what's the latest news on Infosys?",
                  "any updates on TCS",
                  "Reliance headlines today",
                  "recent developments at HDFC Bank",
                  "what happened at Reliance",
                  "any announcements from TCS"):
        intent = mock_analyze(query)["intent"]
        assert intent == "news", f"{query!r} -> {intent}"
    assert mock_plan("news")["selected_agents"] == ["news"]
    # A fundamentals question wearing the word "news" must stay fundamental.
    mixed = mock_analyze("is TCS a long-term buy after this news?")["intent"]
    assert mixed == "long_term", mixed
    return "6 phrasings, plus the mixed-intent guard"


# --------------------------------------------------------------------------
print("\n[3] Asks 2 and 3 - news depth and cross-agent redundancy")


@check("every specialist task carries the depth floor and the lane boundary")
def _():
    src = source("app/crew/agents/_base.py")
    for needle in ("DEPTH FLOOR", "STAY IN YOUR LANE", "REASONING FIELD",
                   '"reasoning"'):
        assert needle in src, f"missing: {needle}"


@check("the news agent's 3-vs-8 contradiction is gone")
def _():
    agent_src = source("app/crew/agents/news/agent.py")
    task_src = source("app/crew/agents/news/task.py")
    assert "8 dated evidence items" in agent_src, "backstory lost its minimum"
    assert "Minimum 8 evidence items" in task_src, "brief lost its minimum"
    for stale in ("Min 3", "at least 3 evidence", "minimum 3"):
        assert stale not in agent_src, f"backstory still says {stale!r}"
    assert "snippet" in agent_src and "snippet" in task_src, \
        "both must tell the agent a snippet is quotable without fetch_news"


# --------------------------------------------------------------------------
print("\n[4] Ask 5 - Tavily fires only when required")


@check("Tavily has exactly one call site, inside the thinness guard")
def _():
    src = source("app/tools/news_tools.py")
    tree = ast.parse(src)

    def calls(node, name):
        return [n for n in ast.walk(node) if isinstance(n, ast.Call)
                and getattr(n.func, "id", "") == name]

    sites = calls(tree, "_tavily_news")
    assert len(sites) == 1, f"{len(sites)} call sites; the gate only covers one"
    guarded = any(
        calls(node.test, "_should_top_up") and
        any(calls(stmt, "_tavily_news") for stmt in node.body)
        for node in ast.walk(tree) if isinstance(node, ast.If))
    assert guarded, "the Tavily call is not inside the _should_top_up guard"
    assert '"search_depth": "basic"' in src, "must stay on the 1-credit tier"
    assert '"include_raw_content": False' in src


@check("the thinness guard itself is correct")
def _():
    from app.tools import news_tools as nt
    enabled = nt.settings.tavily_enabled
    assert nt._should_top_up([]) == enabled, "empty RSS must top up when enabled"
    assert nt._should_top_up([{}] * 9) is False, "a full RSS page must never top up"
    assert nt._should_top_up([{}] * 1) == enabled
    return f"tavily_enabled={enabled}, floor={nt.settings.tavily_min_rss_items}"


@check("no API key is hardcoded in source")
def _():
    hits = []
    for path in list((BACKEND / "app").rglob("*.py")) + \
            list((ROOT / "frontend" / "src").rglob("*.js*")):
        if re.search(r"tvly-[A-Za-z0-9]", path.read_text(encoding="utf-8", errors="ignore")):
            hits.append(str(path.relative_to(ROOT)))
    assert not hits, f"key literal found in {hits}"


# --------------------------------------------------------------------------
print("\n[5] Ask 8 - latency")


@check("one pooled HTTP client, capped redirect resolution, cached searches")
def _():
    from app.tools import news_tools as nt
    src = source("app/tools/news_tools.py")
    assert src.count("httpx.Client(") == 1, "more than one client = more handshakes"
    assert nt._RESOLVE_LIMIT <= 16, nt._RESOLVE_LIMIT
    assert nt._CACHE_TTL_S >= 300, nt._CACHE_TTL_S
    assert '.stream("GET"' in src, "redirects must resolve on headers only"
    assert src.count("ThreadPoolExecutor") >= 2, "both RSS paths resolve concurrently"
    return f"resolve<={nt._RESOLVE_LIMIT}, cache={nt._CACHE_TTL_S}s"


@check("the news agent's iteration budget was trimmed")
def _():
    found = re.search(r"max_iter=(\d+)", source("app/crew/agents/news/agent.py"))
    assert found, "max_iter not set on the news agent"
    assert int(found.group(1)) <= 9, f"max_iter={found.group(1)}"
    return f"max_iter={found.group(1)}"


@check("the search cache returns the same envelope shape on a hit")
def _():
    from app.tools import news_tools as nt
    key = ("__verify__ cache shape", "", False)
    nt._cache_put(key, [{"title": "t", "url": "https://example.com/a",
                         "publication_date": NOW, "source": "Example",
                         "provider": "google_news_rss"}])
    out = nt._search_news("__verify__ cache shape")
    nt._cache.pop(key, None)
    assert out["ok"] and out["data"]["cached"] is True
    for field in ("items", "providers", "fallback_used", "cached"):
        assert field in out["data"], f"cache hit is missing {field}"
    return "no network reached"


# --------------------------------------------------------------------------
print("\n[6] Ask 4 - each agent's thought and findings, just before references")

# A synthetic state in exactly the shape crew/stages.py::build_report passes:
# evidence already validated, findings already grounded, one agent that failed.
EVIDENCE = [
    {"evidence_id": "ev_1",
     "claim": "Q1 FY26 revenue rose 7.8% YoY to INR 41,000 crore",
     "value": 41000.0, "unit": "INR crore",
     "source_title": "Infosys Q1 FY26 results press release",
     "source_url": "https://example.com/q1", "publication_date": "2026-07-16",
     "retrieved_at": NOW, "document_id": None, "page": None,
     "excerpt": "Revenue for the quarter stood at INR 41,000 crore, up 7.8%.",
     "agent": "news", "evidence_type": "primary", "claim_type": "fact",
     "confidence": "high", "source_type": "news_article"},
    {"evidence_id": "ev_2",
     "claim": "Board approved a USD 1.2bn buyback on 2026-08-04",
     "value": 1.2, "unit": "USD bn",
     "source_title": "Exchange filing - buyback approval",
     "source_url": "https://example.com/buyback", "publication_date": "2026-08-04",
     "retrieved_at": NOW, "document_id": None, "page": None,
     "excerpt": "The Board has approved a buyback of up to USD 1.2 billion.",
     "agent": "news", "evidence_type": "primary", "claim_type": "fact",
     "confidence": "high", "source_type": "news_article"},
]

REASONING = ("I ran six event angles and kept only the two that returned dated "
             "primary material; the contracts angle returned nothing verifiable, "
             "so I filed it as a gap rather than quoting a rumour.")

STATE = {
    "query": "latest news on Infosys",
    "intent": "news",
    "entities": [{"name": "Infosys Ltd", "ticker": "INFY.NS", "exchange": "NSE"}],
    "selected_agents": ["news", "market"],
    "completed_agents": ["news"],
    "failed_agents": ["market"],
    "errors": [{"agent": "market", "error": "provider timeout after 240s"}],
    "agent_results": {
        "news": {
            "agent": "news", "company": "Infosys Ltd", "timestamp": NOW,
            "reasoning": REASONING,
            "findings": [
                {"claim": "Q1 FY26 revenue rose 7.8% YoY to INR 41,000 crore",
                 "evidence_ids": ["ev_1"]},
                {"claim": "Board approved a USD 1.2bn buyback on 2026-08-04",
                 "evidence_ids": ["ev_2"]},
            ],
            "positive_signals": [{"claim": "Buyback signals balance-sheet comfort",
                                  "evidence_ids": ["ev_2"]}],
            "negative_signals": [],
            "risks": [{"claim": "Growth is concentrated in one vertical",
                       "evidence_ids": ["ev_1"]}],
            "evidence": EVIDENCE,
            "sources": ["Infosys Q1 FY26 results press release",
                        "Exchange filing - buyback approval"],
            "confidence": "high",
            "data_gaps": ["no verifiable contract-win disclosure this quarter"],
        },
    },
    "evidence": EVIDENCE,
    "evidence_gaps": [],
    "bull_case": ["Buyback plus revenue growth"],
    "bear_case": ["Single-vertical concentration"],
    "what_could_change_view": ["A downgrade to FY26 guidance"],
    "timestamps": {"build_report": NOW},
}

REPORT_IN = {
    "query": STATE["query"],
    "company": {"name": "Infosys Ltd", "ticker": "INFY.NS", "exchange": "NSE"},
    "executive_summary": "Two dated events carried this run.",
    "news": {"summary": "Results and a buyback.", "findings": []},
}


def assembled():
    from app.report.schema import assemble_report
    return assemble_report(dict(REPORT_IN), STATE)


@check("agent_notes is built, in routing order, with the failed agent kept")
def _():
    report = assembled()
    order = [n["agent"] for n in report.agent_notes]
    assert order == ["news", "market"], order
    news, market = report.agent_notes
    assert news["status"] == "completed" and news["self_reported"] is True
    assert news["thought"] == REASONING, "the agent's own words must survive"
    assert news["label"] == "News Agent" and news["mandate"]
    assert news["evidence_count"] == 2 and len(news["findings"]) == 2
    assert market["status"] == "failed", market["status"]
    assert "provider timeout" in market["thought"], "the failure must be disclosed"
    return "2 notes: 1 completed, 1 failed"


@check("agent citations resolve into the same index as the bibliography")
def _():
    report = assembled()
    numbers = {s["n"] for s in report.sources}
    assert numbers == {1, 2}, numbers
    news = report.agent_notes[0]
    cited = [c for f in news["findings"] for c in f["citations"]]
    assert cited == [1, 2], cited
    assert news["risks"][0]["citations"] == [1]
    assert news["positive_signals"][0]["citations"] == [2]
    for group in ("findings", "risks", "positive_signals"):
        for item in news[group]:
            assert set(item["citations"]) <= numbers, item
    return "[1] and [2] mean the same source in both sections"


@check("a bare-string finding still resolves to its evidence number")
def _():
    # What validate_evidence() produces for legacy/mock agents: the claim text
    # projected off accepted evidence, with no evidence_ids attached.
    state = {**STATE, "agent_results": {"news": {
        **STATE["agent_results"]["news"],
        "reasoning": "",
        "findings": [e["claim"] for e in EVIDENCE],
    }}}
    from app.report.schema import assemble_report
    report = assemble_report(dict(REPORT_IN), state)
    news = report.agent_notes[0]
    assert news["self_reported"] is False
    assert news["thought"].startswith("No method note was returned"), news["thought"]
    cited = [c for f in news["findings"] for c in f["citations"]]
    assert cited == [1, 2], cited
    return "claim-text match, no guessed citations"


@check("the HTML report prints the section immediately before Sources")
def _():
    from app.report.pdf import render_html
    html = render_html(assembled())
    notes_at = html.index("Specialist Agent Reasoning")
    sources_at = html.index("Sources &amp; Citations")
    assert notes_at < sources_at
    # Only <h3> agent cards may sit between the two headings.
    assert "<h2>" not in html[notes_at:sources_at], \
        "another section slipped between the agent notes and the references"
    assert REASONING[:40] in html, "the thought is missing from the render"
    assert "provider timeout" in html, "the failed agent is missing"
    assert 'class="cite">[1]' in html, "citation markers are missing"
    return f"{len(html)} bytes"


# A second fixture whose findings actually *state* the six ratios, so
# _resolve_metrics() can measure them. Without this the ratios table comes back
# empty in mock mode and every assertion about its columns iterates zero rows —
# the grid, the KPI cards and the quality checklist all go untested.
METRIC_PROSE = {
    "summary": ("FY26 profitability held up: ROE of 31.8% on an operating margin "
                "of 21.1%."),
    "findings": [
        "Net profit margin of 17.3% for the trailing twelve months.",
        "Balance sheet carries a debt-to-equity of 0.09 after the buyback.",
        "The stock trades +3.4% vs 50-day SMA.",
        "Shares change hands at a P/E of 24.6.",
    ],
}


def assembled_measured():
    from app.report.schema import assemble_report
    return assemble_report({**REPORT_IN, "financial": dict(METRIC_PROSE)}, STATE)


@check("the ratios table reads the keys the schema actually emits")
def _():
    pdf_src = source("app/report/pdf.py")
    assert 'row.get("sector"' in pdf_src and 'row.get("assessment"' in pdf_src
    for stale in ('row.get("benchmark"', 'row.get("posture"'):
        assert stale not in pdf_src, f"{stale} was the blank-column bug"
    tpl = source("app/report/templates/report.html.j2")
    assert "row.sector" in tpl and "row.assessment" in tpl, \
        "the HTML template must read the same keys as the PDF"

    rows = assembled_measured().financial.get("ratios_table") or []
    assert [r["metric"] for r in rows] == [
        "ROE (return on equity)", "Operating margin", "Net profit margin",
        "Debt / equity", "Price vs 50-day SMA"], [r["metric"] for r in rows]
    for row in rows:
        assert set(row) >= {"metric", "reported", "sector", "delta", "assessment"}, row
        assert str(row["sector"]).strip(), f"blank benchmark: {row}"
        assert str(row["assessment"]).strip(), f"blank assessment: {row}"
    # Exact values, so a benchmark or a formatter silently changing is caught.
    by_metric = {r["metric"]: r for r in rows}
    roe = by_metric["ROE (return on equity)"]
    assert (roe["reported"], roe["sector"], roe["delta"], roe["assessment"]) == \
        ("31.8%", "25.0%", "+6.8pp", "Above sector"), roe
    de = by_metric["Debt / equity"]
    assert (de["reported"], de["sector"], de["assessment"]) == \
        ("0.09x", "0.50x", "Net cash / minimal leverage"), de
    sma = by_metric["Price vs 50-day SMA"]
    assert (sma["reported"], sma["delta"], sma["assessment"]) == \
        ("+3.4%", "--", "Consolidation"), sma
    # And the grid actually reaches the rendered page, not just the model.
    from app.report.pdf import render_html
    html = render_html(assembled_measured())
    for cell in ("31.8%", "25.0%", "+6.8pp", "Above sector",
                 "Net cash / minimal leverage"):
        assert cell in html, f"{cell!r} never made it into the HTML"
    return f"{len(rows)} rows, every column populated and rendered"


@check("an unmeasured ratio is omitted and disclosed, never filled")
def _():
    # The same state with no ratio prose: the rule is 'disclose the gap', so the
    # table must be empty *and* every missing metric must be named in the gaps.
    plain = assembled()
    assert (plain.financial.get("ratios_table") or []) == [], \
        "a ratio was invented from nothing"
    assert all(v is None for v in plain.financial["metrics"].values()), \
        plain.financial["metrics"]
    gap = [g for g in plain.evidence_gaps if g.startswith("Key ratio not established")]
    assert gap, f"no ratio gap disclosed: {plain.evidence_gaps}"
    for label in ("return on equity", "operating margin", "P/E ratio",
                  "price vs 50-day SMA"):
        assert label in gap[0], f"{label} missing from the disclosure"
    # ...and with the prose present, no ratio gap is raised at all.
    measured = assembled_measured()
    assert not [g for g in measured.evidence_gaps
                if g.startswith("Key ratio not established")], measured.evidence_gaps
    return "0 rows, 6 metrics named in the gap"


@check("the quality score is a measurement, not a flattering constant")
def _():
    oa = assembled_measured().overall_assessment
    checklist = oa["quality_checklist"]
    assert len(checklist) == 9 and oa["max_quality_score"] == 9
    failed = {c["criterion"] for c in checklist if not c["passed"]}
    # Exactly the two that genuinely cannot pass on this fixture: only two
    # evidence items, and no grounded valuation section.
    assert failed == {">= 2 independent sources per major claim",
                      "Verified valuation multiples available"}, failed
    assert oa["quality_score"] == 7, oa["quality_score"]
    assert oa["quality_rating"] == "7 / 9 - Strong", oa["quality_rating"]
    for item in checklist:
        assert str(item["basis"]).strip(), item
    # The unmeasured run must fail closed rather than scoring itself well.
    assert assembled().overall_assessment["quality_score"] == 2, \
        assembled().overall_assessment["quality_score"]
    return "7/9 measured, 2/9 unmeasured - both derived, neither invented"


@check("no ratios-grid cell overflows its column")
def _():
    # fpdf2's cell() does not clip — text wider than the column is drawn over
    # the border and into the next one, which is how the Assessment column used
    # to bleed. Measured with fpdf2's own metrics, not estimated.
    from fpdf import FPDF

    from app.report.schema import SECTOR_BENCHMARKS, _assess

    probe = FPDF(format="A4")
    probe.set_font("Helvetica", "", 8)
    probe.add_page()
    page_w = probe.epw
    # Read the real column shares out of pdf.py so this cannot drift from it.
    # `\b` keeps it off `audit_col_w` and `c_col_w`.
    spec = re.search(r"\bcol_w = \[(.*?)\]", source("app/report/pdf.py"), re.S)
    assert spec, "the ratios grid no longer declares col_w"
    shares = [float(x) for x in re.findall(r"page_w \* ([\d.]+)", spec.group(1))]
    assert len(shares) == 5, shares
    col_w = [page_w * s for s in shares]
    assert abs(sum(col_w) - page_w) < 0.01, f"columns sum to {sum(col_w)}, not {page_w}"

    # Every verdict _assess() can emit, at the size the grid prints it.
    verdicts = {"Measured", "Consolidation", "Bullish", "Support test"}
    for metric, bench in SECTOR_BENCHMARKS.items():
        for factor in (0.1, 0.5, 0.9, 1.0, 1.5):
            verdicts.add(_assess(metric, bench * factor))
    assert "Net cash / minimal leverage" in verdicts, "longest verdict not covered"
    for text in sorted(verdicts):
        probe.set_font("Helvetica", "B", 6.5 if len(text) > 22 else 7.5)
        width = probe.get_string_width(text)
        assert width <= col_w[4] - 1, \
            f"assessment {text!r} is {width:.1f}mm in a {col_w[4]:.1f}mm column"

    probe.set_font("Helvetica", "", 8)
    for text in ("ROE (return on equity)", "Operating margin", "Net profit margin",
                 "Debt / equity", "Price vs 50-day SMA"):
        width = probe.get_string_width(text)
        assert width <= col_w[0] - 2, \
            f"metric {text!r} is {width:.1f}mm in a {col_w[0]:.1f}mm column"

    probe.set_font("Helvetica", "B", 7.5)
    for idx, text in enumerate(("Metric / Operational Factor", "Reported Value",
                                "Sector Benchmark", "Delta", "Assessment")):
        width = probe.get_string_width(text)
        assert width <= col_w[idx] - 1, \
            f"header {text!r} is {width:.1f}mm in a {col_w[idx]:.1f}mm column"
    return f"{len(verdicts)} verdicts + 5 metrics + 5 headers all inside their columns"


@check("the PDF renders, agent section included")
def _():
    from app.report.pdf import render_pdf
    pdf_src = source("app/report/pdf.py")
    notes_at = pdf_src.index("Specialist Agent Reasoning")
    sources_at = pdf_src.index("Sources & Evidence Table")
    assert notes_at < sources_at, "the PDF section order is wrong"
    path = render_pdf(assembled(), "verify_fixes_smoke")
    size = os.path.getsize(path)
    assert size > 5_000, f"only {size} bytes - the render probably bailed early"
    return f"{Path(path).name}, {size // 1024} KB"


@check("the PDF renders the ratios grid and the KPI cards")
def _():
    # The ratio grid and the ROE card are only reachable when a metric was
    # measured, so this is the one render that exercises pdf.py's table block.
    from app.report.pdf import render_pdf
    report = assembled_measured()
    assert report.financial["ratios_table"], "fixture regressed - nothing to render"
    size = os.path.getsize(render_pdf(report, "verify_fixes_measured"))
    plain = os.path.getsize(render_pdf(assembled(), "verify_fixes_plain"))
    assert size > 5_000, f"only {size} bytes"
    assert size > plain, ("the measured report is not larger than the empty one - "
                          f"{size} vs {plain}, the grid probably did not render")
    return f"{size // 1024} KB vs {plain // 1024} KB without ratios"


@check("a chart failure degrades the PDF, it does not destroy it")
def _():
    # The live Windows path is the fpdf2 fallback, and it used to call
    # generate_report_charts() unguarded: one matplotlib error lost the whole
    # PDF. Forcing that error is the only way to prove the guard. A stub module
    # is injected rather than the real one patched, so this runs with or without
    # matplotlib installed.
    import types

    import app.report as report_pkg
    from app.config import settings as cfg
    from app.report.pdf import _render_pdf_fallback

    def explode(*_a, **_kw):
        raise RuntimeError("synthetic matplotlib failure")

    stub = types.ModuleType("app.report.charts")
    stub.generate_report_charts = explode
    prev_mod = sys.modules.get("app.report.charts")
    prev_attr = getattr(report_pkg, "charts", None)
    sys.modules["app.report.charts"] = stub
    report_pkg.charts = stub
    try:
        os.makedirs(cfg.reports_dir, exist_ok=True)
        path = _render_pdf_fallback(
            assembled_measured(),
            os.path.join(cfg.reports_dir, "verify_fixes_nocharts.pdf"))
    finally:
        if prev_mod is not None:
            sys.modules["app.report.charts"] = prev_mod
        else:
            sys.modules.pop("app.report.charts", None)
        if prev_attr is not None:
            report_pkg.charts = prev_attr
        elif hasattr(report_pkg, "charts"):
            del report_pkg.charts
    size = os.path.getsize(path)
    assert size > 5_000, f"only {size} bytes - the guard did not hold"
    # The grid must still be there; only the images are gone.
    assert assembled_measured().financial["ratios_table"], "fixture regressed"
    return f"chart-less PDF still produced, {size // 1024} KB"


# --------------------------------------------------------------------------
print("\n[7] Ask 4 - the in-app view")


@check("the Agent Reasoning tab sits directly before Sources")
def _():
    src = (ROOT / "frontend/src/components/ReportPreview.jsx").read_text(encoding="utf-8")
    log_at = src.index("id: 'agent_log'")
    sources_at = src.index("id: 'sources'")
    assert log_at < sources_at, "the tab must precede Sources"
    assert src.count("id: '", log_at, sources_at) == 1, \
        "another tab slipped between Agent Reasoning and Sources"
    for needle in ("report.agent_notes", "activeTab === 'agent_log' && agentLogTab",
                   "const agentLogTab", "self_reported", "<CitedText"):
        assert needle in src, f"missing: {needle}"


# --------------------------------------------------------------------------
print("\n[8] Ask 3 - per-agent calibration")

# agent -> (evidence floor, max_iter). The floor is what each provider can
# realistically return for that mandate; max_iter tracks how much the agent's
# tools give back per call, not a uniform guess.
CALIBRATION = {
    "news":      (8, 9),
    "financial": (6, 10),
    "valuation": (5, 12),
    "market":    (6, 8),
    "growth":    (5, 10),
    "risk":      (6, 12),
    "workforce": (4, 9),
    "social":    (3, 6),
    "document":  (5, 8),
}
_FLOOR_RE = re.compile(r"(?:minimum|at least)\s+(\d+)\s+(?:dated\s+)?evidence items",
                       re.IGNORECASE)


def _agent_strings(agent: str) -> dict:
    """Module-level string constants + max_iter, read statically (no crewai import)."""
    out = {}
    for fname in ("agent.py", "task.py"):
        tree = ast.parse(source(f"app/crew/agents/{agent}/{fname}"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) \
                    and isinstance(node.value.value, str):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Name):
                        out[tgt.id] = node.value.value
            if isinstance(node, ast.keyword) and node.arg == "max_iter":
                out["max_iter"] = node.value.value
    return out


@check("every specialist declares an evidence floor, and agent.py agrees with task.py")
def _():
    seen = {}
    for agent, (floor, _) in CALIBRATION.items():
        s = _agent_strings(agent)
        in_agent = _FLOOR_RE.search(s["BACKSTORY"])
        in_task = _FLOOR_RE.search(s["DESCRIPTION_TEMPLATE"])
        assert in_agent, f"{agent}/agent.py states no evidence floor"
        assert in_task, f"{agent}/task.py states no evidence floor"
        a, t = int(in_agent.group(1)), int(in_task.group(1))
        # This is the exact class of bug that made news shallow: the backstory
        # said 3 while the brief said 8, and the model took the cheaper number.
        assert a == t == floor, f"{agent}: backstory {a} vs brief {t}, expected {floor}"
        # The expected-output contract must not undercut the brief either.
        eo = _FLOOR_RE.search(s["EXPECTED_OUTPUT"])
        assert eo and int(eo.group(1)) == floor, \
            f"{agent}: EXPECTED_OUTPUT floor is {eo and eo.group(1)}, expected {floor}"
        seen[agent] = floor
    return f"9 agents, floors {sorted(set(seen.values()))}, all three statements agree"


@check("max_iter is calibrated per agent, not a uniform 12")
def _():
    got = {}
    for agent, (_, want) in CALIBRATION.items():
        got[agent] = _agent_strings(agent)["max_iter"]
        assert got[agent] == want, f"{agent}: max_iter {got[agent]}, expected {want}"
    assert len(set(got.values())) >= 4, f"still near-uniform: {got}"
    # social holds one tool; risk holds eight. The budget must reflect that.
    assert got["social"] < got["risk"], "a 1-tool agent may not out-spend an 8-tool agent"
    return f"{len(set(got.values()))} distinct budgets, {min(got.values())}-{max(got.values())}"


@check("every specialist brief carries an explicit tool/search protocol")
def _():
    markers = ("TOOL PROTOCOL", "SEARCH PROTOCOL", "MANDATORY TOOL USE")
    for agent in CALIBRATION:
        brief = _agent_strings(agent)["DESCRIPTION_TEMPLATE"]
        assert any(m in brief for m in markers), f"{agent}/task.py has no protocol clause"
    return "9 agents, all with a named protocol"


# --------------------------------------------------------------------------
total = PASSED + len(FAILED)
print(f"\n{'-' * 62}\n{PASSED}/{total} checks passed.")
if FAILED:
    print("failed:")
    for name in FAILED:
        print(f"  - {name}")
sys.exit(1 if FAILED else 0)
