"""ResearchState definition for LangGraph.

Central typed dictionary passed between all nodes in the research pipeline graph.
Every node receives a state snapshot and returns a dictionary with state updates.
"""
from __future__ import annotations

from typing import Any, Optional, TypedDict


class ResearchState(TypedDict, total=False):
    claim_coverage: dict
    # Initial query and session identifiers
    query: str
    job_id: str
    document_ids: list[str]
    mode: str

    # Query analysis and planning
    intent: Optional[str]
    entities: list[dict[str, Any]]
    time_horizon: Optional[str]
    compare_mode: bool
    research_plan: Optional[dict[str, Any]]
    selected_agents: list[str]

    # Specialist execution results
    agent_results: dict[str, Any]
    evidence: list[dict[str, Any]]
    evidence_gaps: list[str]
    completed_agents: list[str]
    failed_agents: list[str]
    agent_statuses: dict[str, str]
    errors: list[dict[str, Any]]

    # Evidence validation & Thesis challenge
    validation_results: list[dict[str, Any]]
    conflicts: list[dict[str, Any]]
    rejected_evidence: list[dict[str, Any]]
    bull_case: list[dict[str, Any]]
    bear_case: list[dict[str, Any]]
    risks: list[Any]
    what_could_change_view: list[str]

    # Final report & deliverable artifacts
    synthesis: Optional[dict[str, Any]]
    report: Optional[dict[str, Any]]
    pdf_path: Optional[str]

    # Runtime metadata & lifecycle
    current_node: str
    timestamps: dict[str, str]
