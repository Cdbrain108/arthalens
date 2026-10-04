"""Backward compatibility re-export for LangGraph builder.

All primary graph assembly now lives in `app.graph.workflow`.
"""
from .workflow import build_research_graph, get_graph

__all__ = ["build_research_graph", "get_graph"]
