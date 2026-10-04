"""Offline tests for deterministic news retrieval and evidence linking."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.graph import news
from app.graph import specialists
from app.graph.stages import validate_evidence


def _state(query="latest news about Tata"):
    return {
        "query": query,
        "entities": [{"name": "Tata"}],
        "time_horizon": None,
    }


def test_news_keeps_dated_headlines_and_links_findings(monkeypatch):
    now = datetime.now(timezone.utc)
    retrieved = (now - timedelta(minutes=1)).isoformat()
    publication = (now - timedelta(days=2)).isoformat()
    calls = []

    def search(payload):
        calls.append(payload)
        return {
            "ok": True,
            "data": {"items": [
                {"title": "Tata announces a new project", "url": "https://publisher.test/a",
                 "source": "Publisher A", "publication_date": publication,
                 "snippet": "The publisher's short RSS snippet."},
            ]},
            "source": {"title": "Google News RSS", "retrieved_at": retrieved},
            "error": None,
        }

    monkeypatch.setattr(news.news_tools, "search_news", SimpleNamespace(invoke=search))
    result = news.run_news_specialist(_state())

    assert len(result.evidence) == 1
    item = result.evidence[0]
    assert item.source_url == "https://publisher.test/a"
    assert item.source_title == "Publisher A"
    assert item.publication_date == datetime.fromisoformat(publication).isoformat()
    assert item.retrieved_at == datetime.fromisoformat(retrieved).isoformat()
    assert item.claim.startswith("Publisher reports:")
    assert item.evidence_id
    assert result.findings[0].evidence_ids == [item.evidence_id]
    assert calls[0]["deep"] is True
    assert "Tata group" in calls[0]["query"]

    state = {**_state(), "agent_results": {"news": result.model_dump()},
             "evidence": [item.model_dump()], "evidence_gaps": []}
    validated = validate_evidence(state)
    assert len(validated["evidence"]) == 1
    assert validated["agent_results"]["news"]["findings"][0]["evidence_ids"] == [item.evidence_id]


def test_news_excludes_undated_future_and_does_not_fetch_bodies(monkeypatch):
    now = datetime.now(timezone.utc)
    calls = []

    def search(payload):
        calls.append(payload)
        return {"ok": True, "data": {"items": [
            {"title": "No date", "url": "https://publisher.test/undated"},
            {"title": "Future story", "url": "https://publisher.test/future",
             "publication_date": (now + timedelta(days=1)).isoformat()},
        ]}, "source": {"title": "Google News RSS"}, "error": None}

    monkeypatch.setattr(news.news_tools, "search_news", SimpleNamespace(invoke=search))
    result = news.run_news_specialist(_state())
    assert result.evidence == []
    assert any("undated=1" in gap and "future=1" in gap for gap in result.data_gaps)
    assert any("No dated, non-future" in gap for gap in result.data_gaps)
    assert calls and calls[0]["since"]


def test_execute_news_precedes_mock_mode(monkeypatch):
    expected = news.run_news_specialist(_state())
    monkeypatch.setattr(specialists, "is_mock", lambda: True)
    monkeypatch.setattr(news, "run_news_specialist", lambda state: expected)
    monkeypatch.setattr(specialists, "run_specialist_mock", lambda *args: (_ for _ in ()).throw(
        AssertionError("news must not use the generic mock runner")))
    assert specialists.execute_specialist("news", _state()) is expected
