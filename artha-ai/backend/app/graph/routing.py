"""Routing policy — the deterministic guardrail around the LLM planner.

The planner proposes; this policy enforces per-intent minimums,
exclusions, and the global concurrency cap so the model never under- or
over-routes.
"""
from __future__ import annotations

from ..schemas.models import QueryAnalysis, ResearchPlan

ALL_AGENTS = [
    "financial", "valuation", "market", "news",
    "growth", "risk", "workforce", "social", "document",
]

ROUTING_TABLE: dict[str, dict] = {
    "conversational": {"min": set(), "never": set(ALL_AGENTS)},
    "price_move": {"min": {"market", "news"},
                   "never": {"valuation", "growth", "workforce", "social"}},
    "long_term":  {"min": {"financial", "valuation", "market", "news", "growth", "risk"},
                   "never": {"workforce", "social"}},
    "hiring":     {"min": {"workforce", "news"},
                   "never": {"valuation", "social"}},
    "compare":    {"min": {"financial", "valuation", "market", "risk"},
                   "never": {"workforce", "social"}},
    "document":   {"min": {"document", "financial", "risk"},
                   "never": {"social"}},
    "news":       {"min": {"news"},
                   "never": set(ALL_AGENTS) - {"news"}},
    "general":    {"min": {"market", "news", "financial"}, "never": set()},
}

MAX_AGENTS = 6  # raised to 8 automatically in compare mode


def enforce_policy(analysis: QueryAnalysis, plan: ResearchPlan,
                   document_ids: list[str] | None = None) -> list[str]:
    """Return the final, policy-compliant agent list (the routing decision)."""
    rule = ROUTING_TABLE.get(analysis.intent, ROUTING_TABLE["general"])
    selected = {a for a in plan.selected_agents if a in ALL_AGENTS}
    required = set(rule["min"])
    never = set(rule["never"]) - ({"document"} if document_ids else set())
    if analysis.intent == "long_term" and analysis.time_horizon:
        required.add("growth")
    if document_ids:
        required.add("document")
    required -= never
    selected |= required
    selected -= never
    cap = 8 if analysis.compare_mode else MAX_AGENTS

    if len(required) > cap:
        tail = [a for a in ALL_AGENTS if a != "document"]
        priority = ["document"] + tail if document_ids else tail + ["document"]
        required = set(sorted(required, key=priority.index)[:cap])

    optional = [a for a in ALL_AGENTS if a in selected and a not in required]
    selected = required | set(optional[:max(0, cap - len(required))])
    return [a for a in ALL_AGENTS if a in selected]
