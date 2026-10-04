"""Agent definitions for LangGraph orchestration.

Direct registry mapping for specialist agents.
"""
from __future__ import annotations

from ..agents.specialists import AGENT_REGISTRY

_AGENT_ROLES = {
    "financial": ("Senior Financial Analyst", "Determine the company's fundamental health and multi-year trajectory from real statements."),
    "valuation": ("Valuation Specialist", "Assess fair value via historical and peer multiples; never invent ratios without present inputs."),
    "market": ("Market Action Specialist", "Report actual price, volume, benchmark and computed technical history."),
    "news": ("News & Catalyst Analyst", "Track verified corporate actions, earnings reports, management changes, and regulatory events."),
    "growth": ("Growth & Capex Analyst", "Analyze capital expenditures, capacity additions, expansion plans, and total addressable market."),
    "risk": ("Downside & Risk Analyst", "Identify downside vectors, debt maturities, customer concentration, and macro exposures."),
    "document": ("Filings & Document Specialist", "Retrieve and verify ground-truth disclosures from uploaded PDFs and regulatory submissions."),
    "industry": ("Industry & Sector Specialist", "Benchmark sector tailwinds, cyclical positioning, and competitive moats."),
    "workforce": ("Workforce & Talent Analyst", "Track hiring velocity, attrition, key personnel departures, and employee sentiment."),
}

AGENT_DEFS: list[dict] = [
    {
        "name": name,
        "role": _AGENT_ROLES.get(name, (f"{name.capitalize()} Specialist", ""))[0],
        "goal": _AGENT_ROLES.get(name, ("", f"Analyze {name}"))[1],
        "backstory": getattr(cls, "system_prompt", ""),
        "tools": getattr(cls, "tools", []),
    }
    for name, cls in AGENT_REGISTRY.items()
]

DEF_BY_NAME: dict[str, dict] = {d["name"]: d for d in AGENT_DEFS}
