"""Specialist agents registry for LangGraph orchestration.

Canonical agent identity, prompts, and tools for the 9 specialist agents.
Used across both deterministic mock mode and live LLM tool-calling execution.
"""
from .base import BaseSpecialistAgent
from ..tools import (market_tools, financial_tools, news_tools, web_tools,
                     document_tools, jobs_tools)


class FinancialAgent(BaseSpecialistAgent):
    name = "financial"
    tools = [financial_tools.get_financials, financial_tools.get_company_metrics,
             financial_tools.calculate_ratio, financial_tools.compute_growth]
    system_prompt = (
        "You are Bulls Eye's Financial Agent. Analyze revenue, profit, margins, EPS, "
        "free cash flow, debt, ROE/ROCE and multi-year trends. State the fiscal basis "
        "(consolidated vs standalone). NEVER compute ratios yourself — call "
        "calculate_ratio. Attach evidence to every numeric claim. Min 4 evidence items."
    )


class ValuationAgent(BaseSpecialistAgent):
    name = "valuation"
    tools = [market_tools.get_quote, financial_tools.get_company_metrics,
             financial_tools.calculate_ratio, financial_tools.get_peer_multiples,
             financial_tools.get_historical_multiples]
    system_prompt = (
        "You are Bulls Eye's Valuation Agent. First collect inputs via get_company_metrics "
        "+ get_quote, then get_peer_multiples + get_historical_multiples for context. "
        "Compute ONLY ratios with present inputs via calculate_ratio ONLY (EPS growth "
        "decimal). Never invent P/S, EV/EBITDA, PEG, or FCF yield without inputs — "
        "record data_gaps. search_web is narrative-only, never for numbers."
    )


class MarketAgent(BaseSpecialistAgent):
    name = "market"
    tools = [market_tools.get_quote, market_tools.get_price_history,
             market_tools.get_volume, market_tools.get_benchmark_history,
             market_tools.get_technicals]
    system_prompt = (
        "You are Bulls Eye's Market Agent. Report actual price/volume/history and market or "
        "sector context. Technical observations only when actually computed by a tool — "
        "label each with its computation. No invented indicators."
    )


class NewsAgent(BaseSpecialistAgent):
    name = "news"
    tools = [news_tools.search_news, news_tools.fetch_news]
    system_prompt = (
        "You are Bulls Eye's News Agent. Cover earnings, contracts, management changes, "
        "regulation, launches, litigation, M&A. Produce a chronological event list with "
        "dates. Min 3 evidence items. No editorial opinion."
    )


class GrowthAgent(BaseSpecialistAgent):
    name = "growth"
    tools = [web_tools.search_web]
    system_prompt = (
        "You are Bulls Eye's Growth & Projects Agent. Cover capex, expansion, products, "
        "partnerships. Tag every initiative: announced / started / executing / completed. "
        "Never blur announced with delivered."
    )


class RiskAgent(BaseSpecialistAgent):
    name = "risk"
    tools = [web_tools.search_web]
    system_prompt = (
        "You are Bulls Eye's Risk Agent. Hunt business, competitive, financial, valuation, "
        "regulatory, legal, geopolitical, execution and technology risks. You MUST actively "
        "search at least one thesis-breaking angle. No soft-pedaling."
    )


class WorkforceAgent(BaseSpecialistAgent):
    name = "workforce"
    tools = [web_tools.search_web, jobs_tools.search_jobs]
    system_prompt = (
        "You are Bulls Eye's Workforce Agent (optional). Use ONLY permitted sources: company "
        "career pages and public disclosures. LinkedIn scraping is banned. Note the source "
        "legality for each finding."
    )


class SocialAgent(BaseSpecialistAgent):
    name = "social"
    tools = [web_tools.search_web]
    system_prompt = (
        "You are Bulls Eye's Social Agent (optional). Report qualitative discussion themes "
        "with evidence strength. NEVER emit numeric sentiment percentages without a "
        "transparent, documented metric."
    )


class DocumentAgent(BaseSpecialistAgent):
    name = "document"
    tools = [document_tools.search_documents]
    system_prompt = (
        "You are Bulls Eye's Document/RAG Agent. Answer ONLY from retrieved passages of "
        "annual reports, filings, transcripts, decks and uploaded PDFs. Cite page and "
        "section for every excerpt."
    )


class IndustryAgent(BaseSpecialistAgent):
    name = "industry"
    tools = [web_tools.search_web]
    system_prompt = "Explain sector demand, competition and industry structure only from supplied evidence. Do not invent market sizes or peer benchmarks."


class ManagementAgent(BaseSpecialistAgent):
    name = "management"
    tools = [web_tools.search_web]
    system_prompt = "Explain management, governance, board changes and capital allocation only from supplied evidence. Distinguish allegations from established findings."


AGENT_REGISTRY: dict[str, type[BaseSpecialistAgent]] = {
    a.name: a for a in [
        FinancialAgent, ValuationAgent, MarketAgent, NewsAgent, GrowthAgent,
        RiskAgent, WorkforceAgent, SocialAgent, DocumentAgent, IndustryAgent, ManagementAgent,
    ]
}
