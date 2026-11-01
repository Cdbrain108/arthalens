"""Scope determines coverage; concurrency limits execution, never selection."""
from ..agents.specialists import AGENT_REGISTRY
from ..schemas.models import QueryAnalysis, ResearchPlan

ALL_AGENTS = list(AGENT_REGISTRY)
BROAD_AGENTS = set(ALL_AGENTS) - {"social", "document"}
ROUTING_TABLE = {
    "conversational": {"min": set(), "never": set(ALL_AGENTS)},
    "price_move": {"min": {"market", "news"}, "never": set(ALL_AGENTS) - {"market", "news", "document"}},
    "long_term": {"min": BROAD_AGENTS, "never": set()},
    "compare": {"min": BROAD_AGENTS, "never": set()},
    "general": {"min": BROAD_AGENTS, "never": set()},
    "hiring": {"min": {"workforce", "news"}, "never": {"valuation", "social"}},
    "document": {"min": {"document", "financial", "risk"}, "never": {"social"}},
    "news": {"min": {"news"}, "never": set(ALL_AGENTS) - {"news"}},
}

AGENT_ALIASES = {
    "financial": {"financial", "financials", "finance", "accounting", "balance_sheet", "financialdata", "financialagent", "financialdataagent"},
    "valuation": {"valuation", "valuations", "dcf", "multiples", "pe", "valuationagent"},
    "market": {"market", "markets", "price", "pricing", "technical", "marketagent"},
    "news": {"news", "headlines", "catalysts", "events", "newsagent"},
    "growth": {"growth", "expansion", "growthagent"},
    "risk": {"risk", "risks", "downside", "threats", "riskagent"},
    "workforce": {"workforce", "hiring", "jobs", "careers", "talent", "headcount", "workforceagent", "hiringagent"},
    "social": {"social", "sentiment", "reddit", "twitter", "discussion", "socialagent"},
    "document": {"document", "filing", "filings", "10k", "10q", "annualreport", "documentagent"},
    "industry": {"industry", "sector", "competitors", "peers", "landscape", "industryagent"},
    "management": {"management", "governance", "leadership", "promoters", "managementagent"},
}


def normalize_agent(raw: str) -> str | None:
    """Map any agent title, alias, or class name back to canonical specialist key."""
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip().lower().replace("-", "_").replace(" ", "")
    if cleaned in AGENT_REGISTRY:
        return cleaned
    for canonical, aliases in AGENT_ALIASES.items():
        if cleaned in aliases or any(alias in cleaned for alias in aliases):
            return canonical
    return None


def enforce_policy(analysis: QueryAnalysis, plan: ResearchPlan, document_ids=None):
    if not analysis.entities and analysis.intent != 'document' and not document_ids:
        return []
    rule = ROUTING_TABLE.get(analysis.intent, ROUTING_TABLE['general'])
    normalized_plan = set()
    for a in (plan.selected_agents or []):
        norm = normalize_agent(a)
        if norm:
            normalized_plan.add(norm)
    selected = (normalized_plan | rule['min']) - rule['never']
    if analysis.intent not in ('conversational', 'news') and document_ids:
        selected.add('document')
    if not document_ids and analysis.intent != 'document':
        selected.discard('document')
    return [a for a in ALL_AGENTS if a in selected]
