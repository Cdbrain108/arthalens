"""LangGraph orchestration framework for Bullseye.

Provides a cyclical, deterministic, typed StateGraph for stock research.
"""
from __future__ import annotations

from .builder import build_research_graph
from .runner import run_research, run_flow, get_graph
from .state import ResearchState
from .definitions import AGENT_DEFS, DEF_BY_NAME

__all__ = [
    "build_research_graph",
    "run_research",
    "run_flow",
    "get_graph",
    "ResearchState",
    "AGENT_DEFS",
    "DEF_BY_NAME",
]
