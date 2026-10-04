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


def enforce_policy(analysis: QueryAnalysis, plan: ResearchPlan, document_ids=None):
    rule = ROUTING_TABLE.get(analysis.intent, ROUTING_TABLE['general'])
    selected = ({a for a in plan.selected_agents if a in AGENT_REGISTRY} | rule['min']) - rule['never']
    if analysis.intent not in ('conversational', 'news') and document_ids:
        selected.add('document')
    if not document_ids and analysis.intent != 'document':
        selected.discard('document')
    return [a for a in ALL_AGENTS if a in selected]
