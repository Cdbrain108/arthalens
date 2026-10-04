"""LangGraph meta-agents for structured query analysis, planning, and synthesis.

Replaces CrewAI's heavyweight roleplay agents with direct LangChain structured
invocations that map prompts to validated Pydantic contracts.
"""
from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from ..config import settings
from ..llm import get_structured_llm, is_mock
from ..schemas.models import (
    ChallengeOutput,
    QueryAnalysis,
    ReportAnswer,
    ReportJSON,
    ResearchPlan,
)


def _prompt_safe(items: list[dict]) -> list[dict]:
    """Evidence safe for gateway prompts: RSS redirect blobs are dropped."""
    safe = []
    for item in items or []:
        item = dict(item)
        url = str(item.get("source_url") or "")
        if "news.google.com" in url:
            item["source_url"] = None
        safe.append(item)
    return safe


def analyze(query: str) -> QueryAnalysis:
    """Analyze query to extract entities, intent, horizon, and comparison mode."""
    if is_mock():
        from ..llm_mock import mock_analyze
        return QueryAnalysis.model_validate(mock_analyze(query))

    prompt = (
        "Extract the company/entity names and tickers explicitly present in this query. "
        "Return EXACTLY this shape with EXACT value rules: "
        '{"entities": [{"name": str, "ticker": str|null, "exchange": str|null, '
        '"confidence": one of high|medium|low}], '
        '"intent": one of price_move|long_term|hiring|compare|document|news|general|conversational, '
        '"time_horizon": str|null, "compare_mode": true|false (boolean, never a string), '
        '"reasoning": str}. '
        "Set compare_mode true only when the query compares entities. "
        "Set intent to 'news' when the user asks ONLY for news, headlines, recent "
        "developments, updates, announcements or 'what happened' about a company "
        "(no valuation, fundamentals, buy/hold/sell or price-move question attached). "
        "If the query is a pure greeting (e.g., 'hi', 'hello', 'hey', 'greetings', 'help', 'what can you do'), "
        "with no investment intent or security, set intent to 'conversational' and entities to []. "
        "CRITICAL: If the query is an open-ended stock selection, recommendation, screening, or discovery question "
        "(e.g. 'which share/company is best to buy', 'top stocks to invest in', 'which shares should I buy nowdays', "
        "'best equities to buy'), do NOT set intent to 'conversational'! Set intent to 'general', and set entities to "
        "[{\"name\": \"Market Opportunities & Top Picks (NIFTY 50)\", \"ticker\": \"^NSEI\", \"exchange\": \"NSE\", \"confidence\": \"medium\"}]. "
        "CRITICAL: For Indian companies (such as Infosys, TCS, Reliance, Wipro, HDFC Bank, ICICI Bank, "
        "Bharti Airtel, ITC, SBI, L&T, etc.), default exchange to 'NSE' (never 'NYSE' or 'NASDAQ') with the "
        "standard NSE ticker (e.g. INFY, TCS, RELIANCE) so primary INR market data is retrieved, unless the "
        "user explicitly requests US ADR or US listings. "
        "Do not infer financial facts.\n"
        f"Query: {query}"
    )
    llm = get_structured_llm("analyzer", QueryAnalysis)
    return llm.invoke(prompt)


def plan(query: str, analysis: QueryAnalysis) -> ResearchPlan:
    """Design bounded research plan and select specialist agents."""
    if is_mock():
        from ..llm_mock import mock_plan
        return ResearchPlan.model_validate(mock_plan(analysis.intent, analysis.compare_mode))

    if analysis.intent == "conversational" or not analysis.entities:
        return ResearchPlan(
            steps=["Query Understanding & Assistant Router"],
            selected_agents=[],
            required_evidence=[],
            rationale="Conversational intent acknowledged. Awaiting company security or peer comparison query."
        )

    prompt = (
        "Design a bounded stock research plan for this analyzed question. "
        "Select the smallest useful subset from: "
        "['financial', 'valuation', 'market', 'news', 'growth', 'risk', 'document', 'industry', 'jobs']. "
        "Rules: "
        "- For pure valuation/hold questions: pick financial, valuation, market, news, growth, risk. "
        "- For price move questions: pick market and news only. "
        "- For hiring/workforce: pick jobs. "
        "- For document queries with uploaded docs: include document. "
        f"Query: {query}\n"
        f"Analysis: {analysis.model_dump_json()}"
    )
    llm = get_structured_llm("planner", ResearchPlan)
    return llm.invoke(prompt)


def challenge(query: str, evidence: list[dict[str, Any]]) -> ChallengeOutput:
    """Stress-test proposed thesis using ONLY validated evidence."""
    if is_mock():
        from ..llm_mock import mock_challenge
        return ChallengeOutput.model_validate(mock_challenge(evidence, query))

    prompt = (
        "Act as an adversarial investment thesis challenger. Using ONLY the provided evidence items, "
        "build a balanced bull case, bear case, and key risk factors. "
        "Every claim in bull_case, bear_case, and risks MUST cite existing evidence IDs from the evidence list. "
        "Do not invent external facts.\n"
        f"Query: {query}\n"
        f"Evidence: {json.dumps(evidence[:25], default=str)}"
    )
    llm = get_structured_llm("challenger", ChallengeOutput)
    return llm.invoke(prompt)


def synthesize(state: dict[str, Any]) -> ReportJSON:
    """Synthesize complete ReportJSON grounded in validated evidence."""
    if is_mock():
        from ..llm_mock import mock_synthesize
        return ReportJSON.model_validate(mock_synthesize(state))

    agent_findings = {}
    for agent_name, agent_data in (state.get("agent_results") or {}).items():
        if isinstance(agent_data, dict):
            findings_list = [f.get("claim") if isinstance(f, dict) else str(f) for f in agent_data.get("findings", [])[:8]]
            agent_findings[agent_name] = {
                "findings": findings_list,
                "sources": agent_data.get("sources", [])[:4]
            }

    context = {
        "query": state.get("query"),
        "entities": state.get("entities"),
        "intent": state.get("intent"),
        "time_horizon": state.get("time_horizon"),
        "compare_mode": state.get("compare_mode"),
        "bull_case": state.get("bull_case"),
        "bear_case": state.get("bear_case"),
        "risks": state.get("risks"),
        "what_could_change_view": state.get("what_could_change_view"),
        "evidence_gaps": state.get("evidence_gaps"),
        "agent_findings": agent_findings,
        "evidence_summary": [
            {
                "id": e.get("evidence_id"),
                "agent": e.get("agent"),
                "claim": e.get("claim"),
                "value": e.get("value"),
                "unit": e.get("unit"),
                "source": e.get("source_title"),
            }
            for e in state.get("evidence", [])[:40]
        ],
    }

    prompt = (
        "Synthesize a professional institutional equity research report strictly grounded in the provided context. "
        "Never invent numerical figures or facts not present in the evidence summary or agent findings. "
        "SPECIAL GUIDANCE FOR COMPANY RESEARCH QUERIES (when analyzing a specific company): "
        "1. In executive_summary and financial health sections, explicitly cite the latest reported quarterly performance (e.g. Q1 FY27, Q4 FY26) "
        "including revenue ($ and INR), operating profit, operating margin band (e.g. 21.1%), constant-currency growth YoY and QoQ, and management forward guidance (e.g. FY27 revenue growth range and operating margin range). "
        "2. Include operational indicators when available: large-deal TCV, % net-new wins, AI revenue share (%), Free Cash Flow conversion (% of net profit), cash & investments balance, geographic revenue mix (North America, Europe, etc.), attrition, and utilization. "
        "3. In valuation section, contextualize trailing P/E, EPS, dividend yield, and 52-week high/low drawdown. "
        "4. In bull_case and bear_case, explore both the commercial upside (AI pipeline scaling, FCF generation, operating leverage) and the core downside vulnerabilities (automation cannibalization of vendor billing, guidance risk, wage & margin compression, geographic client concentration). "
        "5. Distinguish cleanly between verified facts from primary company disclosures vs researcher analytical deductions.\n"
        "SPECIAL GUIDANCE FOR DISCOVERY, SCREENING, OR THEMATIC QUERIES (where query asks which stocks to buy, "
        "market opportunities, or sector themes): "
        "1. In executive_summary and overall_assessment, provide a clear, direct, and actionable answer synthesizing "
        "which sectors and quality profiles offer the strongest risk-reward (e.g. quality large-cap compounders, "
        "infrastructure/energy capex, consumption leaders). "
        "2. In financial and valuation sections, outline institutional screening hurdles (e.g. ROE > 18%, net-cash balance sheets, "
        "margin of safety relative to historical valuation multiples) rather than leaving blank placeholders. "
        "3. Synthesize verified news headlines and market trends directly to provide concrete, timely market intelligence. "
        "4. In bull_case, bear_case, and risks, deliver balanced, high-signal institutional insights.\n"
        f"Context: {json.dumps(context, default=str)}"
    )
    llm = get_structured_llm("synthesizer", ReportJSON)
    return llm.invoke(prompt)



def answer_report_question(question: str, report: dict[str, Any], context: dict[str, Any] | None) -> ReportAnswer:
    """Answer follow-up questions from the completed report and evidence packet."""
    if is_mock():
        from ..api.research_routes import _extractive_report_answer
        return _extractive_report_answer(question, report, context)

    prompt = (
        "Answer the user's question using ONLY the provided report sections and evidence packet. "
        "Distinguish clearly between what the report establishes and what would require fresh research.\n"
        f"Question: {question}\n"
        f"Report: {json.dumps(report, default=str)[:8000]}\n"
        f"Evidence: {json.dumps((context or {}).get('evidence', [])[:20], default=str)}"
    )
    llm = get_structured_llm("report_qa", ReportAnswer)
    return llm.invoke(prompt)
