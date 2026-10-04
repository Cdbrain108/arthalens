"""End-to-end pipeline + workflow tests (mock provider, offline-tolerant).

Covers the full HTTP job lifecycle, event → JobStatus translation (steps,
failed agents, per-agent node events), report/PDF persistence, stale-job
recovery, and CWD-independent configuration. Mock specialists may call real
data tools (yfinance/DDGS); agent failures are non-fatal by design, so these
tests assert structure and contract, not live data values.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def jobs(tmp_path, monkeypatch):
    from app.config import settings
    # Force the deterministic mock engine regardless of the developer's .env,
    # and isolate storage so tests never touch real job history or reports.
    monkeypatch.setattr(settings, "model_provider", "mock")
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(settings, "sqlite_path", str(tmp_path / "jobs.sqlite"))
    monkeypatch.setattr(settings, "reports_dir", str(tmp_path / "reports"))
    monkeypatch.setattr(settings, "faiss_index_dir", str(tmp_path / "faiss"))
    monkeypatch.setattr(settings, "documents_dir", str(tmp_path / "documents"))
    monkeypatch.setattr(settings, "agent_timeout_s", 15)
    from app.api import research_routes
    from app.storage.jobs import JobManager
    manager = JobManager()
    monkeypatch.setattr(research_routes, "jobs", manager)
    return manager


def test_full_research_lifecycle_over_http(jobs, offline_data_tools):
    from app.main import app
    with TestClient(app) as client:
        reply = client.post(
            "/api/research",
            json={"query": "Should I hold TCS for the next five years?"})
        assert reply.status_code == 202
        job_id = reply.json()["job_id"]
        assert reply.json()["status"] == "queued"

        deadline = time.time() + 180
        job = None
        while time.time() < deadline:
            job = client.get(f"/api/research/{job_id}/status").json()
            if job["status"] in ("succeeded", "failed"):
                break
            time.sleep(0.25)
        assert job is not None, "job never reached a terminal status"
        assert job["status"] == "succeeded", job["errors"]
        assert job["current_node"] == "done"

        # Routing policy minimums for a multi-year hold question.
        assert {"financial", "valuation", "market", "news", "risk", "growth"} \
            <= set(job["selected_agents"])

        # steps contract (API_SPEC.md): ordered node records, terminal states.
        assert job["steps"], "steps were never populated"
        assert all(set(s) >= {"node", "state", "at"} for s in job["steps"])
        assert any(s["node"] == "analyze_query" and s["state"] == "done"
                   for s in job["steps"])
        assert any(s["node"].endswith("_agent") for s in job["steps"])
        assert all(s["state"] in ("done", "failed", "partial", "unavailable") for s in job["steps"])

        report = client.get(f"/api/research/{job_id}/report").json()
        assert report["query"] == "Should I hold TCS for the next five years?"
        assert report["schema_version"] == "1.0"
        assert report["company"].get("ticker") == "TCS"

        pdf = client.get(f"/api/research/{job_id}/pdf")
        assert pdf.status_code == 200
        assert pdf.headers["content-type"].startswith("application/pdf")
        assert pdf.content.startswith(b"%PDF")

        history = client.get("/api/research/history").json()
        assert any(j["job_id"] == job_id for j in history)


def test_agent_failure_surfaces_in_job_status(jobs, monkeypatch):
    from app.api import research_routes
    from app.graph import runner

    async def fake_specialists(state, emit):
        for name in state.get("selected_agents", []):
            emit("node", f"{name}_agent")
        for name in state.get("selected_agents", []):
            if name == "market":
                failure = {"agent": name, "error": "boom (test)"}
                state["errors"].append(failure)
                state["failed_agents"].append(name)
                emit("agent_failed", failure)
            else:
                state["completed_agents"].append(name)
                emit("agent_done", name)

    monkeypatch.setattr(runner, "_run_specialists_mock", fake_specialists)
    query = "Why did TCS move today?"
    job_id = jobs.create(query)
    asyncio.run(research_routes._run_job(job_id, query, []))

    job = jobs.get(job_id)
    # A failed specialist is a disclosed gap, never a crashed run.
    assert job.status == "succeeded"
    assert job.failed_agents == ["market"]
    assert job.completed_agents == ["news"]
    assert {"node": "market_agent", "error": "boom (test)"} in job.errors
    assert any(s["node"] == "market_agent" and s["state"] == "failed"
               for s in job.steps)
    assert any(s["node"] == "news_agent" and s["state"] == "done"
               for s in job.steps)
    report = jobs.get_report(job_id)
    assert report and report["query"] == query


def test_stale_jobs_failed_on_startup(jobs):
    stuck = jobs.create("stuck job")
    status = jobs.get(stuck)
    status.status, status.current_node = "running", "create_plan"
    jobs.update(status)

    finished = jobs.create("finished job")
    status = jobs.get(finished)
    status.status = "succeeded"
    jobs.update(status)

    assert jobs.fail_stale_jobs("interrupted by server restart") == 1
    recovered = jobs.get(stuck)
    assert recovered.status == "failed"
    assert any("restart" in e["error"] for e in recovered.errors)
    assert jobs.get(finished).status == "succeeded"


def test_report_and_pdf_path_persistence(jobs, tmp_path):
    job_id = jobs.create("q")
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-test")

    assert jobs.attach_report(job_id, {"query": "q"}, str(pdf)) is True
    assert jobs.get_report(job_id) == {"query": "q"}
    assert jobs.get_pdf_path(job_id) == str(pdf)
    assert jobs.attach_report("research_missing", {"query": "q"}, None) is False
    assert jobs.get_report("research_missing") is None
    assert jobs.get_pdf_path("research_missing") is None


def test_report_context_persistence_and_offline_question_answer(jobs):
    from app.api.research_routes import _extractive_report_answer

    job_id = jobs.create("q")
    context = {
        "evidence": [{
            "claim": "Revenue grew 12 percent year over year",
            "excerpt": "Revenue grew 12 percent year over year",
            "source_title": "Annual report",
            "source_url": "https://example.invalid/report",
            "publication_date": "2026-01-01",
        }],
        "evidence_gaps": [],
    }
    assert jobs.attach_report(job_id, {
        "query": "q",
        "financial": {"summary": "Revenue grew 12 percent year over year"},
        "evidence_gaps": [],
    }, None, context) is True
    assert jobs.get_context(job_id) == context

    answer = _extractive_report_answer(
        "How did revenue change?", jobs.get_report(job_id), jobs.get_context(job_id))
    assert "12 percent" in answer.answer
    assert answer.sources[0]["title"] == "Annual report"


def test_route_contracts(jobs):
    from app.main import app
    with TestClient(app) as client:
        health = client.get("/api/health").json()
        assert health['status'] == 'ok' and health['service'] == 'bullseye'
        assert len(health['agents']) == 11
        assert health['provider_connectivity'] == 'not checked'
        assert client.post("/api/research", json={"query": "   "}).status_code == 400
        # Missing body field: FastAPI's standard 422 (client.js parses its detail list).
        assert client.post("/api/research", json={}).status_code == 422
        missing = "research_doesnotexist"
        assert client.get(f"/api/research/{missing}").status_code == 404
        assert client.get(f"/api/research/{missing}/status").status_code == 404
        assert client.get(f"/api/research/{missing}/report").status_code == 404
        assert client.get(f"/api/research/{missing}/pdf").status_code == 404
        assert client.get("/api/research/history").json() == []
        assert isinstance(client.get("/api/agents").json(), list)
        assert isinstance(client.get("/api/documents").json(), list)


def test_paths_and_env_are_cwd_independent():
    from app.config import BASE_DIR, settings
    assert (BASE_DIR / "backend" / "app").is_dir()
    for path in (settings.sqlite_path, settings.checkpoint_db,
                 settings.faiss_index_dir, settings.documents_dir,
                 settings.reports_dir):
        assert os.path.isabs(path), path
    assert settings.model_config["env_file"] == str(BASE_DIR / ".env")


def test_provider_fallback_and_placeholder_guard():
    from app.config import Settings, _usable_key
    assert _usable_key(None) is False
    assert _usable_key("   ") is False
    assert _usable_key("your-free-tier-key") is False
    assert _usable_key("AIzaSy-example") is True

    # _env_file=None isolates these from the developer's real .env
    assert Settings(_env_file=None, model_provider="gemini",
                    gemini_api_key="your-free-tier-key").effective_provider == "mock"
    assert Settings(_env_file=None, model_provider="gemini",
                    gemini_api_key="AIzaSy-example").effective_provider == "gemini"
    assert Settings(_env_file=None, model_provider="ollama").effective_provider == "ollama"
    assert Settings(_env_file=None,
                    model_provider="openrouter").effective_provider == "mock"
    assert Settings(_env_file=None, model_provider="openrouter",
                    openrouter_api_key="sk-or-v1-x").effective_provider == "openrouter"
    # the backup key alone is enough to enable the provider
    assert Settings(_env_file=None, model_provider="openrouter",
                    openrouter_api_key_backup="sk-or-v1-y").effective_provider == "openrouter"


def test_openrouter_keys_round_robin(monkeypatch):
    from app import llm
    from app.config import Settings
    monkeypatch.setattr(llm, "settings", Settings(
        _env_file=None, model_provider="openrouter",
        openrouter_api_key="sk-or-v1-a", openrouter_api_key_backup="sk-or-v1-b"))
    keys = llm.openrouter_keys()
    assert keys == ["sk-or-v1-a", "sk-or-v1-b"]
    picks = [llm.next_openrouter_key() for _ in range(4)]
    # round-robin (counter is process-global, so assert the cycle, not the start)
    assert all(picks[i + 1] == keys[(keys.index(picks[i]) + 1) % len(keys)]
               for i in range(len(picks) - 1))
    assert set(picks) == set(keys)

    # placeholders are filtered; the remaining usable key gets all requests
    monkeypatch.setattr(llm, "settings", Settings(
        _env_file=None, model_provider="openrouter",
        openrouter_api_key="your-key", openrouter_api_key_backup="sk-or-v1-b"))
    assert llm.openrouter_keys() == ["sk-or-v1-b"]
    assert llm.next_openrouter_key() == "sk-or-v1-b"


def test_gemini_keys_rotation_and_fallback(monkeypatch):
    from app import llm
    from app.config import Settings
    s = Settings(_env_file=None, model_provider="gemini", gemini_api_key="key-1",
                 gemini_backup_keys="key-2, key-3")
    monkeypatch.setattr(llm, "settings", s)
    keys = llm.gemini_keys()
    assert keys == ["key-1", "key-2", "key-3"]
    picks = [llm.next_gemini_key() for _ in range(6)]
    # round-robin (counter is process-global, so assert the cycle, not the start)
    assert all(picks[i + 1] == keys[(keys.index(picks[i]) + 1) % len(keys)]
               for i in range(len(picks) - 1))
    assert set(picks) == set(keys)

    # placeholder primary dropped; backup keys alone keep the provider live
    s2 = Settings(_env_file=None, model_provider="gemini",
                  gemini_api_key="your-key", gemini_backup_keys="key-2")
    assert s2.effective_provider == "gemini"
    assert s2.gemini_key_list == ["key-2"]
    # nothing usable -> mock
    s3 = Settings(_env_file=None, model_provider="gemini",
                  gemini_api_key="your-key", gemini_backup_keys="")
    assert s3.effective_provider == "mock"


def test_gemini_role_models(monkeypatch):
    pytest.importorskip("langchain_google_genai")
    from app import llm
    from app.config import Settings
    monkeypatch.setattr(llm, "settings", Settings(
        _env_file=None, model_provider="gemini", gemini_api_key="k",
        gemini_model="gemini-3.5-flash", gemini_model_fast="gemini-3.1-flash-lite"))
    assert llm.get_llm("analyzer").model == "gemini-3.1-flash-lite"  # FAST role
    assert llm.get_llm("specialist").model == "gemini-3.5-flash"
    assert llm.get_llm("synthesizer").model == "gemini-3.5-flash"
