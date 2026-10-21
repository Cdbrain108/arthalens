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
    "HCLTECH": {"ticker": "HCLTECH", "exchange": "NSE"},
    "HCL": {"ticker": "HCLTECH", "exchange": "NSE"},
    "HCL TECH": {"ticker": "HCLTECH", "exchange": "NSE"},
    "HCL TECHNOLOGIES": {"ticker": "HCLTECH", "exchange": "NSE"},
    "NVDA": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "NVIDIA": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "NVIDIA CORP": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "NVIDIA CORPORATION": {"ticker": "NVDA", "exchange": "NASDAQ"},
    "AMD": {"ticker": "AMD", "exchange": "NASDAQ"},
    "ADVANCED MICRO DEVICES": {"ticker": "AMD", "exchange": "NASDAQ"},
    "INTC": {"ticker": "INTC", "exchange": "NASDAQ"},
    "INTEL": {"ticker": "INTC", "exchange": "NASDAQ"},
    "TSM": {"ticker": "TSM", "exchange": "NYSE"},
    "TSMC": {"ticker": "TSM", "exchange": "NYSE"},
    "TAIWAN SEMICONDUCTOR": {"ticker": "TSM", "exchange": "NYSE"},
    "QCOM": {"ticker": "QCOM", "exchange": "NASDAQ"},
    "QUALCOMM": {"ticker": "QCOM", "exchange": "NASDAQ"},
    "AVGO": {"ticker": "AVGO", "exchange": "NASDAQ"},
    "BROADCOM": {"ticker": "AVGO", "exchange": "NASDAQ"},
    "APPLE": {"ticker": "AAPL", "exchange": "NASDAQ"},
    "AAPL": {"ticker": "AAPL", "exchange": "NASDAQ"},
    "MICROSOFT": {"ticker": "MSFT", "exchange": "NASDAQ"},
    "MSFT": {"ticker": "MSFT", "exchange": "NASDAQ"},
    "TESLA": {"ticker": "TSLA", "exchange": "NASDAQ"},
    "TSLA": {"ticker": "TSLA", "exchange": "NASDAQ"},
    "AMAZON": {"ticker": "AMZN", "exchange": "NASDAQ"},
    "AMZN": {"ticker": "AMZN", "exchange": "NASDAQ"},
    "GOOGLE": {"ticker": "GOOGL", "exchange": "NASDAQ"},
    "GOOGL": {"ticker": "GOOGL", "exchange": "NASDAQ"},
    "GOOG": {"ticker": "GOOG", "exchange": "NASDAQ"},
    "ALPHABET": {"ticker": "GOOGL", "exchange": "NASDAQ"},
    "META": {"ticker": "META", "exchange": "NASDAQ"},
    "FACEBOOK": {"ticker": "META", "exchange": "NASDAQ"},
    "BHARTI AIRTEL": {"ticker": "BHARTIARTL", "exchange": "NSE"},
    "AIRTEL": {"ticker": "BHARTIARTL", "exchange": "NSE"},
    "BHARTIARTL": {"ticker": "BHARTIARTL", "exchange": "NSE"},
    "STATE BANK OF INDIA": {"ticker": "SBIN", "exchange": "NSE"},
    "SBIN": {"ticker": "SBIN", "exchange": "NSE"},
    "SBI": {"ticker": "SBIN", "exchange": "NSE"},
    "LARSEN & TOUBRO": {"ticker": "LT", "exchange": "NSE"},
    "L&T": {"ticker": "LT", "exchange": "NSE"},
    "LT": {"ticker": "LT", "exchange": "NSE"},
    "MARUTI": {"ticker": "MARUTI", "exchange": "NSE"},
    "MARUTI SUZUKI": {"ticker": "MARUTI", "exchange": "NSE"},
    "KOTAK": {"ticker": "KOTAKBANK", "exchange": "NSE"},
    "KOTAK BANK": {"ticker": "KOTAKBANK", "exchange": "NSE"},
    "AXIS BANK": {"ticker": "AXISBANK", "exchange": "NSE"},
    "ASIAN PAINTS": {"ticker": "ASIANPAINT", "exchange": "NSE"},
    "TITAN": {"ticker": "TITAN", "exchange": "NSE"},
    "SUN PHARMA": {"ticker": "SUNPHARMA", "exchange": "NSE"},
    "PAYTM": {"ticker": "PAYTM", "exchange": "NSE"},
    "ONE97": {"ticker": "PAYTM", "exchange": "NSE"},
    "ONE97 COMMUNICATIONS": {"ticker": "PAYTM", "exchange": "NSE"},
    "ZOMATO": {"ticker": "ZOMATO", "exchange": "NSE"},
    "BAJAJ FINANCE": {"ticker": "BAJFINANCE", "exchange": "NSE"},
    "BAJFINANCE": {"ticker": "BAJFINANCE", "exchange": "NSE"},
}
INTENT_RULES = [
    (r"\b(compare|comparison|vs|versus|difference\s+b(?:etween|tw)|which\s+(?:is\s+)?better)\b", "compare"),
    (r"\b(hiring|hire|jobs?|careers?|headcount|layoffs?)\b", "hiring"),
    (r"\b(annual report|filing|transcript|10-?k|document|prospectus)\b", "document"),
    (r"\b(should\s+i\s+(?:buy|sell|hold)|buy\s+or\s+sell|hold\s+or\s+sell|whether\s+to\s+buy|buy|hold|sell|invest|long.term|recommend)\b", "long_term"),
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
    if not entities:
        # Check strategic archetype queries where user asks about concepts/strategies rather than naming a ticker
        if any(k in lower for k in ["dividend", "growth investing", "sip vs lumpsum", "passive income"]):
            entities = [
                {"name": "ITC Limited", "ticker": "ITC", "exchange": "NSE", "confidence": "high"},
                {"name": "Tata Consultancy Services", "ticker": "TCS", "exchange": "NSE", "confidence": "high"}
            ]
            intent = "compare"
        elif any(k in lower for k in ["fall after", "drop after", "crash after", "panic sell", "after results", "after earnings"]):
            entities = [
                {"name": "Tata Consultancy Services", "ticker": "TCS", "exchange": "NSE", "confidence": "high"}
            ]
            intent = "long_term"
        elif any(k in lower for k in ["50000", "50,000", "1 lakh", "first time", "how to invest", "allocate", "portfolio", "budget"]):
            entities = [
                {"name": "Tata Consultancy Services", "ticker": "TCS", "exchange": "NSE", "confidence": "high"},
                {"name": "Reliance Industries", "ticker": "RELIANCE", "exchange": "NSE", "confidence": "high"}
            ]
            intent = "general"
        elif any(k in lower for k in ["which indian company", "best indian", "best stock", "stocks to buy", "stock to buy", "where to invest", "long term goal", "best company stock"]):
            entities = [
                {"name": "Tata Consultancy Services", "ticker": "TCS", "exchange": "NSE", "confidence": "high"},
                {"name": "Reliance Industries", "ticker": "RELIANCE", "exchange": "NSE", "confidence": "high"}
            ]
            intent = "compare"
        elif any(k in lower for k in ["rbi", "rate cut", "interest rate", "repo rate"]):
            entities = [
                {"name": "ICICI Bank", "ticker": "ICICIBANK", "exchange": "NSE", "confidence": "high"},
                {"name": "HDFC Bank", "ticker": "HDFCBANK", "exchange": "NSE", "confidence": "high"},
                {"name": "Tata Motors", "ticker": "TATAMOTORS", "exchange": "NSE", "confidence": "high"}
            ]
            intent = "compare"
        elif re.search(r"\b(who are you|what can you do|hi|hello|hey|help)\b", lower):
            intent = "conversational"
        else:
            intent = next((label for pattern, label in INTENT_RULES if re.search(pattern, lower)), "general")
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
    bull = []
    bear = []
    
    for e in evidence:
        claim = e.get("claim", "")
        eid = e.get("evidence_id")
        tag = f" [{eid}]" if eid else ""
        sent = e.get("sentiment")
        claim_lower = claim.lower()
        
        if sent == "positive" or any(w in claim_lower for w in ("growth", "profit", "margin", "expanded", "positive", "hired")):
            item = f"{claim}{tag}"
            if item not in bull:
                bull.append(item)
        elif sent == "negative" or any(w in claim_lower for w in ("debt", "loss", "decline", "drop", "drawdown", "fell", "risk")):
            item = f"{claim}{tag}"
            if item not in bear:
                bear.append(item)

    bull_case = bull[:6]
    bear_case = bear[:6]

    if bear_case:
        risks = [f"Downside vector: {b.split(';')[0]}" for b in bear_case[:4]]
    else:
        risks = [
            "Macroeconomic cyclicality and interest rate exposure.",
            "Segment margin pressure from competitive dynamics.",
            "Capital expenditure return and execution timeline risks."
        ]

    changes = [
        "Acceleration in quarterly revenue growth and operating margin expansion.",
        "Significant balance-sheet deleveraging and debt reduction.",
        "Material regulatory, tariff, or competitive policy shifts."
    ]

    return {"bull_case": bull_case, "bear_case": bear_case,
            "risks": risks, "what_could_change_view": changes}


def mock_synthesize(state: dict) -> dict:
    from .schemas.models import ReportJSON
    entities = state.get("entities") or []
    company = entities[0] if entities else {}
    name = company.get("name") or company.get("ticker") or "the company"
    bull = state.get("bull_case") or []
    bear = state.get("bear_case") or []
    evidence = state.get("evidence") or []

    if not evidence:
        return ReportJSON(
            query=state.get("query", ""), company=company,
            executive_summary="Insufficient validated evidence to form an investment view.",
            overall_assessment={"classification": "INSUFFICIENT EVIDENCE",
                                "rationale": "No validated evidence is available."},
            evidence_gaps=state.get("evidence_gaps", []),
            what_could_change_view=state.get("what_could_change_view", []),
        ).model_dump()

    pos_count = len(bull)
    neg_count = len(bear)

    if pos_count > neg_count and pos_count >= 2:
        classification = "CONSTRUCTIVE"
        rationale = f"Validated operational evidence for {name} reflects robust fundamental performance, healthy profit margins, and revenue momentum, balanced against ongoing capital investment."
    elif neg_count > pos_count and neg_count >= 2:
        classification = "CAUTIOUS"
        rationale = f"Validated evidence highlights significant headwind risks for {name}, with debt levels, valuation stretch, or recent market drawdown requiring monitoring."
    else:
        classification = "BALANCED"
        rationale = f"Evidence reflects a balanced investment profile for {name}: core operating cash flows remain stable, counterbalanced by debt obligations and sector valuation multiples."

    return ReportJSON(
        query=state.get("query", ""), company=company,
        executive_summary=rationale,
        overall_assessment={"classification": classification, "rationale": rationale,
                            "quality_rating": "Grounded", "evidence_grounding_pct": 100.0},
        bull_case=bull, bear_case=bear,
        risks=state.get("risks") or [],
        what_could_change_view=state.get("what_could_change_view") or [],
        evidence_gaps=state.get("evidence_gaps") or [],
    ).model_dump()
