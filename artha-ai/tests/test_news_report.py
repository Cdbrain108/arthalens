"""Offline regression tests for the focused news-only report."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.report import pdf as report_pdf
from app.report.schema import assemble_report
from app.schemas.models import ReportJSON


def _evidence():
    return {
        "evidence_id": "news-1",
        "claim": "Company wins a two-year public infrastructure contract.",
        "source_title": "Exchange News Wire",
        "source_url": "https://example.invalid/news-1",
        "publication_date": "2026-09-30",
        "retrieved_at": "2026-10-01T00:00:00+00:00",
        "excerpt": "Company wins a two-year public infrastructure contract.",
        "agent": "news",
        "source_type": "news_article",
    }


def _state(evidence):
    return {
        "intent": "news",
        "query": "What happened in the news?",
        "entities": [{"name": "Example Co", "ticker": "EX", "exchange": "NSE"}],
        "evidence": evidence,
        "evidence_gaps": [],
        "agent_results": {
            "news": {
                "findings": [{"claim": "Company wins a two-year public infrastructure contract.",
                              "evidence_ids": ["news-1"]}],
                "evidence": evidence,
                "sources": ["Exchange News Wire"],
            }
        },
        "selected_agents": ["news"],
        "timestamps": {},
    }


def test_news_report_uses_only_dated_validated_evidence_and_citations():
    report = assemble_report(
        {"query": "What happened in the news?", "financial": {"metrics": {"roe_pct": "25%"}},
         "overall_assessment": {"classification": "BUY", "quality_score": 9}},
        _state([_evidence()]),
    )

    assert report.overall_assessment["report_type"] == "news"
    assert report.overall_assessment["classification"] == "NEUTRAL"
    assert report.overall_assessment["quality_score"] is None
    assert report.overall_assessment["max_quality_score"] is None
    assert report.overall_assessment["quality_rating"] == "N/A"
    assert report.news["findings"][0]["publication_date"] == "2026-09-30"
    assert report.news["findings"][0]["citations"] == [1]
    assert report.sources[0]["url"] == "https://example.invalid/news-1"
    assert report.financial == {}
    assert report.valuation == {}
    assert report.market == {}
    assert not report.bull_case and not report.bear_case


def test_empty_news_report_discloses_retrieval_gap_without_equity_assessment():
    report = assemble_report({"query": "Latest news", "company": {"name": "Example Co"}},
                             _state([]))

    assert report.news["findings"] == []
    assert report.news["summary"] == "No validated news evidence was retrieved for this query."
    assert any("No validated news evidence" in gap for gap in report.evidence_gaps)
    assert report.overall_assessment["report_type"] == "news"
    assert report.overall_assessment["quality_score"] is None
    assert report.financial == {} and report.valuation == {} and report.market == {}


def test_news_pdf_text_contains_claim_sources_and_query_without_equity_metric_page(tmp_path):
    fitz = pytest.importorskip("fitz")
    pytest.importorskip("fpdf")
    report = assemble_report({"query": "What happened in the news?"}, _state([_evidence()]))
    html = report_pdf.render_html(report)
    assert "Validated News Brief" in html
    assert "Key Fundamental Multiples" not in html

    path = report_pdf._render_pdf_fallback(report, str(tmp_path / "news.pdf"))
    text = "\n".join(page.get_text() for page in fitz.open(path))
    assert "What happened in the news?" in text
    assert "Company wins a two-year public infrastructure contract." in text
    assert "https://example.invalid/news-1" in text
    assert "2026-09-30" in text
    assert "ROE" not in text
    assert "QUALITY SCORE" not in text
