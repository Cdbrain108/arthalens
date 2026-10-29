"""Research routes — job lifecycle (API_SPEC.md)."""
import asyncio
import logging
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..config import settings
from ..llm import is_mock
from ..schemas.models import ReportAnswer
from ..storage.jobs import JobManager
from ..graph.runner import run_research

logger = logging.getLogger("bullseye.research")

router = APIRouter(prefix="/research", tags=["research"])
jobs = JobManager()

# asyncio keeps only weak references to tasks; an unreferenced background task
# can be garbage-collected mid-run, silently killing a research job.
_running_tasks: set[asyncio.Task] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResearchRequest(BaseModel):
    query: str
    document_ids: list[str] = []
    mode: str = "auto"


class ReportQuestion(BaseModel):
    question: str
    history: list[dict] = Field(default_factory=list)


def _on_task_done(task: asyncio.Task) -> None:
    _running_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        logger.error("research task crashed", exc_info=task.exception())


def _report_context(final: dict) -> dict:
    """Persist the minimum validated packet needed for grounded follow-ups."""
    return {key: final.get(key) for key in (
        "query", "entities", "intent", "time_horizon", "compare_mode",
        "selected_agents", "agent_results", "evidence", "evidence_gaps",
        "bull_case", "bear_case", "risks", "what_could_change_view",
    )}


_QA_STOPWORDS = {
    "what", "when", "where", "which", "does", "this", "that", "about",
    "with", "from", "have", "been", "were", "will", "should", "could",
    "would", "there", "their", "into", "over", "your", "report", "tell",
    "explain", "in", "on", "to", "at", "of", "by", "is", "it", "an",
    "as", "or", "do", "if", "for", "the", "and", "a", "are", "how"
}


def _qa_tokens(value: str) -> set[str]:
    # Support 2-letter financial metrics like PE, PB, DE, RO while filtering stopwords
    return {token for token in re.findall(r"[a-z0-9]{2,}", (value or "").lower())
            if token not in _QA_STOPWORDS}


NON_FINANCIAL_PATTERNS = [
    r"\b(recipe|recipes|cook|cooking|bake|baking|pasta|cake|pizza|biryani|burger|food|dish|dessert|soup)\b",
    r"\b(poem|poetry|rhyme|song|lyrics|story|fiction|novel|joke|jokes|comedy|riddle)\b",
    r"\b(cricket|football|soccer|basketball|nba|world cup|ipl|fifa|tennis|badminton|olympics)\b",
    r"\b(movie|cinema|actor|actress|film|hollywood|bollywood|trailer|anime|manga)\b",
    r"\b(weather|temperature|forecast|rain|climate|humidity|cyclone)\b",
    r"\b(dating|relationship|girlfriend|boyfriend|love|breakup)\b",
    r"\b(quicksort|bubble sort|binary search tree|linked list|leetcode)\b",
    r"\b(write (?:a )?(?:python|javascript|java|c\+\+) (?:code|script|program)|debug (?:my )?code|programming tutorial)\b",
    r"\b(president|prime minister|politician|election|parliament|capital city|geography|historical figure)\b",
    r"\b(photosynthesis|biology|chemistry|physics|planet|solar system|medical advice|diagnosis|symptom|medicine dosage)\b",
    r"\b(translate|translation|write (?:an? )?(?:email|essay|letter|resume|cover letter)|grammar|language homework)\b",
    r"\b(travel|tourism|vacation|flight booking|train ticket|hotel booking|tourist|itinerary)\b",
    r"\b(solve|equation|algebra|calculus|geometry|integral|derivative|trigonometry)\b",
]

FINANCIAL_PATTERNS = [
    r"\b(stock|stocks|share|shares|equity|equities|market|markets|invest|investing|investment|investor)\b",
    r"\b(ipo|ipos|fpo|drhp|rhp|allotment|listing|gmp|grey market|ofss|offer for sale|red herring|fresh issue|anchor investor|qib|retail quota|hni)\b",
    r"\b(portfolio|dividend|dividends|valuation|multiple|pe|p/e|roe|roce|ebitda|opm|npm)\b",
    r"\b(revenue|profit|margin|margins|loss|earnings|balance sheet|cash flow|debt|leverage)\b",
    r"\b(capex|cagr|moat|moats|bull|bear|hold|buy|sell|quarter|quarterly|fiscal|annual report)\b",
    r"\b(10-k|10-q|sec|nse|bse|nifty|sensex|sp500|nasdaq|nyse|fed|rbi|yield|bond|etf|derivatives|futures|options)\b",
    r"\b(tcs|infosys|infy|reliance|ril|jio|reliance jio|wipro|hdfc|icici|sbi|apple|aapl|microsoft|msft|nvda|nvidia|tesla|tsla|amd|intel|intc|meta|google|googl|amzn|swiggy|zomato|paytm|ola|nykaa|zoho|zerodha|tata|adani|itc|l&t|bajaj|airtel|bharti|maruti|mahindra|lic|vedanta)\b",
    r"\b(ai|startup|startups|venture|company|companies|firm|enterprise|unicorn|founder|ceo|funding|valuation|business|product|products|tech|technology|technologies|software|saas)\b",
    r"\b(ticker|stock symbol|trading symbol|scrip code|listed|listing|exchange|publicly traded|public company|private company|unlisted)\b",
    r"\b(fundamentals|financials|research report|risk audit|peer comparison|market capitalization)\b",
    r"\b(agent|agents|specialist|specialists|report|findings|verdict|results|catalyst|guidance|outlook|comparison|performance)\b",
    r"\b(analyze|analysis|research|audit|evaluate|evaluation|inspect|forecast|projections|thesis|deep-dive|dossier|breakdown|fair value)\b",
]

def is_financial_or_stock_query(text: str) -> bool:
    raw = (text or "").strip()
    lower = raw.lower()
    if not lower:
        return True

    if re.search(
        r"^(?:hi|hello|hey|help|thanks|thank you|bye|goodbye|who are you|what can you do|"
        r"how are you|what is artha(?:lens| ai)?|how does this work)\b",
        lower,
    ):
        return True
    has_finance = any(re.search(pat, lower) for pat in FINANCIAL_PATTERNS)
    is_irrelevant = any(re.search(pat, lower) for pat in NON_FINANCIAL_PATTERNS)

    has_market_angle = bool(re.search(
        r"\b(stock|stocks|share|shares|ticker|listed|listing|exchange|public company|"
        r"publicly traded|invest|investment|valuation|revenue|profit)\b",
        lower,
    ))
    if is_irrelevant and not has_market_angle:
        return False

    if has_finance:
        return True

    # Support discovery of new organizations while rejecting arbitrary
    # general-purpose questions that do not belong in a finance product.
    if re.search(r"\b(?:tell me about|details on|overview of|information on|company profile of|business of|analyze|research|audit|inspect|forecast)\s+[A-Za-z0-9&.-]+", raw, re.IGNORECASE):
        return True
    if re.search(r"\b[A-Za-z]+(?:AI|Tech|Labs|Inc|Corp|Ltd|Limited|Ventures|Cap|Capital)\b", raw):
        return True

    return False


def _extractive_report_answer(question: str, report: dict, context: dict | None) -> ReportAnswer:
    """Offline extraction across all synthesized report sections and findings."""
    context = context or {}
    q_lower = (question or "").lower().strip()

    # Identity queries
    if any(p in q_lower for p in ("who are you", "who r u", "what are you", "what is artha", "what can you do", "introduce yourself")):
        return ReportAnswer(
            answer=(
                "### 🧠 Artha AI Autonomous Research Copilot\n\n"
                "I am **Artha AI Copilot**, the intelligent equity research assistant developed by **Artha AI**.\n\n"
                "I work alongside our **11 autonomous specialist agents** to cross-examine regulatory filings, "
                "calculate deterministic valuation metrics, stress-test Bull vs Bear theses, and answer follow-up questions "
                "grounded strictly in verified evidence and audited company reports.\n\n"
                "*You can ask me to explain financial terms (e.g. P/E, EBITDA, ROE), compare valuation spreads, "
                "summarize key risks, or evaluate situational hold vs sell directives.*"
            ),
            sources=[],
            evidence_gaps=[],
            follow_up_research_needed=False,
        )

    # Refuse out-of-scope non-financial queries
    if not is_financial_or_stock_query(question):
        return ReportAnswer(
            answer=(
                "### 🛡️ Out of Scope — Finance & Equity Research Only\n\n"
                "I am **Artha AI Copilot**, specialized exclusively in equity research, stock fundamental analysis, "
                "financial valuation, and investment intelligence.\n\n"
                "I cannot assist with queries outside the financial and investment domain "
                "(such as general knowledge, creative writing, cooking, programming, sports, or entertainment).\n\n"
                "Please ask a question related to this company's financial performance, valuation multiples, "
                "balance sheet, or bull vs bear thesis."
            ),
            sources=[],
            evidence_gaps=[],
            follow_up_research_needed=False,
        )

    # P/E Ratio educational concept
    if any(p in q_lower for p in ("what is p/e", "what is pe ratio", "explain p/e", "explain pe ratio", "what does p/e mean", "pe multiple")):
        metrics = (report or {}).get("metrics") or {}
        pe = metrics.get("pe_ratio", "N/A")
        ticker = (report or {}).get("company", {}).get("ticker") or "the audited stock"
        return ReportAnswer(
            answer=(
                f"### 🧮 Understanding Price-to-Earnings (P/E) Ratio\n\n"
                f"The **Price-to-Earnings (P/E) Ratio** measures how much investors are willing to pay today for every ₹1 of current annual net profit generated by a company.\n\n"
                f"* **Formula:** `P/E Ratio = Current Market Price per Share ÷ Earnings Per Share (EPS)`\n"
                f"* **Audited Multiple for {ticker}:** `{pe}`\n\n"
                f"**💡 In Plain Words:**\n"
                f"A multiple of **{pe}** means the market is currently pricing {ticker} at **{pe} years** of its current earnings power. "
                f"A higher P/E generally indicates high market expectations for future earnings growth, while a lower P/E may reflect value pricing or cyclical headwinds."
            ),
            sources=[],
            evidence_gaps=[],
            follow_up_research_needed=False,
        )

    query_tokens = _qa_tokens(question)

    is_decision_qa = bool(query_tokens & {"buy", "sell", "hold", "invest", "stance", "verdict", "action", "better", "compare", "winner", "horizon", "recommend", "allocation"})
    current_price_terms = (query_tokens & {"current", "latest", "today", "now"}) and (query_tokens & {"price", "quote", "live", "ticker"})
    if current_price_terms and not is_decision_qa:
        gaps = list((report or {}).get("evidence_gaps") or [])[:5]
        gaps.insert(0, "The completed report is a historical snapshot and does not establish live current data.")
        return ReportAnswer(
            answer=("This completed report cannot answer a live current-data question "
                    "without a fresh research run. Please start fresh research for "
                    "the latest price, news, or market status."),
            sources=[],
            evidence_gaps=list(dict.fromkeys(gaps)),
            follow_up_research_needed=True,
        )

    candidates: list[tuple[int, str, str, dict | None]] = []

    # 0. Specialized Verdict Structs (Comparison, Action, Discovery)
    company_obj = (report or {}).get("company") or {}
    cv = company_obj.get("comparison_verdict")
    ad = company_obj.get("action_decision")
    if isinstance(cv, dict):
        cv_text = f"WINNER: {cv.get('winner_name')} ({cv.get('winner_ticker')}) — {cv.get('winner_reason')}. VALUE PICK: {cv.get('value_name')} ({cv.get('value_ticker')}) — {cv.get('value_reason')}. HOLD vs SELL: {cv.get('hold_vs_sell_guidance')}."
        overlap = len(query_tokens & _qa_tokens(cv_text))
        if any(w in query_tokens for w in ("winner", "better", "compare", "difference", "hold", "sell", "buy")):
            overlap += 8
        if overlap:
            candidates.append((overlap + 5, "Peer Comparison Verdict", cv_text, None))

    # Check if the user is asking an actionable decision question (should I hold, what to do, should I buy/invest)
    is_action_query = any(w in query_tokens for w in ("hold", "buy", "sell", "invest", "action", "decision", "do")) and \
                      any(w in query_tokens for w in ("should", "can", "what", "whether", "how", "did", "i", "we", "now"))

    if is_action_query and isinstance(ad, dict):
        headline = ad.get("headline", "Hold & Selectively Accumulate")
        holders = ad.get("existing_holders", "Maintain existing position.")
        buyers = ad.get("fresh_buyers", "Accumulate gradually on dips.")
        lt = ad.get("long_term_directive", "Suitable for long-term compounding.")
        st = ad.get("short_term_directive", "Expect range-bound price action in near term.")
        exits = ad.get("sell_triggers", "Exit if operating margins deteriorate or moats breach.")

        metrics = (report or {}).get("metrics") or {}
        pe = metrics.get("pe_ratio")
        opm = metrics.get("opm_pct")
        de = metrics.get("debt_equity")
        roe = metrics.get("roe_pct")

        m_lines = []
        if pe: m_lines.append(f"* **Valuation Multiple (P/E):** `{pe}`")
        if opm: m_lines.append(f"* **Operating Profit Margin:** `{opm}`")
        if de: m_lines.append(f"* **Balance Sheet Debt/Equity:** `{de}`")
        if roe: m_lines.append(f"* **Return on Equity (ROE):** `{roe}`")
        m_block = ("\n\n**📊 Key Financial Metrics Validating This Stance:**\n" + "\n".join(m_lines)) if m_lines else ""

        ans = (
            f"### 🎯 Action Recommendation: {headline}\n\n"
            f"Here is a clear, professional breakdown of what you should do based on our audited report:\n\n"
            f"* **If You Currently Own Shares:** {holders}\n"
            f"* **If You Are Deploying Fresh Capital:** {buyers}\n\n"
            f"**⏳ Time Horizon Strategy:**\n"
            f"* **Long-Term (3–5 Years):** {lt}\n"
            f"* **Short-Term (1–6 Months):** {st}"
            f"{m_block}\n\n"
            f"**🚨 Downside Risk Triggers (When to Sell):**\n"
            f"* {exits}"
        )
        return ReportAnswer(
            answer=ans,
            sources=[],
            evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
            follow_up_research_needed=False,
        )

    if is_action_query and isinstance(cv, dict):
        winner_name = cv.get('winner_name')
        winner_ticker = cv.get('winner_ticker')
        winner_reason = cv.get('winner_reason')
        value_name = cv.get('value_name')
        value_ticker = cv.get('value_ticker')
        value_reason = cv.get('value_reason')
        guidance = cv.get('hold_vs_sell_guidance')

        ans = (
            f"### 🏆 Peer Comparison Action Guidance\n\n"
            f"In simple, natural terms, here is how you should position between these companies:\n\n"
            f"* **👑 Core Long-Term Outperformer:** **{winner_name} ({winner_ticker})** — {winner_reason}. Accumulate on dips for multi-year compounding.\n"
            f"* **💎 Tactical Value & Dividend Pick:** **{value_name} ({value_ticker})** — {value_reason}. Hold or buy for multiple expansion and yield.\n\n"
            f"**🎯 Action Directives (Hold vs Sell):**\n"
            f"* {guidance}"
        )
        return ReportAnswer(
            answer=ans,
            sources=[],
            evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
            follow_up_research_needed=False,
        )

    dp = company_obj.get("discovery_portfolio")
    if isinstance(dp, dict):
        dp_text = f"PORTFOLIO BLUEPRINT: {dp.get('headline')}. Summary: {dp.get('summary')}. Deployment: {dp.get('deployment_strategy')}."
        overlap = len(query_tokens & _qa_tokens(dp_text))
        if any(w in query_tokens for w in ("invest", "money", "portfolio", "allocation", "organization", "good")):
            overlap += 8
        if overlap:
            candidates.append((overlap + 5, "Portfolio Discovery Blueprint", dp_text, None))

    # 1. Executive Summary
    exec_summary = (report or {}).get("executive_summary")
    if isinstance(exec_summary, str) and exec_summary.strip():
        overlap = len(query_tokens & _qa_tokens(exec_summary))
        if overlap:
            candidates.append((overlap + 2, "Executive Summary", exec_summary.strip(), None))

    # 2. Overall Assessment / Verdict
    assessment = (report or {}).get("overall_assessment") or (report or {}).get("verdict")
    if isinstance(assessment, dict):
        for field in ("headline", "rationale", "classification"):
            val = str(assessment.get(field) or "").strip()
            overlap = len(query_tokens & _qa_tokens(val))
            if val and overlap:
                candidates.append((overlap + 3, f"Verdict ({field.title()})", val, None))

    # 3. Dual-Thesis Cases (Bull case, Bear case, Triggers, Deductions, Decision Framework)
    for case_type in ("bull_case", "bear_case", "what_could_change_view", "reasoned_deductions"):
        items = (report or {}).get(case_type) or []
        for item in items:
            text = str(item.get("claim", item.get("point", "")) if isinstance(item, dict) else item).strip()
            overlap = len(query_tokens & _qa_tokens(text))
            # Boost matches if the query explicitly asks for bull, bear, or risk
            if ("bull" in query_tokens and "bull" in case_type) or \
               ("bear" in query_tokens and "bear" in case_type) or \
               ("risk" in query_tokens and "bear" in case_type):
                overlap += 4
            if text and overlap:
                candidates.append((overlap + 2, case_type.replace('_', ' ').title(), text, None))

    # 4. Audited Key Metrics
    metrics = (report or {}).get("metrics") or {}
    if isinstance(metrics, dict):
        for m_key, m_val in metrics.items():
            metric_label = m_key.replace('_', ' ').upper()
            val_str = str(m_val)
            metric_str = f"{metric_label}: {val_str}"
            overlap = len(query_tokens & _qa_tokens(f"{m_key} {metric_label}"))
            if ("pe" in query_tokens and "pe" in m_key) or \
               ("pb" in query_tokens and "pb" in m_key) or \
               ("roe" in query_tokens and "roe" in m_key) or \
               ("debt" in query_tokens and "debt" in m_key) or \
               ("margin" in query_tokens and "opm" in m_key):
                overlap += 5
            if overlap:
                candidates.append((overlap + 4, "Audited Metric", metric_str, None))

    # 5. Valuation Scenarios
    for scen in (report or {}).get("valuation_scenarios") or []:
        if isinstance(scen, dict):
            scen_text = f"Multiple {scen.get('multiple')} ({scen.get('implied_price')}): {scen.get('description')}"
            overlap = len(query_tokens & _qa_tokens(scen_text))
            if "pe" in query_tokens or "valuation" in query_tokens:
                overlap += 3
            if overlap:
                candidates.append((overlap + 2, "Valuation Scenario", scen_text, None))

    # 6. Quarterly Financial Performance
    for q_row in (report or {}).get("quarterly_table") or []:
        if isinstance(q_row, dict):
            q_text = f"{q_row.get('period')}: Revenue {q_row.get('revenue')}, Net Profit {q_row.get('net_profit')} ({q_row.get('yoy_growth')})"
            overlap = len(query_tokens & _qa_tokens(q_text))
            if "revenue" in query_tokens or "profit" in query_tokens or "margin" in query_tokens or "ebitda" in query_tokens:
                overlap += 3
            if overlap:
                candidates.append((overlap + 2, "Quarterly Financials", q_text, None))

    # 7. Specialist Agent Findings and Sections
    for section, value in (report or {}).items():
        if not isinstance(value, dict):
            continue
        for field in ("summary", "findings", "swot", "risks", "strengths"):
            raw = value.get(field)
            texts = raw if isinstance(raw, list) else [raw]
            for text in texts:
                text = str(text.get("claim", "") if isinstance(text, dict) else text or "").strip()
                overlap = len(query_tokens & _qa_tokens(text))
                if text and overlap:
                    candidates.append((overlap, section.replace('_', ' ').title(), text, None))

    # 8. Validated Context Evidence
    source_hits: list[dict] = []
    for item in context.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        text = " ".join(str(item.get(key) or "") for key in ("claim", "excerpt", "source_title"))
        overlap = len(query_tokens & _qa_tokens(text))
        if text.strip() and overlap:
            candidates.append((overlap + 1, str(item.get("agent", "Evidence")).title(),
                               item.get("claim") or item.get("excerpt") or text, item))

    candidates.sort(key=lambda item: item[0], reverse=True)
    top = candidates[:6]
    if not top:
        comp_name = (report or {}).get("company", {}).get("name") or "the audited company"
        return ReportAnswer(
            answer=(f"I could not locate an exact direct match for that query phrasing in the completed report for **{comp_name}**.\n\n"
                    "Please select one of the following key report dimensions or type your specific question below:"),
            evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
            follow_up_research_needed=False,
            clarification_needed=True,
            clarification_prompt=f"Select an audited area to inspect for {comp_name}:",
            clarification_options=[
                f"Downside risks & stress watchpoints",
                f"Valuation multiples & DCF scenarios",
                f"Operating margins & financial metrics",
                f"Investment horizon directive (1–6m vs 3–5y)",
            ],
        )

    lines = []
    seen = set()
    for _, section, text, item in top:
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"**{section}:** {text}")
        if item:
            source = {
                "title": item.get("source_title"),
                "url": item.get("source_url"),
                "publication_date": item.get("publication_date"),
            }
            source_key = (source["title"], source["url"])
            if source_key not in {(s.get("title"), s.get("url")) for s in source_hits}:
                source_hits.append(source)

    return ReportAnswer(
        answer="Based on the generated report findings:\n\n" + "\n\n".join(f"* {line}" for line in lines),
        sources=source_hits[:8],
        evidence_gaps=list((report or {}).get("evidence_gaps") or [])[:5],
        follow_up_research_needed=False,
    )


def _answer_report_question(question: str, report: dict, context: dict | None, history: list[dict] | None = None) -> ReportAnswer:
    if is_mock():
        return _extractive_report_answer(question, report, context)
    try:
        from ..graph.meta import answer_report_question
        ans = answer_report_question(question, report, context, history=history)
        # If the LLM claim states the question is not established, but our deterministic extractor
        # finds verified findings (such as peer verdicts, executive summaries, bull/bear triggers),
        # use the verified report findings so the user receives a factual, grounded answer.
        if ans and (ans.follow_up_research_needed or "not established" in (ans.answer or "").lower()):
            extractive = _extractive_report_answer(question, report, context)
            if extractive and not extractive.follow_up_research_needed:
                return extractive
        return ans
    except Exception:
        logger.exception("report Q&A provider failed; using extractive fallback")
        return _extractive_report_answer(question, report, context)


async def _run_job(job_id: str, query: str, document_ids: list[str]):
    """Execute the compiled LangGraph and persist progress events."""
    status = jobs.get(job_id)
    if status is None:
        return
    status.status = "running"
    status.current_node = "analyze_query"

    # Instant deterministic pre-routing (<5ms):
    # Populate initial intent, entities, and selected agents so the frontend UI
    # displays the routed specialist agents immediately on the first status poll.
    try:
        from ..llm_mock import mock_analyze, mock_plan
        from ..graph.routing import enforce_policy
        from ..schemas.models import QueryAnalysis as _QA, ResearchPlan as _RP
        pre_a = mock_analyze(query)
        if pre_a.get("entities") or pre_a.get("intent"):
            status.intent = pre_a.get("intent", "general")
            status.entities = list(pre_a.get("entities", []))
            qa_obj = _QA(**pre_a)
            rp_obj = _RP(**mock_plan(qa_obj.intent, qa_obj.compare_mode))
            pre_selected = enforce_policy(qa_obj, rp_obj, document_ids)
            if pre_selected:
                status.selected_agents = list(pre_selected)
    except Exception as pre_exc:
        logger.debug("Instant pre-routing skipped: %s", pre_exc)

    jobs.update(status)

    def start_step(node: str) -> None:
        # Sequential pipeline nodes close the previous one; parallel agent
        # steps ("<name>_agent") coexist until their own done/failed event.
        if any(s["node"] == node for s in status.steps):
            return
        if not node.endswith("_agent"):
            for step in status.steps:
                if step["state"] == "running" and not step["node"].endswith("_agent"):
                    step.update(state="done", at=_now())
        status.steps.append({"node": node, "state": "running", "at": None})

    def finish_step(node: str, state: str = "done") -> None:
        for step in status.steps:
            if step["node"] == node and step["state"] == "running":
                step.update(state=state, at=_now())

    def finish_running_steps(state: str = "done") -> None:
        for step in status.steps:
            if step["state"] == "running":
                step.update(state=state, at=_now())

    def on_event(kind: str, payload) -> None:
        if kind == "node":
            status.current_node = payload
            start_step(payload)
            if payload == "validate_evidence":
                status.status = "validating"
            elif payload in ("bull_bear_risk", "challenge_thesis",
                              "synthesize", "synthesize_report"):
                status.status = "synthesizing"
            elif payload in ("build_report", "generate_pdf"):
                status.status = "rendering"
        elif kind == "analysis" and payload:
            status.intent = payload.get("intent", "")
            status.entities = list(payload.get("entities", []))
        elif kind == "agents" and payload:
            status.selected_agents = list(payload)
        elif kind == "agent_done" and payload:
            finish_step(f"{payload}_agent")
            if payload not in status.completed_agents:
                status.completed_agents.append(payload)
        elif kind == "agent_failed" and payload:
            agent = payload.get("agent", "unknown")
            finish_step(f"{agent}_agent", "failed")
            if agent not in status.failed_agents:
                status.failed_agents.append(agent)
            status.errors.append({"node": f"{agent}_agent",
                                  "error": payload.get("error", "")})
            status.agent_statuses[agent] = 'timed_out' if 'timed out' in payload.get('error', '') else 'failed'
        elif kind == "agent_status" and payload:
            agent = payload['agent']
            status.agent_statuses[agent] = payload['status']
            status.agent_details[agent] = payload
            for step in status.steps:
                if step['node'] == f'{agent}_agent':
                    step.update(state='done' if payload['status'] == 'completed' else payload['status'], at=_now())
        elif kind == "report":
            status.status = "rendering"
        jobs.update(status)

    try:
        final = await run_research(query, job_id, document_ids, on_event=on_event)
        report_attached = jobs.attach_report(job_id, final.get("report"), final.get("pdf_path"),
                                             _report_context(final))
        status.status = "succeeded"
        status.current_node = "done"
        status.failed_agents = list(final.get("failed_agents", []))
        status.agent_statuses.update(final.get('agent_statuses') or {})
        finish_running_steps()
        if not report_attached:
            status.errors.append({"node": "attach_report",
                                  "error": "report could not be persisted"})
        jobs.update(status)
    except asyncio.CancelledError:
        # Server shutdown / --reload cancels in-flight jobs; mark them failed
        # so they never stay "running" (and polled) forever.
        status.status = "failed"
        status.errors.append({"node": status.current_node,
                              "error": "job interrupted (server shutdown or cancellation)"})
        finish_running_steps("failed")
        jobs.update(status)
        raise
    except Exception as exc:
        status.status = "failed"
        finish_running_steps("failed")
        status.errors.append({"node": status.current_node, "error": str(exc)})
        jobs.update(status)
        logger.exception("research job %s failed at %s", job_id, status.current_node)


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)
    job_id: str | None = None  # if set, ground answer in that completed report


class ChatResponse(BaseModel):
    answer: str
    suggested_tickers: list[str] = []   # tickers extracted — trigger research on these
    search_used: bool = False
    sources: list[dict] = []
    clarification: dict | None = None   # interactive question card with options


def _chat_web_search(query: str) -> list[dict]:
    """Use internal web search tool to get real results."""
    from ..tools.web_tools import _search_web
    result = _search_web(query)
    if result.get("ok"):
        return result["data"].get("results", [])
    return []


def _chat_fetch_page(url: str) -> str:
    """Fetch and return cleaned page text."""
    from ..tools.web_tools import _fetch_page
    result = _fetch_page(url)
    if result.get("ok"):
        return (result["data"] or {}).get("text", "")[:8000]
    return ""


_EXCHANGE_TICKER_RE = re.compile(
    r'\b(?:NYSE|NASDAQ|NSE|BSE|LSE|XETRA|AMS|EPA|TSX|ASX|HKEX|TYO|SWX|OTC)[:\s]+([A-Z0-9.-]{1,10})\b'
    r'|\(([A-Za-z]+):\s*([A-Z0-9.-]{1,10})\)'
    r'|\b(?:ticker|symbol)[:\s]+\*?\*?([A-Z0-9.-]{1,10})\*?\*?\b'
    r'|\$([A-Z]{2,6})\b',
    re.I
)

KNOWN_TICKERS_MAP = {
    "tcs": "TCS", "tata consultancy": "TCS", "infosys": "INFY", "infy": "INFY",
    "reliance": "RELIANCE", "ril": "RELIANCE", "wipro": "WIPRO",
    "hdfc bank": "HDFCBANK", "hdfcbank": "HDFCBANK", "hdfc": "HDFCBANK",
    "icici bank": "ICICIBANK", "icicibank": "ICICIBANK", "icici": "ICICIBANK",
    "sbi": "SBIN", "state bank": "SBIN",
    "l&t": "LT", "larsen": "LT", "bajaj finance": "BAJFINANCE",
    "hcl tech": "HCLTECH", "hcltech": "HCLTECH",
    "airtel": "BHARTIARTL", "bharti airtel": "BHARTIARTL",
    "itc": "ITC", "zomato": "ZOMATO", "paytm": "PAYTM", "swiggy": "SWIGGY",
    "titan": "TITAN", "asian paints": "ASIANPAINT", "maruti": "MARUTI",
    "sun pharma": "SUNPHARMA", "dr reddy": "DRREDDY", "axis bank": "AXISBANK",
    "kotak": "KOTAKBANK", "ntpc": "NTPC", "ongc": "ONGC", "bel": "BEL",
    "hal": "HAL", "bhel": "BHEL", "coal india": "COALINDIA",
    "trent": "TRENT", "siemens": "SIEMENS", "polycab": "POLYCAB", "dixon": "DIXON",
    "mazagon": "MAZDOCK", "mazdock": "MAZDOCK", "tata steel": "TATASTEEL",
    "tata power": "TATAPOWER", "tata motors": "TATAMOTORS", "suzlon": "SUZLON",
    "ireda": "IREDA", "rvnl": "RVNL", "irfc": "IRFC", "cdsl": "CDSL",
    "apple": "AAPL", "aapl": "AAPL", "microsoft": "MSFT", "msft": "MSFT",
    "nvidia": "NVDA", "nvda": "NVDA", "tesla": "TSLA", "tsla": "TSLA",
    "amazon": "AMZN", "amzn": "AMZN", "google": "GOOGL", "alphabet": "GOOGL",
    "meta": "META", "netflix": "NFLX", "amd": "AMD", "intel": "INTC",
    "palantir": "PLTR", "pltr": "PLTR",
    "lockheed": "LMT", "lockheed martin": "LMT", "lmt": "LMT",
    "boeing": "BA", "ba": "BA", "northrop": "NOC", "northrop grumman": "NOC",
    "general dynamics": "GD", "gd": "GD", "rtx": "RTX", "raytheon": "RTX",
}

_COMMON_MARKDOWN_WORDS = {
    "WHY", "WHAT", "NOTE", "PRO", "CON", "RISK", "BULL", "BEAR", "RULE", "HIGH",
    "LOW", "PE", "ROE", "ROCE", "DCF", "EPS", "NSE", "BSE", "NYSE", "NASDAQ",
    "USD", "INR", "CAGR", "THE", "AND", "FOR", "BUY", "SELL", "HOLD", "VIEW",
    "BEST", "TOP", "KEY", "ALL", "NEW", "NOW", "YES", "NOT", "TAX", "CAP", "NET",
    "CEO", "EUV", "GLP", "FDA", "SEC", "RBI", "FED", "GDP", "CPI", "IPO", "ETF"
}

def _extract_tickers_from_text(text: str) -> list[str]:
    """Extract and dynamically validate stock tickers across global markets and any sector."""
    from ..tools.base import resolve_ticker_info
    found = []
    lower = text.lower()

    # 1. Fast-path check for common recognized names
    for name, ticker in KNOWN_TICKERS_MAP.items():
        if re.search(r'(?<![a-z])' + re.escape(name) + r'(?![a-z])', lower):
            if ticker not in found:
                found.append(ticker)

    # 2. Extract tickers from exchange patterns, ticker tags, and $TICKER
    candidates = []
    for m in _EXCHANGE_TICKER_RE.finditer(text):
        cand = (m.group(1) or m.group(3) or m.group(4) or m.group(5) or "").upper()
        if cand and cand not in candidates and cand not in found and len(cand) >= 2 and cand not in _COMMON_MARKDOWN_WORDS:
            candidates.append(cand)

    # 3. Extract bold uppercase tokens like **ASML** or **NVO**
    for m in re.finditer(r'\*\*([A-Z0-9-]{2,10})\*\*', text):
        cand = m.group(1).upper()
        if cand not in candidates and cand not in found and cand not in _COMMON_MARKDOWN_WORDS and not cand.isdigit():
            candidates.append(cand)

    # 4. Dynamically validate extracted candidates against live global market data
    for cand in candidates:
        if len(found) >= 4:
            break
        try:
            info = resolve_ticker_info(cand)
            if info and info.get("exchange"):
                ticker = info.get("ticker") or cand
                if ticker not in found:
                    found.append(ticker)
            elif cand not in found and len(cand) <= 5:
                found.append(cand)
        except Exception:
            if cand not in found and len(cand) <= 5:
                found.append(cand)

    return found[:4]  # max 4 tickers for auto-research


def _copilot_chat_llm(message: str, history: list[dict], search_results: list[dict],
                      report: dict | None, context: dict | None) -> str:
    """Ask the LLM for a copilot answer grounded in web search + optional report."""
    from ..llm import get_llm, is_mock

    # Build search snippet block
    snippets = ""
    if search_results:
        snippets = "\n\n**Live Web Search Results:**\n"
        for i, r in enumerate(search_results[:6], 1):
            title = r.get("title", "")
            body = (r.get("body") or r.get("snippet") or "")[:500]
            url = r.get("href") or r.get("url") or ""
            snippets += f"{i}. **{title}** ({url})\n   {body}\n\n"

    # Build report block if we have one
    report_block = ""
    if report:
        report_block = f"\n\n**Active Completed Research Report:**\n{str(report)[:6000]}"

    history_block = ""
    if history:
        turns = []
        for msg in history[-6:]:
            role = "User" if msg.get("role") == "user" else "Copilot"
            content = (msg.get("content") or msg.get("text") or "").strip()[:400]
            if content:
                turns.append(f"{role}: {content}")
        if turns:
            history_block = "\n\n**Prior Conversation:**\n" + "\n".join(turns)

    system_msg = (
        "You are Artha AI Copilot — a world-class conversational financial intelligence assistant (like ChatGPT or Perplexity for finance). "
        "You have access to live web search results provided below. "
        "Use the search results to give a grounded, accurate, direct, and insightful answer to any corporate, product, market, or investment question across ANY industry (defense, healthcare, pharma, tech, luxury, automotive, agriculture, energy, consumer, finance, etc.). "
        "RULES: "
        "1. DIRECT & INTELLIGENT ANSWERS: Directly answer the user's specific inquiry upfront. "
        "   - If asked about ANY company, brand, product, medication/drug (e.g. Ozempic, Keytruda, Wegovy), vehicle/aircraft (e.g. F-16, Model Y, Rafale), microchip/hardware (e.g. EUV lithography, H100), software, or service across ANY sector: immediately identify its parent company/manufacturer, its public listing status (e.g. NYSE, NASDAQ, NSE, BSE, LSE, Euronext, etc. vs privately held), and its exact ticker symbol in bold like **(NYSE: LMT)**, **(NYSE: NVO)**, **(NASDAQ: ASML)**, **(NSE: HAL)**. "
        "   - If the company is private or unlisted (e.g. OpenAI, SpaceX, Stripe), clearly state that it is privately held and explain listed companies that provide exposure (e.g. Microsoft for OpenAI, Google/Baillie Gifford for SpaceX) or key public competitors. "
        "   - Mention relevant listed peers, competitors, and supply chain partners across global and domestic markets with tickers in bold. "
        "2. Ground every factual claim, valuation multiple, revenue figure, or contract catalyst in the search results provided or verified market data. "
        "3. When mentioning or recommending stocks, ALWAYS include their exchange and ticker in bold (e.g. **(NYSE: LMT)**, **(NYSE: NVO)**, **(NASDAQ: ASML)**, **(NSE: TCS)**). "
        "4. Differentiate between Short-Term momentum/catalysts (earnings surprises, contract wins, order book backlogs) vs Long-Term compounding (moats, clean balance sheets, return on capital). "
        "5. Format your response in clean GitHub Markdown with headers, bullet points, and a comparison table. "
        "6. Conclude by inviting the user to choose between a quick breakdown or dispatching our 11 autonomous specialist agents for a deep multi-agent institutional report. "
        "7. Never make up financial figures. If the search has numbers, cite them. "
        "8. You are Artha AI Copilot — never say you are OpenAI, Google, or any base LLM."
    )

    prompt_text = (
        f"User Question: {message}"
        f"{history_block}"
        f"{snippets}"
        f"{report_block}"
    )

    if is_mock():
        return (
            f"### 🧠 Artha AI Copilot\n\n"
            f"*(Mock mode — LLM not configured. Web search was used.)*\n\n"
            f"Your query: **{message}**\n\n"
            + (snippets[:1200] if snippets else "No web results available.")
        )

    try:
        llm = get_llm("report_qa", temperature=0.3)
        msgs = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt_text},
        ]
        resp = llm.invoke(msgs)
        return resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:
        logger.warning("Copilot chat LLM failed: %s", exc)
        # Fallback: summarize search results
        if search_results:
            lines = [f"### 🔍 Web Search Results for: *{message}*\n"]
            for r in search_results[:5]:
                lines.append(f"* **{r.get('title','')}** — {(r.get('body') or r.get('snippet') or '')[:300]}")
            lines.append("\n*Tap any suggested stock below to run a full multi-agent research audit.*")
            return "\n".join(lines)
        return f"### ⚠️ Copilot Unavailable\n\nLLM provider is temporarily unavailable. Please try again shortly."


_IS_DISCOVERY_QUERY = re.compile(
    r'(?:which|what|any|recommend|suggest|best|top|good|ideal|cheap|penny|hidden).*'
    r'(?:stock|stocks|share|shares|company|companies|equity).*'
    r'(?:buy|invest|long.?term|short.?term|goal|growth|portfolio|compound|contract|orders?|potential|multibagger|breakout)|'
    r'(?:best|top|which|cheap).*(?:stock|share|company).*(?:for|to)\s+(?:buy|invest|hold)|'
    r'stocks?\s+to\s+buy|where\s+should\s+i\s+invest|best\s+stock\s+to\s+buy|'
    r'top\s+(?:indian|us|global)\s+stocks?|'
    r'small.?cap|mid.?cap|breakout\s+stocks?|penny\s+stocks?|contract\s+win|order\s+book',
    re.I
)

_IS_EDUCATIONAL_QUERY = re.compile(
    r'what\s+is\s+|explain\s+|how\s+(?:does|to|is)\s+|define\s+|meaning\s+of\s+|'
    r'pe\s*ratio|p\/e|roe|roce|ebitda|market\s*cap|dcf|free\s*cash\s*flow|'
    r'dividend\s*yield|eps|earnings\s*per\s*share|bull\s*(?:vs|and)\s*bear|'
    r'debt.to.equity|balance\s*sheet|how\s*to\s*(?:read|analyze|evaluate)',
    re.I
)


@router.post("/chat")
async def copilot_chat(req: ChatRequest):
    """
    Artha AI Copilot chat endpoint with live web search capability.
    
    For discovery/recommendation queries: searches the web, extracts relevant 
    tickers, returns a grounded answer + suggested tickers for auto-research.
    For educational queries: uses LLM with optional web search for context.
    For report Q&A: grounds answer in completed report data.
    """
    message = (req.message or "").strip()
    if not message:
        raise HTTPException(400, "message is required")

    # Refuse non-financial queries
    if not is_financial_or_stock_query(message):
        return ChatResponse(
            answer=(
                "### 🛡️ Out of Scope — Stock Research & Finance Only\n\n"
                "Sorry, as I am a specialized **Stock Researcher System**, I cannot process general "
                "or non-financial requests in a perfect manner.\n\n"
                "However, if your question is related to a **company, stock ticker, financial metric, "
                "valuation, market analysis, or investment concept**, I will answer and analyze it thoroughly!\n\n"
                "---\n\n"
                "**💡 Try asking questions like:**\n"
                "* **Company diligence:** *\"Analyze TCS fundamentals\"*\n"
                "* **Ticker lookup:** *\"What is the ticker for Hindustan Aeronautics?\"*\n"
                "* **Competitor comparison:** *\"Compare Infosys vs Wipro\"*\n"
                "* **Financial concepts:** *\"Explain P/E ratio simply\"*"
            )
        ).model_dump()

    # If anchored to a completed report, check if this is a general discovery question first.
    # Open-ended discovery questions (e.g. "which company is best to invest in short term")
    # should NOT be constrained to the old report unless explicitly asked.
    is_discovery = bool(_IS_DISCOVERY_QUERY.search(message))
    is_educational = bool(_IS_EDUCATIONAL_QUERY.search(message))

    if req.job_id and not is_discovery:
        job = jobs.get(req.job_id)
        if job and job.status == "succeeded":
            report = jobs.get_report(req.job_id)
            if report:
                answer = await asyncio.to_thread(
                    _answer_report_question, message, report, jobs.get_context(req.job_id), req.history
                )
                return ChatResponse(
                    answer=answer.answer,
                    suggested_tickers=[],
                    search_used=False,
                    sources=answer.sources or []
                ).model_dump()

    search_results = []
    search_used = False
    suggested_tickers: list[str] = []

    # Clean search construction without forcing Indian exchanges on global queries
    has_india_context = bool(re.search(r'\b(india|indian|nse|bse|nifty|sensex|inr|rupee|rupees|crore|crores)\b', message, re.I))

    # For discovery queries: ALWAYS search the web
    if is_discovery:
        is_short_term = bool(re.search(r'short.?term|quick|swing|momentum|breakout', message, re.I))
        is_contract_or_smallcap = bool(re.search(r'contract|order|small.?cap|cheap|penny|hidden|potential|multibagger', message, re.I))

        if has_india_context:
            if is_short_term:
                search_query = f"{message} Indian stocks NSE BSE news breakout catalysts"
            elif is_contract_or_smallcap:
                search_query = f"{message} Indian small cap stocks huge contracts orders news growth potential"
            else:
                search_query = f"{message} India NSE fundamentals stocks to buy"
        else:
            if is_short_term:
                search_query = f"{message} stock market news breakout catalysts momentum"
            elif is_contract_or_smallcap:
                search_query = f"{message} small cap growth stocks contracts orders potential"
            else:
                search_query = f"{message} stock market equities fundamentals"

        search_results = await asyncio.to_thread(_chat_web_search, search_query)
        search_used = bool(search_results)
        # Also try a second targeted search if few results
        if not search_results or len(search_results) < 3:
            more_results = await asyncio.to_thread(_chat_web_search, message)
            search_results = search_results + [r for r in more_results if r not in search_results]
            search_used = bool(search_results)
        # Extract tickers from snippets
        combined_text = " ".join(
            (r.get("title", "") + " " + r.get("body", "") + " " + r.get("snippet", ""))
            for r in search_results
        )
        suggested_tickers = _extract_tickers_from_text(combined_text)

    # For educational queries with no specific company: search for context
    elif is_educational and not suggested_tickers:
        search_query = f"{message} Indian stock market NSE" if has_india_context else f"{message} stock market finance"
        search_results = await asyncio.to_thread(_chat_web_search, search_query)
        search_used = bool(search_results)

    # Default / corporate / listing / product inquiries (e.g. "Does F-16 jet company is listed in Stock Market?")
    else:
        search_query = f"{message} stocks India NSE" if has_india_context else f"{message} stock company listing ticker"
        search_results = await asyncio.to_thread(_chat_web_search, search_query)
        search_used = bool(search_results)
        if not search_results or len(search_results) < 2:
            more_results = await asyncio.to_thread(_chat_web_search, message)
            search_results = search_results + [r for r in more_results if r not in search_results]
            search_used = bool(search_results)
        combined_text = " ".join(
            (r.get("title", "") + " " + r.get("body", "") + " " + r.get("snippet", ""))
            for r in search_results
        )
        suggested_tickers = _extract_tickers_from_text(combined_text)

    # Report context if job_id provided (even non-succeeded)
    report = None
    context = None
    if req.job_id:
        report = jobs.get_report(req.job_id)
        context = jobs.get_context(req.job_id)

    # Get LLM answer grounded in search
    answer_text = await asyncio.to_thread(
        _copilot_chat_llm, message, req.history, search_results, report, context
    )

    # Prioritize tickers actually analyzed and cited in the LLM answer
    answer_tickers = _extract_tickers_from_text(answer_text)
    combined_tickers = []
    for t in answer_tickers + suggested_tickers:
        if t not in combined_tickers:
            combined_tickers.append(t)
    suggested_tickers = combined_tickers[:4]

    # Build interactive clarification card asking the user whether they want quick breakdown or full report
    clarification = None
    if is_discovery and suggested_tickers:
        top_ticker = suggested_tickers[0]
        compare_str = " vs ".join(suggested_tickers[:3])
        options = [
            f"🚀 Generate In-Depth Multi-Agent Report on {top_ticker}",
        ]
        if len(suggested_tickers) >= 2:
            options.append(f"⚖️ Compare All in a Multi-Stock Audit ({compare_str})")
        options.append("📰 Audit Latest Contract News & Order Book Catalysts")
        options.append("🎯 Explore Undervalued Small-Caps with High Growth Potential")

        clarification = {
            "prompt": "How would you like to proceed with these candidate opportunities?",
            "options": options,
        }
    elif not clarification:
        org_match = re.search(
            r'(?:tell me about|what is|who is|details on|overview of|research on|analyze|audit|how is|performance of|about)\s+([a-zA-Z0-9&.-]+(?:\s+[a-zA-Z0-9&.-]+){0,2})',
            message,
            re.I
        )
        target_name = None
        if org_match:
            candidate = org_match.group(1).strip().rstrip('?!.,;:')
            stopwords = {'the', 'a', 'an', 'this', 'that', 'pe', 'p/e', 'roe', 'ebitda', 'market', 'stock', 'share', 'what', 'how', 'why'}
            if candidate.lower() not in stopwords and len(candidate) >= 2:
                target_name = candidate.title()
        elif suggested_tickers:
            target_name = suggested_tickers[0]

        if target_name:
            clarification = {
                "prompt": f"Would you like me to create a full multi-agent research report for {target_name}?",
                "options": [
                    f"🚀 Yes, create full research report for {target_name}",
                    f"📊 Check valuation & financial metrics for {target_name}",
                    f"🥊 Compare {target_name} with industry peers",
                    f"⚡ Quick high-level summary of {target_name}",
                ],
            }

    # Build source citations
    sources = [
        {"title": r.get("title", ""), "url": r.get("href") or r.get("url") or ""}
        for r in search_results[:5]
        if r.get("href") or r.get("url")
    ]

    return ChatResponse(
        answer=answer_text,
        suggested_tickers=suggested_tickers,
        search_used=search_used,
        sources=sources,
        clarification=clarification,
    ).model_dump()


@router.post("", status_code=202)
async def start_research(req: ResearchRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(400, "query is required")
    q_clean = req.query.strip()
    if not is_financial_or_stock_query(q_clean):
        raise HTTPException(
            400,
            "Query is outside the scope of ArthaLens equity research. Please ask questions related to stocks, financial metrics, companies, or investment analysis."
        )
    job_id = jobs.create(q_clean)
    task = asyncio.create_task(_run_job(job_id, q_clean, req.document_ids))
    _running_tasks.add(task)
    task.add_done_callback(_on_task_done)
    return {"job_id": job_id, "status": "queued"}


@router.get("/history")
async def research_history(limit: int = 50):
    return [j.model_dump() for j in jobs.history(limit)]


@router.get("/{job_id}")
async def get_research(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job.model_dump()


@router.get("/{job_id}/status")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job.model_dump()


@router.get("/{job_id}/report")
async def get_report(job_id: str):
    if not jobs.get(job_id):
        raise HTTPException(404, "job not found")
    report = jobs.get_report(job_id)
    if not report:
        raise HTTPException(404, "report not ready")
    return report


@router.post("/{job_id}/ask")
async def ask_report(job_id: str, req: ReportQuestion):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "question is required")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job.status != "succeeded":
        raise HTTPException(409, "report is not ready")
    report = jobs.get_report(job_id)
    if not report:
        raise HTTPException(404, "report not ready")
    answer = await asyncio.to_thread(
        _answer_report_question, question, report, jobs.get_context(job_id), req.history)
    return answer.model_dump()


def _resolve_pdf_path(job_id: str) -> tuple[str, str, str]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    real_id = job.job_id
    clean_id = real_id.replace("research_", "")
    input_clean = job_id.replace("research_", "")

    path = jobs.get_pdf_path(real_id) or jobs.get_pdf_path(job_id)

    # Search comprehensive candidate filenames
    if not path or not os.path.exists(path):
        candidates = [
            os.path.join(settings.reports_dir, f"{real_id}.pdf"),
            os.path.join(settings.reports_dir, f"{job_id}.pdf"),
            os.path.join(settings.reports_dir, f"{clean_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_{real_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_research_{clean_id}.pdf"),
            os.path.join(settings.reports_dir, f"arthalens_{clean_id}.pdf"),
            os.path.join(getattr(settings, "base_dir", os.environ.get("BASE_DIR", ".")), f"arthalens_research_{clean_id}.pdf"),
            os.path.join(getattr(settings, "base_dir", os.environ.get("BASE_DIR", ".")), f"arthalens_{real_id}.pdf"),
            f"D:/arthalens_research_{clean_id}.pdf",
            f"D:/arthalens_research_{input_clean}.pdf",
            f"D:/{real_id}.pdf",
            f"D:/{clean_id}.pdf",
        ]
        for cand in candidates:
            if cand and os.path.exists(cand):
                path = cand
                break

    # On-demand PDF generation (or refresh if template is newer than cached PDF)
    needs_render = not path or not os.path.exists(path)
    if not needs_render and path and os.path.exists(path):
        try:
            from ..report import pdf as pdf_mod
            tpl_path = os.path.join(os.path.dirname(pdf_mod.__file__), "templates", "report.html.j2")
            latest_code_mtime = max(
                os.path.getmtime(pdf_mod.__file__),
                os.path.getmtime(tpl_path) if os.path.exists(tpl_path) else 0,
            )
            if os.path.getmtime(path) < latest_code_mtime:
                needs_render = True
        except Exception:
            pass

    if needs_render:
        report_data = jobs.get_report(real_id) or jobs.get_report(job_id)
        if report_data:
            try:
                from ..report.pdf import render_pdf
                from ..schemas.models import ReportJSON
                if isinstance(report_data, dict):
                    validated = ReportJSON.model_validate(report_data)
                else:
                    validated = report_data
                new_path = render_pdf(validated, real_id)
                if new_path and os.path.exists(new_path):
                    path = new_path
                    jobs.attach_report(real_id, report_data, path)
            except Exception as e:
                logger.error("Failed to render PDF on-demand for %s: %s", real_id, e)

    if not path or not os.path.exists(path):
        raise HTTPException(404, "PDF not ready")

    return path, real_id, clean_id


@router.get("/{job_id}/pdf-data")
async def get_pdf_data(job_id: str):
    """Return PDF as Base64 JSON payload.
    
    This completely prevents browser download managers (like IDM) from intercepting
    PDF downloads or popping up download dialogs when users view reports in-app.
    """
    import base64
    path, real_id, clean_id = _resolve_pdf_path(job_id)
    with open(path, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    return {
        "job_id": real_id,
        "clean_id": clean_id,
        "filename": f"arthalens_research_{clean_id}.pdf",
        "size_bytes": len(data),
        "base64": b64,
    }


@router.api_route("/{job_id}/pdf", methods=["GET", "HEAD"])
async def get_pdf(job_id: str, download: bool = False):
    path, real_id, clean_id = _resolve_pdf_path(job_id)

    if download:
        response = FileResponse(
            path,
            media_type="application/pdf",
            content_disposition_type="attachment",
            filename=f"arthalens_research_{clean_id}.pdf",
        )
        response.headers["content-disposition"] = f'attachment; filename="arthalens_research_{clean_id}.pdf"'
    else:
        # Strictly inline with NO filename to prevent Chromium and Edge from triggering automatic downloads
        response = FileResponse(
            path,
            media_type="application/pdf",
            content_disposition_type="inline",
        )
        response.headers["content-disposition"] = "inline"

    response.headers["content-type"] = "application/pdf"
    response.headers["access-control-allow-origin"] = "*"
    response.headers["cache-control"] = "public, max-age=3600"
    return response


@router.get("/{job_id}/charts/{chart_name}")
async def get_chart(job_id: str, chart_name: str):
    chart_clean = os.path.basename(chart_name).replace(".png", "")
    chart_path = os.path.join(settings.reports_dir, "charts", f"{chart_clean}.png")
    if not os.path.exists(chart_path) and chart_clean in ("scorecard", "thematic_balance"):
        alt = "thematic_balance.png" if chart_clean == "scorecard" else "scorecard.png"
        alt_path = os.path.join(settings.reports_dir, "charts", alt)
        if os.path.exists(alt_path):
            chart_path = alt_path
    if not os.path.exists(chart_path):
        raise HTTPException(404, "chart not found")
    return FileResponse(chart_path, media_type="image/png")
