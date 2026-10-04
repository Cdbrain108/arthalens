"""Tests never consume a developer's configured LLM or Tavily quota."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


@pytest.fixture(autouse=True)
def no_paid_providers(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "model_provider", "mock")
    monkeypatch.setattr(settings, "tavily_api_key", None)
