"""LLM-free helpers. They consume real tool results; they never create market data.

The historical `mock` provider name is retained for configuration compatibility.
Tests must mock data tools explicitly; this provider alone does not imply offline.
"""
import re

KNOWN_COMPANIES = {
    "TATA CONSULTANCY SERVICES": {"ticker": "TCS", "exchange": "NSE"},
    "TCS": {"ticker": "TCS", "exchange": "NSE"},
    "INFOSYS": {"ticker": "INFY", "exchange": "NSE"},
    "INFY": {"ticker": "INFY", "exchange": "NSE"},
    "RELIANCE": {"ticker": "RELIANCE", "exchange": "NSE"},
    "HDFC BANK": {"ticker": "HDFCBANK", "exchange": "NSE"},
    "HDFCBANK": {"ticker": "HDFCBANK", "exchange": "NSE"},
    "ICICI BANK": {"ticker": "ICICIBANK", "exchange": "NSE"},
    "TATA MOTORS": {"ticker": "TATAMOTORS", "exchange": "NSE"},
    "TATA STEEL": {"ticker": "TATASTEEL", "exchange": "NSE"},
    "TATA POWER": {"ticker": "TATAPOWER", "exchange": "NSE"},
    "WIPRO": {"ticker": "WIPRO", "exchange": "NSE"},
    "ITC": {"ticker": "ITC", "exchange": "NSE"},
    "SBI": {"ticker": "SBIN", "exchange": "NSE"},
    "HCLTECH": {"ticker": "HCLTECH", "exchange": "NSE"},
    "NVIDIA": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "NVDA": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "APPLE": {"ticker": "AAPL", "exchange": "NASDAQ"},
    "AAPL": {"ticker": "AAPL", "exchange": "NASDAQ"},
    "MICROSOFT": {"ticker": "MSFT", "exchange": "NASDAQ"},
    "MSFT": {"ticker": "MSFT", "exchange": "NASDAQ"},
    "TESLA": {"ticker": "TSLA", "exchange": "NASDAQ"},
    "TSLA": {"ticker": "TSLA", "exchange": "NASDAQ"},
    "AMAZON": {"ticker": "AMZN", "exchange": "NASDAQ"},
    "AMZN": {"ticker": "AMZN", "exchange": "NASDAQ"},
}
INTENT_RULES = [
    (r"\b(compare|comparison|vs|versus)\b", "compare"),
    (r"\b(hiring|hire|jobs?|careers?|headcount|layoffs?)\b", "hiring"),
    (r"\b(annual report|filing|transcript|10-?k|document|prospectus)\b", "document"),
    (r"\b(buy|hold|sell|invest|long.term|recommend)\b", "long_term"),
    (r"\b(fundamentals?|valuation|financials?)\b", "general"),
    (r"\b(price|moved?|intraday|why.*(?:fall|rise|drop))\b", "price_move"),
    (r"\b(news|headlines?|latest|updates?|announcements?|happened|developments?)\b", "news"),
]
MOCK_PLAN = {
    "conversational": [], "price_move": ["market", "news"],
    "long_term": ["financial", "valuation", "market", "news", "growth", "risk"],
    "general": ["market", "news", "financial"], "hiring": ["workforce", "news"],
    "compare": ["financial", "valuation", "market", "risk"],
    "document": ["document", "financial", "risk"], "news": ["news"],
}


def mock_analyze(query: str) -> dict:
    upper, lower = query.upper(), query.lower().strip()
    entities, seen = [], set()
    for name, info in KNOWN_COMPANIES.items():
        if re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", upper) and info["ticker"] not in seen:
            seen.add(info["ticker"])
            exchange = "BSE" if re.search(r"\bBSE\b|\.BO\b", upper) else info["exchange"]
            if info["ticker"] in {"INFY", "WIPRO"} and re.search(r"\b(ADR|NYSE)\b", upper):
                exchange = "NYSE"
            entities.append({"name": name.title(), **info, "exchange": exchange, "confidence": "high"})
    for ticker, suffix in re.findall(r"\b([A-Z0-9&-]+)\.(NS|BO)\b", upper):
        if ticker not in seen:
            entities.append({"name": ticker, "ticker": ticker,
                             "exchange": "NSE" if suffix == "NS" else "BSE", "confidence": "medium"})
            seen.add(ticker)
    if not entities and re.fullmatch(r"(?:hi|hello|hey|help|who are you|what can you do)[!?. ]*", lower):
        intent = "conversational"
    else:
        intent = next((label for pattern, label in INTENT_RULES if re.search(pattern, lower)), "general")
    horizon = re.search(r"(\d+)\s*-?\s*years?", lower)
    return {"entities": entities, "intent": intent,
            "time_horizon": f"{horizon[1]}y" if horizon else "5y" if "five year" in lower else None,
            "compare_mode": intent == "compare" or len(entities) > 1}


def mock_plan(intent: str, compare_mode: bool = False) -> dict:
    from .graph.routing import ALL_AGENTS, ROUTING_TABLE
    selected = [a for a in ALL_AGENTS if a in ROUTING_TABLE.get(intent, ROUTING_TABLE['general'])['min']]
    return {"steps": [f"Run {name} agent" for name in selected], "selected_agents": selected,
            "required_evidence": [], "rationale": "Deterministic routing; no language model required."}


def mock_challenge(evidence: list, query: str) -> dict:
    # A neutral fact does not become a bullish/bearish fact by its list position.
    def side(sentiment):
        return [f"{e['claim']} [{e['evidence_id']}]" for e in evidence
                if e.get("sentiment") == sentiment and e.get("evidence_id")][:6]
    return {"bull_case": side("positive"), "bear_case": side("negative"),
            "risks": [], "what_could_change_view": []}


def mock_synthesize(state: dict) -> dict:
    from .schemas.models import ReportJSON
    entities = state.get("entities") or []
    return ReportJSON(
        query=state.get("query", ""), company=entities[0] if entities else {},
        executive_summary="Research collected. Review the cited evidence and gaps.",
        overall_assessment={"classification": "NOT ASSESSED",
                            "rationale": "No model-backed investment classification was established."},
        bull_case=state.get("bull_case", []), bear_case=state.get("bear_case", []),
        evidence_gaps=state.get("evidence_gaps", []),
    ).model_dump()
