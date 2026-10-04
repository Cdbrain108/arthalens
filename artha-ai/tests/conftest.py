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


@pytest.fixture
def offline_data_tools(monkeypatch):
    """Explicit all-provider outage fixture for real graph/HTTP lifecycle tests."""
    from app.tools.base import NativeFunctionTool
    def unavailable(self, args):
        return {'ok': False, 'data': None, 'error': 'test provider unavailable', 'source': {'title': self.name}}
    monkeypatch.setattr(NativeFunctionTool, 'invoke', unavailable)
