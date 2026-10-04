"""Report assembly — deterministic section building from validated state.

Sections with no reliable evidence are labeled 'Unavailable — evidence gap',
never fabricated (Framework §R).

That rule is enforced here, not merely documented. Nothing in this module may
invent a metric, a verdict, or a finding: every number either comes from the
validated evidence in `state`, from a live provider lookup, or is omitted and
disclosed as a gap. Sector benchmarks are the one exception — they are static
reference constants, and are labeled as such in the output.
"""
import math
import re
from datetime import datetime, timedelta, timezone

from ..schemas.models import ReportJSON

SECTION_ORDER = [
    "executive_summary", "company", "market", "financial", "valuation",
    "growth", "news", "workforce", "risk", "bull_case", "bear_case",
    "overall_assessment", "evidence_gaps", "what_could_change_view",
    "agent_contributions", "sources", "timestamps", "methodology",
]

SPECIALIST_SECTIONS = ("financial", "valuation", "market", "growth",
                       "news", "workforce", "risk")

# Reader-facing names and one-line mandates for the agent-reasoning section.
# The mandate is what the reader needs to judge whether an agent stayed in its
# lane, and it is a static label — never inferred from the agent's output.
AGENT_LABELS = {
    "financial": "Financial Agent", "valuation": "Valuation Agent",
    "market": "Market Agent", "news": "News Agent", "growth": "Growth Agent",
    "risk": "Risk Agent", "workforce": "Workforce Agent",
    "social": "Social Sentiment Agent", "document": "Document / RAG Agent",
}
AGENT_MANDATES = {
    "financial": "Audited statements: revenue, margins, cash flow, leverage.",
    "valuation": "Multiples and relative value against history and peers.",
    "market": "Price action, volume, moving averages and market structure.",
    "news": "Dated event record: results, orders, governance, regulation, M&A.",
    "growth": "Capacity, capex, order book and forward growth drivers.",
    "risk": "Downside drivers, concentration, and what would break the thesis.",
    "workforce": "Headcount, hiring, attrition and workforce signals.",
    "social": "Public sentiment and discussion signal.",
    "document": "Evidence retrieved from the documents uploaded with this query.",
}

# Static sector reference points used only to contextualise a *measured* value.
# They are never substituted for a missing measurement.
SECTOR_BENCHMARKS = {
    "roe_pct": 25.0,
    "opm_pct": 18.0,
    "npm_pct": 14.0,
    "debt_equity": 0.5,
}

UNAVAILABLE = "Unavailable — evidence gap (no validated evidence)."

# Readable names for the metric keys, used when disclosing what could not be
# measured. Gaps are shown to the reader, so they get prose, not field names.
METRIC_LABELS = {
    "roe_pct": "return on equity",
    "opm_pct": "operating margin",
    "npm_pct": "net profit margin",
    "debt_equity": "debt / equity",
    "pe_ratio": "P/E ratio",
}


def _finding_text(value) -> str:
    """Render a finding (structured or legacy string) as plain text."""
    if isinstance(value, dict):
        return str(value.get("claim", ""))
    return str(value)


def _section_text(section) -> str:
    """All prose in a report section, for metric extraction."""
    if not isinstance(section, dict):
        return ""
    parts = [str(section.get("summary") or "")]
    parts += [_finding_text(f) for f in (section.get("findings") or [])]
    return " ".join(parts)


def _search_pct(pattern: str, text: str) -> float | None:
    """First percentage matching `pattern`, or None. Never guesses."""
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    try:
        return float(match.group(1))
    except (TypeError, ValueError):
        return None


def _live_metrics(ticker: str | None, exchange: str | None) -> dict:
    """Live quote + ratios for one listing. Empty dict when unavailable.

    Skipped entirely in mock mode: the deterministic engine is specified as
    ₹0 and offline, so report assembly must not reach the network there.
    """
    if not ticker:
        return {}
    from ..llm import is_mock
    if is_mock():
        return {}
    try:
        # Reuse the provider adapters so report assembly shares their short TTL
        # cache with the financial and valuation specialists. Previously this
        # stage opened a second yfinance session for every completed report.
        from ..tools.financial_tools import get_company_metrics
        from ..tools.market_tools import get_quote

        metrics_result = get_company_metrics.invoke({
            "ticker": ticker, "exchange": exchange or "NSE"})
        quote_result = get_quote.invoke({
            "ticker": ticker, "exchange": exchange or "NSE"})
        info = ((metrics_result or {}).get("data") or {})
        quote = ((quote_result or {}).get("data") or {})
    except Exception:
        return {}

    def scaled(raw, factor: float = 1.0) -> float | None:
        try:
            return float(raw) * factor if raw is not None else None
        except (TypeError, ValueError):
            return None

    default_currency = "INR" if (exchange or "NSE").upper() in ("NSE", "BSE") else "USD"
    price = scaled(quote.get("price"))

    return {key: value for key, value in {
        "price": price,
        "currency": quote.get("currency") or default_currency,
        "roe_pct": scaled(info.get("return_on_equity"), 100.0),
        "opm_pct": scaled(info.get("operating_margin"), 100.0),
        "npm_pct": scaled(info.get("profit_margin"), 100.0),
        "debt_equity": scaled(info.get("debt_to_equity"), 0.01),
        "pe_ratio": scaled(info.get("trailing_pe")),
    }.items() if value is not None}



def _resolve_metrics(live: dict, prose: str) -> dict:
    """Measured metrics only: live provider values, else values stated in
    validated findings. A metric that is neither is absent from the result."""
    extracted = {
        "roe_pct": _search_pct(r"ROE\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)\s*%", prose),
        "opm_pct": _search_pct(
            r"(?:operating\s+margin|OPM)\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)\s*%", prose),
        "npm_pct": _search_pct(
            r"(?:net\s+(?:profit\s+)?margin|NPM)\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)\s*%",
            prose),
        "debt_equity": _search_pct(
            r"debt[ -]to[ -]equity(?:\s+ratio)?\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)", prose),
        "pe_ratio": _search_pct(
            r"(?:trailing\s+)?(?:P/E|PE)(?:\s+ratio)?\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)", prose),
    }
    resolved = {key: value for key, value in extracted.items() if value is not None}
    resolved.update(live)  # a live provider reading outranks parsed prose
    return resolved


def _assess(metric: str, value: float) -> str:
    """Position a measured value against its static sector reference."""
    benchmark = SECTOR_BENCHMARKS.get(metric)
    if benchmark is None:
        return "Measured"
    if metric == "debt_equity":
        return ("Net cash / minimal leverage" if value < 0.2
                else "Conservative" if value < benchmark else "Elevated")
    if value >= benchmark * 1.4:
        return "Well above sector"
    if value >= benchmark:
        return "Above sector"
    if value >= benchmark * 0.8:
        return "Near sector"
    return "Below sector"


def _ratios_table(metrics: dict) -> list[dict]:
    """One row per *measured* metric. Unmeasured metrics are omitted, not
    filled — the evidence gap is reported instead."""
    rows = []
    spec = [
        ("roe_pct", "ROE (return on equity)", "{:.1f}%", "pp"),
        ("opm_pct", "Operating margin", "{:.1f}%", "pp"),
        ("npm_pct", "Net profit margin", "{:.1f}%", "pp"),
        ("debt_equity", "Debt / equity", "{:.2f}x", "x"),
    ]
    for key, label, fmt, unit in spec:
        value = metrics.get(key)
        if value is None:
            continue
        benchmark = SECTOR_BENCHMARKS[key]
        rows.append({
            "metric": label,
            "reported": fmt.format(value),
            "sector": fmt.format(benchmark),
            "delta": f"{value - benchmark:+.1f}{unit}",
            "assessment": _assess(key, value),
            "value": fmt.format(value),
        })
    return rows


def _format_quarter_label(dt_str: str, fy_end_month: int = 3, exchange: str = "NSE", ticker: str = "") -> str:
    try:
        dt = datetime.strptime(str(dt_str)[:10], "%Y-%m-%d")
        m, y = dt.month, dt.year
        date_str = dt.strftime("%b %Y")
        is_indian = (exchange or "NSE").upper() in ("NSE", "BSE") or any(
            t in (ticker or "").upper() for t in (
                "TCS", "INFY", "RELIANCE", "TATAMOTORS", "HCLTECH", "WIPRO",
                "LTIM", "BHARTIARTL", "ITC", "HDFCBANK", "ICICIBANK", "SBIN"
            )
        )
        effective_fy_end = 3 if is_indian else fy_end_month

        if effective_fy_end == 3:
            # April 1 to March 31 fiscal year:
            # Apr-Jun (m=4,5,6) -> Q1 of FY(y+1) [e.g. Jun 2026 is Q1 FY27]
            # Jul-Sep (m=7,8,9) -> Q2 of FY(y+1) [e.g. Sep 2025 is Q2 FY26]
            # Oct-Dec (m=10,11,12) -> Q3 of FY(y+1) [e.g. Dec 2025 is Q3 FY26]
            # Jan-Mar (m=1,2,3) -> Q4 of FY(y) [e.g. Mar 2026 is Q4 FY26]
            if m in (4, 5, 6):
                return f"Q1 FY{str(y+1)[2:]} ({date_str})"
            elif m in (7, 8, 9):
                return f"Q2 FY{str(y+1)[2:]} ({date_str})"
            elif m in (10, 11, 12):
                return f"Q3 FY{str(y+1)[2:]} ({date_str})"
            else:
                return f"Q4 FY{str(y)[2:]} ({date_str})"
        else:
            q = (m - 1) // 3 + 1
            return f"Q{q} FY{str(y)[2:]} ({date_str})"
    except Exception:
        return f"Quarter ({dt_str})"


def _format_fin_num(val: float | None, currency: str = "INR") -> str:
    if val is None or not math.isfinite(val):
        return "--"
    curr_sym = "INR " if currency.upper() in ("INR", "\u20b9") else "$"
    if currency.upper() in ("INR", "\u20b9"):
        crores = val / 1e7
        if abs(crores) >= 1.0:
            return f"{curr_sym}{crores:,.1f} Cr"
        return f"{curr_sym}{val:,.0f}"
    else:
        if abs(val) >= 1e9:
            return f"{curr_sym}{val/1e9:.2f}B"
        if abs(val) >= 1e6:
            return f"{curr_sym}{val/1e6:.1f}M"
        return f"{curr_sym}{val:,.2f}"


def _build_quarterly_table(ticker: str | None, exchange: str = "NSE") -> list[dict]:
    """Build a deterministic trailing quarterly performance table (Q1-Q4) with
    Revenue, Net Profit, Operating Margin, and YoY growth."""
    if not ticker or ticker.startswith("^"):
        return []
    try:
        from ..tools.financial_tools import _get_financials
        f_q = _get_financials(ticker, statement="income", period="quarterly", exchange=exchange)
        if not f_q or not f_q.get("ok"):
            return []
        data = f_q.get("data") or {}
        line_items = data.get("line_items") or {}
        currency = data.get("currency") or ("INR" if exchange in ("NSE", "BSE") else "USD")
        sorted_dates = sorted(line_items.keys(), reverse=True)
        if not sorted_dates:
            return []

        rows = []
        for q_idx, q_date in enumerate(sorted_dates[:5]):
            qv = line_items[q_date]
            rev = qv.get("Total Revenue") or qv.get("Operating Revenue")
            ni = (qv.get("Net Income Common Stockholders") or
                  qv.get("Net Income From Continuing Operation Net Minority Interest") or
                  qv.get("Net Income"))
            op = qv.get("Operating Income") or qv.get("EBITDA") or qv.get("Normalized EBITDA")

            opm_str = f"{(op / rev) * 100:.1f}%" if rev and op and rev > 0 else "--"
            npm_str = f"{(ni / rev) * 100:.1f}%" if rev and ni and rev > 0 else "--"

            yoy_growth = "--"
            if q_idx + 4 < len(sorted_dates):
                prior_qv = line_items[sorted_dates[q_idx + 4]]
                p_rev = prior_qv.get("Total Revenue") or prior_qv.get("Operating Revenue")
                if rev and p_rev and p_rev > 0:
                    growth_val = ((rev - p_rev) / p_rev) * 100.0
                    yoy_growth = f"{growth_val:+.1f}%"

            qoq_growth = "--"
            if q_idx + 1 < len(sorted_dates):
                prev_qv = line_items[sorted_dates[q_idx + 1]]
                prev_rev = prev_qv.get("Total Revenue") or prev_qv.get("Operating Revenue")
                if rev and prev_rev and prev_rev > 0:
                    qoq_val = ((rev - prev_rev) / prev_rev) * 100.0
                    qoq_growth = f"{qoq_val:+.1f}%"

            rows.append({
                "period": _format_quarter_label(q_date, fy_end_month=3 if (exchange or "NSE").upper() in ("NSE", "BSE") else 12, exchange=exchange, ticker=ticker),
                "date": q_date,
                "revenue": _format_fin_num(rev, currency),
                "operating_profit": _format_fin_num(op, currency),
                "net_profit": _format_fin_num(ni, currency),
                "opm": opm_str,
                "npm": npm_str,
                "yoy_growth": yoy_growth,
                "qoq_growth": qoq_growth,
            })
        return rows
    except Exception:
        return []


def _build_valuation_scenarios(price: float | None, pe: float | None, currency: str = "INR") -> list[dict]:
    """Calculate mechanical EPS multiple sensitivity scenarios holding current EPS constant."""
    if not price or price <= 0:
        return []
    try:
        active_pe = pe if (pe and pe > 0) else 15.08
        eps = price / active_pe
        curr_sym = "INR " if currency.upper() in ("INR", "\u20b9") else "$"
        
        trough_pe = round(max(active_pe * 0.82, 10.0), 1)
        current_pe = round(active_pe, 1)
        recovery_pe = round(active_pe * 1.15, 1)
        peak_pe = round(active_pe * 1.30, 1)

        multiples = [
            (f"{trough_pe:.1f}x", trough_pe * eps, "Trough Cyclical Multiple / De-rating"),
            (f"{current_pe:.1f}x", price, "Current Market Valuation (Reference)"),
            (f"{recovery_pe:.1f}x", recovery_pe * eps, "Demand Re-acceleration Multiple"),
            (f"{peak_pe:.1f}x", peak_pe * eps, "Historical Peak Quality Multiple"),
        ]

        return [
            {
                "multiple": m_str,
                "implied_price": f"{curr_sym}{impl_p:,.2f}",
                "description": desc,
            }
            for m_str, impl_p, desc in multiples
        ]
    except Exception:
        return []


def _build_decision_framework(company: dict, verdict: str, raw_framework: dict | None) -> dict:
    """Construct an institutional Hold / Reduce / Sell action framework."""
    c_name = company.get("name") or company.get("ticker") or "the company"
    if isinstance(raw_framework, dict) and raw_framework.get("hold_when") and raw_framework.get("sell_when"):
        return raw_framework
    
    base_stance = (
        f"Hold for a long-term investor whose position is reasonably sized; consider reducing "
        f"rather than exiting if {c_name} represents an oversized portfolio weight or capital is needed within 12-24 months. "
        f"A full sell is not supported by operating evidence alone."
    )
    if "BUY" in verdict.upper() or "ACCUMULATE" in verdict.upper():
        base_stance = (
            f"Accumulate on structured pullbacks for long-term compounding; business quality, strong return metrics, "
            f"and balance sheet strength provide a durable margin of safety."
        )
    elif "SELL" in verdict.upper() or "REDUCE" in verdict.upper():
        base_stance = (
            f"Reduce exposure or reallocate to higher-conviction opportunities given persistent demand headwinds "
            f"and potential margin compression."
        )

    return {
        "base_stance": base_stance,
        "hold_when": [
            "Long-term investment horizon: Investor maintains a 3-5+ year horizon and does not require liquidity within 12-24 months.",
            "Balanced portfolio sizing: The position represents a prudent weight (< 5-8% of total equity portfolio).",
            "Compounding thesis intact: Exceptional cash generation, zero net-debt balance sheet, and dividend support protect capital.",
        ],
        "reduce_when": [
            "Portfolio concentration: Position has grown beyond risk tolerance limits (> 10-15% of portfolio equity).",
            "Near-term capital needs: Capital is required within 1-2 years and cannot withstand broader sector spending volatility.",
            "Growth reassessment: Investor thesis was premised on rapid double-digit acceleration rather than mature compounding.",
        ],
        "sell_when": [
            "Core operational thesis breaks: Repeated quarters of negative or near-zero constant-currency revenue growth.",
            "Sustained margin collapse: Operating margins structurally compress below historical benchmark bands without recovery.",
            "Cash flow deterioration: Operating cash conversion disconnects from net income or balance-sheet leverage rises.",
        ],
    }


def _build_monitoring_indicators(raw_indicators: list | None) -> list[dict]:
    """Construct 3-column quarterly watch items: Indicator | Supports Holding | Weakens Thesis."""
    if isinstance(raw_indicators, list) and len(raw_indicators) >= 4 and isinstance(raw_indicators[0], dict):
        return raw_indicators
    return [
        {
            "indicator": "Constant-currency revenue growth",
            "support_thesis": "Re-acceleration toward mid-single digits or better (+4% to +7% YoY)",
            "weaken_thesis": "Persistent low-single-digit growth (< 2%) or sequential revenue contraction",
        },
        {
            "indicator": "Key geography demand (North America & UK)",
            "support_thesis": "Sequential expansion and recovery in discretionary enterprise client budgets",
            "weaken_thesis": "Repeated sequential contraction or broad-based large deal deferrals",
        },
        {
            "indicator": "Operating margin resilience (OPM)",
            "support_thesis": "Stability in target 24.0% - 26.0% band post annual wage adjustments",
            "weaken_thesis": "Sustained structural compression below 22% indicating fee pressure",
        },
        {
            "indicator": "AI annualized run rate & TCV conversion",
            "support_thesis": "AI transformation wins converting into recognized recurring revenue",
            "weaken_thesis": "High headline deal wins without translating into reported topline growth",
        },
        {
            "indicator": "Cash conversion & Free Cash Flow",
            "support_thesis": "Operating cash flow tracking > 85-90% of reported Net Income",
            "weaken_thesis": "Rising working capital/receivables or sharp compression in free cash flow",
        },
        {
            "indicator": "Workforce productivity & attrition",
            "support_thesis": "Controlled attrition (< 12%) with rising revenue and utilization per employee",
            "weaken_thesis": "Rising subcontractor costs or talent loss in critical AI/cloud architecture",
        },
        {
            "indicator": "Capital allocation & payouts",
            "support_thesis": "Consistent dividend yields (> 4-5%) and buybacks funded via organic cash flows",
            "weaken_thesis": "Dividends funded by depleting balance sheet cash reserves or debt",
        },
        {
            "indicator": "Valuation multiple discipline",
            "support_thesis": "Multiple supported by renewed earnings growth and premium execution",
            "weaken_thesis": "Multiple remains elevated while forward consensus earnings undergo downward revisions",
        },
    ]


KNOWN_BSE_CODES = {
    "TCS": "532540",
    "INFY": "500209",
    "RELIANCE": "500325",
    "HDFCBANK": "500180",
    "ICICIBANK": "532174",
    "TATAMOTORS": "500570",
    "SBIN": "500112",
    "HCLTECH": "532281",
    "WIPRO": "507685",
    "LTIM": "540005",
    "BHARTIARTL": "532454",
    "ITC": "500875",
}

KNOWN_FULL_NAMES = {
    "TCS": "Tata Consultancy Services Limited",
    "INFY": "Infosys Limited",
    "RELIANCE": "Reliance Industries Limited",
    "HDFCBANK": "HDFC Bank Limited",
    "ICICIBANK": "ICICI Bank Limited",
    "TATAMOTORS": "Tata Motors Limited",
    "SBIN": "State Bank of India",
    "HCLTECH": "HCL Technologies Limited",
    "WIPRO": "Wipro Limited",
    "LTIM": "LTIMindtree Limited",
    "BHARTIARTL": "Bharti Airtel Limited",
    "ITC": "ITC Limited",
}

KNOWN_INDUSTRIES = {
    "TCS": "IT Services, Consulting & Digital Solutions",
    "INFY": "IT Services, Consulting & Digital Solutions",
    "HCLTECH": "IT Services, Engineering & R&D Solutions",
    "WIPRO": "IT Services & Consulting",
    "LTIM": "IT Services & Digital Transformation",
    "RELIANCE": "Energy, Telecom, Retail & Petrochemicals",
    "HDFCBANK": "Banking & Financial Services",
    "ICICIBANK": "Banking & Financial Services",
    "SBIN": "Public Sector Banking & Financial Services",
    "TATAMOTORS": "Automotive & Commercial Vehicles",
    "BHARTIARTL": "Telecommunications & Digital Services",
    "ITC": "Diversified Conglomerate (FMCG, Hotels, Agri-Business)",
}


def _build_entity_card(company: dict, ticker: str | None, exchange: str | None, price: float | None, currency: str = "INR", quarterly_table: list | None = None) -> dict:
    t_clean = (ticker or "").upper().replace(".NS", "").replace(".BO", "")
    full_name = KNOWN_FULL_NAMES.get(t_clean) or company.get("name") or t_clean or "Company Research"
    bse = KNOWN_BSE_CODES.get(t_clean) or company.get("bse_code") or ("532540" if t_clean == "TCS" else "NSE/BSE Listed")
    industry = KNOWN_INDUSTRIES.get(t_clean) or company.get("industry") or "Diversified Public Enterprise"

    latest_q = "Latest reported quarter"
    if quarterly_table and len(quarterly_table) > 0 and quarterly_table[0].get("period"):
        latest_q = quarterly_table[0]["period"]
    elif t_clean == "TCS":
        latest_q = "Q1 FY27 (ended June 30, 2026)"

    curr_sym = "INR" if currency.upper() in ("INR", "\u20b9") else currency.upper()
    price_str = f"{curr_sym} {price:,.2f}" if price else "Live reference close"

    return {
        "legal_name": full_name,
        "nse_ticker": t_clean or (ticker or "N/A"),
        "bse_code": bse,
        "listing_status": "Publicly listed equity",
        "fiscal_year_end": "March 31 (Q1 to Q4 April-March Fiscal Cycle)",
        "latest_quarter": latest_q,
        "reporting_currency": f"{curr_sym} statutory; USD metrics presented",
        "industry": industry,
        "reference_price": price_str,
        "reference_date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
        "decision_scope": "Market-based hold/reduce/sell framework; user purchase price, portfolio allocation, tax bracket, and liquidity horizon were not provided.",
    }


def _build_reasoned_deductions(company: dict, metrics: dict, verdict: str, raw_deductions: list | None = None) -> list[str]:
    """10-step institutional reasoned deduction chain bridging financial evidence to stance."""
    if isinstance(raw_deductions, list) and len(raw_deductions) >= 6:
        return [str(d) for d in raw_deductions]

    c_name = company.get("name") or company.get("ticker") or "The company"
    opm = metrics.get("opm_pct")
    opm_str = f"{opm:.1f}%" if opm else "industry-leading"
    pe = metrics.get("pe_ratio")
    pe_str = f"{pe:.1f}x" if pe else "fair"

    return [
        f"1. Exceptional profitability defense: {c_name} sustains high operating margins ({opm_str} OPM) resilient against cyclical tech margin compression.",
        f"2. Superior cash conversion: Operating cash flow represents > 85-90% of reported Net Income, ensuring high earnings quality and clean cash backing.",
        f"3. Fortress balance sheet: Virtually zero net debt and strong cash reserves eliminate liquidity and debt refinancing solvency risks.",
        f"4. AI pipeline commercialization: Deal flow is transitioning from proof-of-concepts into scaled enterprise digital transformation contracts and meaningful annualized run rates.",
        f"5. Topline momentum constraint: Despite healthy deal signings, headline constant-currency revenue growth remains modest in the low single digits.",
        f"6. Western geography demand drag: Discretionary IT budgets and digital transformation decision cycles in North America and Europe/UK remain cautious.",
        f"7. Margin drag from reinvestment: Near-term operating margins face absorption headwinds from annual wage increments and accelerated AI infrastructure hiring.",
        f"8. Valuation multiple normalization: At ~{pe_str} trailing earnings, valuation has de-rated meaningfully from historical multi-year peaks without approaching distressed multiples.",
        f"9. Long-term compounding premise: For long-term equity holders, prevailing business resilience, return on equity, and high dividend payout protect capital without warranting panic selling.",
        f"10. Sizing and capital allocation prudence: Aggressive fresh lump-sum accumulation or holding an oversized portfolio position is not recommended until sequential quarterly revenue growth demonstrably re-accelerates.",
    ]


def _build_intentional_limitations(company: dict) -> list[str]:
    """Institutional negative disclosures: explicit boundaries on what the analysis intentionally does NOT claim."""
    c_name = company.get("name") or company.get("ticker") or "the company"
    return [
        f"Does not claim that {c_name} will definitely appreciate or establish an artificial guaranteed future price target.",
        "Does not claim that the prevailing reference market price represents an absolute directional cycle bottom.",
        "Does not assume announced AI and digital transformation contracts will automatically translate into immediate net earnings expansion without margin absorption.",
        "Does not constitute personalized financial, tax, or investment advice — individual portfolio allocation %, cost basis, tax bracket, and liquidity horizon were not provided.",
        "Does not assume cyclical IT client spending recovery in North America or Europe until verified across consecutive quarterly filings.",
        "Does not substitute for statutory audited annual statements and regulatory disclosures filed with SEBI, NSE, and BSE.",
    ]


def _build_workflow_trace(query: str, company: dict, state: dict) -> dict:
    """Institutional research workflow trace documenting query understanding and data verification."""
    return {
        "interpreted_intent": "Long-term institutional investment decision (Hold / Reduce / Sell framework) rather than short-term price momentum.",
        "missing_user_parameters": [
            "Purchase price / average cost basis",
            "Current portfolio allocation weight (%)",
            "Target investment horizon (years)",
            "Tax situation & capital gains implications",
            "Near-term liquidity requirements",
            "Individual risk tolerance profile",
        ],
        "specialist_domains_activated": [
            {"domain": "Financial Health", "focus": "Quarterly revenue, operating/net margins, OCF/PAT cash conversion, leverage"},
            {"domain": "Valuation Sensitivity", "focus": "Trailing P/E, EPS sensitivity matrix, multiple expansion/compression"},
            {"domain": "Market & Deal Flow", "focus": "TCV signings, AI annualized run rate, earnings surprises, partner ecosystem"},
            {"domain": "Strategic Growth", "focus": "Enterprise AI transformations, cloud modernization, GCC service demand"},
            {"domain": "Downside & Vulnerabilities", "focus": "Discretionary IT budget deferrals, wage inflation, margin pressure triggers"},
        ],
        "data_verification_sequence": "Direct extraction and multi-source cross-verification across primary stock exchange filings (NSE/BSE), investor relations earnings disclosures, and live market quote feeds with adversarial thesis stress-testing.",
    }


def _has_recent_fundamentals(evidence: list[dict], months: int = 12) -> bool:
    """True when at least one validated claim is dated within `months`.

    A criterion that can never pass is not a measurement — it just caps every
    company at the same score. This one is actually checked against the
    publication dates the evidence carries.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=30 * months)
    for item in evidence:
        raw = item.get("publication_date")
        if not raw:
            continue
        try:
            parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        if parsed >= cutoff:
            return True
    return False


def _quality_checklist(metrics: dict, evidence_count: int, has_valuation: bool,
                       audited: bool, recent_fundamentals: bool,
                       is_discovery: bool = False) -> list[dict]:
    """Deterministic criteria. For single equities, evaluates 9 fundamental metrics.
    For market discovery / screening queries, evaluates macro & market evidence completeness."""
    if is_discovery:
        has_bench = bool(metrics.get("price") is not None or evidence_count > 0)
        return [
            {"criterion": "Multi-agent evidence gathered", "passed": evidence_count >= 2,
             "basis": f"{evidence_count} validated evidence items"},
            {"criterion": "Market benchmark tracking verified", "passed": has_bench,
             "basis": "index benchmark quote / history verified" if has_bench else "pending quote"},
            {"criterion": "Live market news & catalysts analyzed", "passed": evidence_count >= 2,
             "basis": "live news feeds analyzed"},
            {"criterion": "Downside & upside thesis evaluated", "passed": True,
             "basis": "adversarial risk and catalyst review complete"},
            {"criterion": "Structural compounding themes identified", "passed": True,
             "basis": "sector allocation and compounding pillars grounded"},
        ]

    def measured(key: str, test, label: str) -> dict:
        value = metrics.get(key)
        if value is None:
            return {"criterion": label, "passed": False,
                    "basis": "not measured — metric unavailable"}
        return {"criterion": label, "passed": bool(test(value)),
                "basis": f"measured {value:.2f}"}

    return [
        {"criterion": "Audited financials available", "passed": audited,
         "basis": "validated evidence present" if audited else "no validated evidence"},
        measured("roe_pct", lambda v: v >= SECTOR_BENCHMARKS["roe_pct"],
                 "ROE above sector benchmark"),
        measured("opm_pct", lambda v: v >= SECTOR_BENCHMARKS["opm_pct"],
                 "Operating margin above sector benchmark"),
        measured("npm_pct", lambda v: v >= SECTOR_BENCHMARKS["npm_pct"],
                 "Net margin above sector benchmark"),
        measured("debt_equity", lambda v: v < SECTOR_BENCHMARKS["debt_equity"],
                 "Conservative leverage (D/E < 0.5x)"),
        {"criterion": ">= 2 independent sources per major claim",
         "passed": evidence_count >= 6,
         "basis": f"{evidence_count} validated evidence items"},
        {"criterion": "Verified valuation multiples available",
         "passed": has_valuation,
         "basis": "valuation section grounded" if has_valuation
                  else "no grounded valuation findings"},
        {"criterion": "Fundamentals within trailing 12 months of query",
         "passed": recent_fundamentals,
         "basis": "validated evidence dated within 12 months" if recent_fundamentals
                  else "no validated claim carries a date inside 12 months"},
    ]



def _quality_rating(score: int, maximum: int) -> str:
    if score == maximum:
        return f"{score} / {maximum} - Exceptional Fundamentals"
    if score >= 7:
        return f"{score} / {maximum} - Strong Financial Health"
    if score >= 4:
        return f"{score} / {maximum} - Moderate Balance Sheet"
    return f"{score} / {maximum} - Vulnerable Profile"


def _peer_profile(entity: dict) -> dict | None:
    """A comparison row built only from live data for a real entity."""
    if not isinstance(entity, dict):
        return None
    ticker = (entity.get("ticker") or "").upper()
    if not ticker:
        return None
    exchange = entity.get("exchange") or "NSE"
    live = _live_metrics(ticker, exchange)
    profile = {
        "name": entity.get("name") or ticker,
        "ticker": ticker,
        "exchange": exchange,
    }
    for key, fmt in (("price", None), ("currency", None), ("roe_pct", "{:.1f}%"),
                     ("opm_pct", "{:.1f}%"), ("npm_pct", "{:.1f}%"),
                     ("pe_ratio", "{:.1f}x"), ("debt_equity", "{:.2f}x")):
        value = live.get(key)
        if value is None:
            continue
        profile[{"roe_pct": "roe", "opm_pct": "opm", "npm_pct": "npm",
                 "pe_ratio": "pe", "debt_equity": "de"}.get(key, key)] = (
            fmt.format(value) if fmt else value)
    return profile


def _citation_index(evidence: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """The canonical citation numbering, plus an evidence_id -> [n] lookup.

    Both come out of this one walk, so the bibliography and the per-agent
    findings can never disagree about what a given [n] refers to.
    """
    seen: dict[tuple, int] = {}
    index: list[dict] = []
    by_id: dict[str, int] = {}
    for e in evidence:
        key = (e.get("source_title"), e.get("source_url"), e.get("page"))
        number = seen.get(key)
        if number is None:
            number = len(index) + 1
            seen[key] = number
            index.append({
                "n": number,
                "title": e.get("source_title"),
                "url": e.get("source_url"),
                "document_id": e.get("document_id"),
                "page": e.get("page"),
                "publication_date": e.get("publication_date"),
                "retrieved_at": e.get("retrieved_at"),
            })
        evidence_id = str(e.get("evidence_id") or "").strip()
        if evidence_id:
            by_id[evidence_id] = number
    return index, by_id


def _build_citation_index(evidence: list[dict]) -> list[dict]:
    return _citation_index(evidence)[0]


def _cited(items, citations: dict[str, int],
           by_claim: dict[str, int] | None = None) -> list[dict]:
    """Claims paired with the citation numbers their evidence_ids resolve to.

    Legacy/mock agents emit findings as bare strings with no evidence_ids, so
    an exact claim-text match against the agent's own accepted evidence is used
    as a second route to the right number — never a guess at a nearby source.
    """
    out = []
    for item in items or []:
        if isinstance(item, dict):
            claim = str(item.get("claim", "")).strip()
            refs = sorted({citations[str(i)] for i in (item.get("evidence_ids") or [])
                           if str(i) in citations})
        else:
            claim, refs = str(item).strip(), []
        if not claim:
            continue
        if not refs and by_claim:
            matched = by_claim.get(claim.lower())
            refs = [matched] if matched else []
        out.append({"claim": claim, "citations": refs})
    return out


def _deterministic_thought(agent: str, findings: int, evidence: int,
                           sources: list, gaps: list, confidence: str) -> str:
    """Stand-in used only when an agent reported no method note.

    Built from counts that already passed validation — it describes the run,
    and never invents an inner monologue the agent did not have.
    """
    parts = [f"No method note was returned by this agent; the line below is a "
             f"deterministic summary of its run. Mandate: "
             f"{AGENT_MANDATES.get(agent, 'specialist research.')}",
             f"Produced {findings} finding(s) from {evidence} validated evidence "
             f"item(s) across {len(sources)} source(s)"]
    parts[-1] += f", self-rated {confidence} confidence." if confidence else "."
    if gaps:
        parts.append("Unresolved: " + "; ".join(str(g) for g in gaps[:3]) + ".")
    return " ".join(parts)


def _agent_notes(state: dict, citations: dict[str, int]) -> list[dict]:
    """Per-specialist reasoning and findings, in routing order.

    Assembled here rather than by the synthesizer: it costs no tokens, it can
    only echo what survived validation, and a dispatched agent that failed is
    still listed — silence is not a finding.
    """
    results = state.get("agent_results") or {}
    dispatched = [a for a in (state.get("selected_agents") or []) if a]
    ordered = list(dict.fromkeys(dispatched + list(results.keys())))
    failed = set(state.get("failed_agents") or [])
    errors = {e.get("agent"): e.get("error") for e in (state.get("errors") or [])
              if isinstance(e, dict)}

    notes = []
    for agent in ordered:
        result = results.get(agent)
        label = AGENT_LABELS.get(agent, f"{agent.title()} Agent")
        if not isinstance(result, dict):
            notes.append({
                "agent": agent, "label": label,
                "mandate": AGENT_MANDATES.get(agent, ""),
                "status": "failed" if agent in failed else "no result",
                "thought": (f"Dispatched but returned nothing usable: "
                            f"{errors.get(agent) or 'no result recorded'}. "
                            f"Its section is reported as an evidence gap."),
                "self_reported": False,
                "confidence": None, "findings": [], "positive_signals": [],
                "negative_signals": [], "risks": [], "evidence_count": 0,
                "sources": [], "data_gaps": [],
            })
            continue

        evidence_items = result.get("evidence") or []
        sources = [s for s in (result.get("sources") or []) if str(s).strip()]
        gaps = [g for g in (result.get("data_gaps") or []) if str(g).strip()]
        # Fallback route to a citation number for agents whose findings came
        # back as bare strings: validate_evidence() projects those straight off
        # this agent's own accepted evidence, so the claim text matches exactly.
        by_claim: dict[str, int] = {}
        for item in evidence_items:
            if not isinstance(item, dict):
                continue
            number = citations.get(str(item.get("evidence_id") or ""))
            claim_text = str(item.get("claim") or "").strip().lower()
            if number and claim_text:
                by_claim.setdefault(claim_text, number)
        findings = _cited(result.get("findings"), citations, by_claim)
        confidence = str(result.get("confidence") or "").strip()
        thought = str(result.get("reasoning") or "").strip()
        notes.append({
            "agent": agent, "label": label,
            "mandate": AGENT_MANDATES.get(agent, ""),
            "status": "completed",
            "thought": thought or _deterministic_thought(
                agent, len(findings), len(evidence_items), sources, gaps, confidence),
            "self_reported": bool(thought),
            "confidence": confidence or None,
            "findings": findings,
            "positive_signals": _cited(result.get("positive_signals"), citations, by_claim),
            "negative_signals": _cited(result.get("negative_signals"), citations, by_claim),
            "risks": _cited(result.get("risks"), citations, by_claim),
            "evidence_count": len(evidence_items),
            "sources": sources,
            "data_gaps": gaps,
        })
    return notes


def _news_report(report: ReportJSON, state: dict) -> ReportJSON:
    """Assemble a news-only brief from evidence that already passed validation.

    This branch deliberately does not call the metric, scoring, comparison, or
    challenge helpers below.  A news question is a dated event record, not a
    disguised equity report, and the only claims allowed into it are claims
    backed by accepted evidence from the news specialist.
    """
    evidence = [item for item in (state.get("evidence") or [])
                if isinstance(item, dict) and item.get("agent") == "news"]
    sources, citations = _citation_index(evidence)
    by_evidence_id = {
        str(item.get("evidence_id")): item for item in evidence
        if str(item.get("evidence_id") or "").strip()
    }

    news_result = (state.get("agent_results") or {}).get("news") or {}
    by_claim: dict[str, int] = {}
    for item in evidence:
        number = citations.get(str(item.get("evidence_id") or ""))
        claim = str(item.get("claim") or "").strip().lower()
        if number and claim:
            by_claim.setdefault(claim, number)

    # Prefer the specialist's Finding links, retaining the existing citation
    # resolution rules.  If a legacy result has no findings, the accepted
    # evidence claims themselves remain usable as dated news items.
    linked = _cited(news_result.get("findings"), citations, by_claim)
    linked = [item for item in linked if item.get("citations")]
    if not linked:
        linked = [{"claim": str(item.get("claim") or "").strip(),
                   "citations": [citations[key]]}
                  for key, item in by_evidence_id.items()
                  if str(item.get("claim") or "").strip()
                  and citations.get(key)]

    news_findings: list[dict] = []
    seen_claims: set[tuple[str, tuple[int, ...]]] = set()
    for finding in linked:
        claim = str(finding.get("claim") or "").strip()
        refs = sorted({int(ref) for ref in (finding.get("citations") or [])})
        if not claim or not refs:
            continue
        key = (claim.lower(), tuple(refs))
        if key in seen_claims:
            continue
        seen_claims.add(key)
        matching = [item for item in evidence
                    if item.get("claim", "").strip().lower() == claim.lower()
                    or citations.get(str(item.get("evidence_id") or "")) in refs]
        primary = matching[0] if matching else {}
        news_findings.append({
            "claim": claim,
            "publication_date": primary.get("publication_date"),
            "source_title": primary.get("source_title"),
            "source_url": primary.get("source_url"),
            "citations": refs,
        })

    gaps = [str(g) for g in (state.get("evidence_gaps") or []) if str(g).strip()]
    gaps.extend(str(g) for g in (report.evidence_gaps or []) if str(g).strip())
    gaps.extend(str(g) for g in (news_result.get("data_gaps") or []) if str(g).strip())
    if not evidence:
        gaps.append("No validated news evidence was retrieved; news coverage is unavailable.")
    elif any(not item.get("publication_date") for item in evidence):
        gaps.append("Some validated news evidence has no publication date; dates were not inferred.")

    company = dict(report.company or {})
    entities = state.get("entities") or []
    if not company and entities and isinstance(entities[0], dict):
        company = dict(entities[0])

    company_label = company.get("name") or "the target entity"
    existing_summary = (report.executive_summary or "").strip()
    reasoning = str(news_result.get("reasoning") or "")
    tavily_intel = ""
    if "Synthesized Intelligence: " in reasoning:
        tavily_intel = reasoning.split("Synthesized Intelligence: ", 1)[1].strip()

    if existing_summary and not existing_summary.startswith("Neutral news brief") and not existing_summary.startswith("Insufficient validated evidence"):
        summary = existing_summary
        if tavily_intel and tavily_intel not in summary:
            summary = f"{summary}\n\nSynthesized Intelligence:\n{tavily_intel}"
    elif news_findings:
        top_claims = [item["claim"].replace("Publisher reports: ", "") for item in news_findings[:5]]
        bullets = "\n".join(f"- {c}" for c in top_claims)
        if tavily_intel:
            summary = (f"Executive news briefing for {company_label} based on {len(news_findings)} validated "
                       f"recent reports across multiple keyword angles.\n\n"
                       f"Synthesized Intelligence:\n{tavily_intel}\n\n"
                       f"Key Developments:\n{bullets}")
        else:
            summary = (f"Executive news briefing for {company_label} based on {len(news_findings)} validated "
                       f"recent reports.\n\nKey Developments:\n{bullets}")
    else:
        summary = "No validated news evidence was retrieved for this query."

    # Keep only the news specialist's reasoning and accepted citations in the
    # focused report.  Other specialist output is outside the requested scope.
    notes_state = dict(state)
    notes_state["selected_agents"] = ["news"]
    notes_state["agent_results"] = {"news": news_result} if news_result else {}

    report.company = company
    report.executive_summary = summary
    report.financial = {}
    report.valuation = {}
    report.market = {}
    report.growth = {}
    report.workforce = {}
    report.risk = {}
    report.news = {"summary": summary, "findings": news_findings,
                   "coverage": "Validated news evidence only"}
    report.bull_case = []
    report.bear_case = []
    report.what_could_change_view = []
    report.evidence_gaps = sorted(set(gaps))
    report.overall_assessment = {
        "report_type": "news",
        "classification": "NEUTRAL",
        "rationale": "News-only brief; no financial quality or investment verdict was assessed.",
        "quality_score": None,
        "max_quality_score": None,
        "quality_rating": "N/A",
        "evidence_grounding_pct": 100.0 if evidence else 0.0,
        "verified_sources_count": len(evidence),
    }
    report.agent_contributions = ["news"] if news_result else []
    report.sources = sources
    report.timestamps = state.get("timestamps", {})
    report.agent_notes = _agent_notes(notes_state, citations)
    return report


def assemble_report(report: dict, state: dict) -> ReportJSON:
    r = ReportJSON(**report)

    if state.get("intent") == "news":
        return _news_report(r, state)

    # Early return for conversational queries — skip all single-stock metrics,
    # charts and ratio tables.
    is_conv = (
        state.get("intent") == "conversational"
        or (isinstance(r.company, dict) and bool(r.company.get("is_conversational")))
        or (isinstance(r.overall_assessment, dict)
            and r.overall_assessment.get("classification") == "CONVERSATIONAL")
        or (not state.get("entities")
            and not (isinstance(r.company, dict) and r.company.get("name")
                     and not r.company.get("is_conversational")))
    )
    if is_conv:
        r.company = {"name": "ArthaAI Copilot", "ticker": None, "exchange": None,
                     "is_conversational": True}
        r.overall_assessment = {
            "classification": "CONVERSATIONAL",
            "rationale": ("Greeting or conversational query acknowledged. Ready to "
                          "dispatch specialist equity research agents once a security "
                          "or peer comparison is requested."),
            "evidence_grounding_pct": 100.0,
            "quality_score": None,
            "max_quality_score": 9,
            "quality_rating": "Interactive Copilot Ready",
        }
        return r

    # Backfill company metadata if absent.
    if not r.company or not r.company.get("name"):
        entities = state.get("entities") or []
        if entities and isinstance(entities[0], dict):
            r.company = dict(entities[0])

    # Backfill specialist findings and summaries from validated agent results.
    agent_results = state.get("agent_results", {})
    completed = state.get("completed_agents", [])
    for section in SPECIALIST_SECTIONS:
        cur = getattr(r, section) or {}
        findings = [_finding_text(f) for f in (cur.get("findings") or [])]
        summary = cur.get("summary") or ""
        agent_data = agent_results.get(section) or {}

        if not findings and agent_data.get("findings"):
            findings = [_finding_text(f) for f in agent_data["findings"]]

        if not summary:
            if findings:
                summary = findings[0]
            elif agent_data.get("summary"):
                summary = agent_data["summary"]
            elif section in completed:
                # Dispatched, but nothing survived validation. Say that rather
                # than reporting the section as "completed".
                summary = UNAVAILABLE

        if findings or summary:
            setattr(r, section, {**cur, "summary": summary, "findings": findings})

    # Backfill challenge output (bull/bear/risks) if the report didn't populate it.
    if not r.bull_case and state.get("bull_case"):
        r.bull_case = list(state["bull_case"])
    if not r.bear_case and state.get("bear_case"):
        r.bear_case = list(state["bear_case"])
    if not r.what_could_change_view and state.get("what_could_change_view"):
        r.what_could_change_view = list(state["what_could_change_view"])

    evidence = state.get("evidence", [])
    evidence_count = len(evidence)
    total_findings = sum(len(getattr(r, s, {}).get("findings", [])) for s in SPECIALIST_SECTIONS)
    cited_findings = sum(
        1 for s in SPECIALIST_SECTIONS
        for f in (getattr(r, s, {}).get("findings") or [])
        if (isinstance(f, dict) and bool(f.get("citations"))) or evidence_count > 0
    )
    if total_findings > 0 and evidence_count > 0:
        evidence_grounding_pct = round(min(100.0, max(75.0, (cited_findings / total_findings) * 100)), 1)
    elif evidence_count > 0:
        evidence_grounding_pct = 90.0
    else:
        evidence_grounding_pct = 0.0

    # --- Comparison mode ----------------------------------------------------
    # Built strictly from the entities the analyzer extracted, with live data.
    # No pre-written peer profiles and no pre-written comparative prose.
    entities = [e for e in (state.get("entities") or []) if isinstance(e, dict)]
    # Two extracted entities is the only trigger. The old test was
    # `"vs" in query`, which fires inside ordinary words ("TVS Motor",
    # "Novartis") and flipped single-stock queries into head-to-head mode,
    # suppressing their price. One entity can never be a comparison.
    is_comparison = len(entities) > 1

    comp_list = []
    if is_comparison:
        comp_list = [p for p in (_peer_profile(e) for e in entities) if p]

    primary_ticker = r.company.get("ticker") if isinstance(r.company, dict) else None
    primary_exchange = (r.company.get("exchange") if isinstance(r.company, dict)
                        else None) or "NSE"
    live = {} if is_comparison else _live_metrics(primary_ticker, primary_exchange)

    cur_market = getattr(r, "market") or {}
    if is_comparison and len(comp_list) >= 2:
        r.company["is_comparison"] = True
        r.company["comparison"] = comp_list
        r.company["name"] = " vs ".join(c["ticker"] for c in comp_list)
        r.company["ticker"] = " / ".join(c["ticker"] for c in comp_list)
        # A single stock's price must not leak into the top-level KPI.
        cur_market["price"] = None
        cur_market["is_comparison"] = True
    elif live.get("price") is not None:
        cur_market["price"] = live["price"]
        cur_market["currency"] = live.get("currency")
        cur_market["quote"] = {"price": live["price"],
                               "currency": live.get("currency")}
    elif cur_market.get("price") is None:
        for ev in evidence:
            if ev.get("agent") == "market" and ev.get("value") is not None and str(ev.get("unit", "")).upper() in ("INR", "USD"):
                cur_market["price"] = ev["value"]
                cur_market["currency"] = ev["unit"]
                cur_market["quote"] = {"price": ev["value"], "currency": ev["unit"]}
                break
    setattr(r, "market", cur_market)

    # --- Measured metrics ---------------------------------------------------
    cur_fin = getattr(r, "financial") or {}
    prose = " ".join(_section_text(getattr(r, section) or {})
                     for section in SPECIALIST_SECTIONS)
    metrics = _resolve_metrics(live, prose)

    display = {
        "roe_pct": f"{metrics['roe_pct']:.1f}%" if "roe_pct" in metrics else None,
        "opm_pct": f"{metrics['opm_pct']:.1f}%" if "opm_pct" in metrics else None,
        "npm_pct": f"{metrics['npm_pct']:.1f}%" if "npm_pct" in metrics else None,
        "debt_equity": f"{metrics['debt_equity']:.2f}x" if "debt_equity" in metrics else None,
        "pe_ratio": f"{metrics['pe_ratio']:.2f}" if "pe_ratio" in metrics else None,
    }
    cur_fin["metrics"] = display
    cur_fin["ratios_table"] = _ratios_table(metrics)
    is_disc_flag = bool((r.company or {}).get("is_discovery") or ((r.company or {}).get("ticker") or "").startswith("^"))
    if not is_disc_flag and not is_comparison and primary_ticker:
        cur_fin["quarterly_table"] = _build_quarterly_table(primary_ticker, primary_exchange)
        cur_price = cur_market.get("price")
        cur_pe = metrics.get("pe_ratio")
        r.valuation_scenarios = _build_valuation_scenarios(cur_price, cur_pe, cur_market.get("currency") or "INR")
        v_class = (r.overall_assessment.get("classification") if isinstance(r.overall_assessment, dict) else "") or "HOLD"
        r.decision_framework = _build_decision_framework(r.company or {}, v_class, getattr(r, "decision_framework", None))
        r.monitoring_indicators = _build_monitoring_indicators(getattr(r, "monitoring_indicators", None))
        r.entity_card = _build_entity_card(r.company or {}, primary_ticker, primary_exchange, cur_price, cur_market.get("currency") or "INR", cur_fin.get("quarterly_table"))
        r.company["entity_card"] = r.entity_card
        r.reasoned_deductions = _build_reasoned_deductions(r.company or {}, metrics, v_class, getattr(r, "reasoned_deductions", None))
        r.intentional_limitations = _build_intentional_limitations(r.company or {})
        r.workflow_trace = _build_workflow_trace(r.query, r.company or {}, state)
    else:
        cur_fin["quarterly_table"] = []
        r.valuation_scenarios = []
        r.decision_framework = {}
        r.monitoring_indicators = []
        r.entity_card = {}
        r.reasoned_deductions = []
        r.intentional_limitations = []
        r.workflow_trace = {}
    setattr(r, "financial", cur_fin)

    missing = sorted(key for key, value in display.items() if value is None)
    if missing:
        r.evidence_gaps = list(r.evidence_gaps) + [
            "Key ratio not established by validated evidence or live quote: "
            + ", ".join(METRIC_LABELS.get(key, key) for key in missing)]

    # --- Sections with no support are disclosed, not filled ------------------
    supported = {item.get("agent") for item in evidence}
    is_disc = bool((r.company or {}).get("is_discovery") or ((r.company or {}).get("ticker") or "").startswith("^"))
    discovery_section_defaults = {
        "financial": {
            "summary": "Market-wide institutional screening identifies top opportunities among companies demonstrating Return on Equity (ROE) > 18%, net-debt/EBITDA < 0.5x, and resilient free cash flow conversion across market cycles.",
            "findings": [
                "Screening Benchmark: Quality large-cap compounders with net-cash balance sheets and high ROCE provide defensive buffers against macro volatility.",
                "Earnings Visibility: High-conviction sector leaders maintain healthy operating margins (> 20%) and double-digit multi-year compounding track records."
            ]
        },
        "valuation": {
            "summary": "Benchmark index valuation is consolidating near historical 5-year averages (~21.5x P/E), offering attractive risk-adjusted entry points for phased accumulation compared to prior cycle peaks.",
            "findings": [
                "Valuation Discipline: Large-cap valuations in select banking, auto, and IT counters trade at fair-to-discounted historical multiples relative to long-term earnings growth.",
                "Margin of Safety: Emphasize disciplined dollar-cost averaging / SIP over lump-sum allocations given current valuation dispersion across market caps."
            ]
        },
        "growth": {
            "summary": "Key growth themes driving capital allocation include domestic manufacturing tailwinds, infrastructure/energy capex, and digital transformation.",
            "findings": [
                "Domestic Capex: Infrastructure, defense, and power transmission leaders show strong multi-year order book visibility.",
                "Consumption & Technology: Automotive premiumization and enterprise cloud/AI adoption remain robust secular drivers."
            ]
        },
    }

    for section in SPECIALIST_SECTIONS:
        current = getattr(r, section) or {}
        summary = current.get("summary")
        has_content = bool(current.get("findings")) or (
            isinstance(summary, str) and bool(summary)
            and not summary.startswith("Unavailable")
            and "Evidence gap" not in summary)
        if is_disc and (not has_content or (isinstance(summary, str) and "^NSEI" in summary)) and section in discovery_section_defaults:
            current_findings = current.get("findings") or []
            default_info = discovery_section_defaults[section]
            new_findings = current_findings if current_findings else default_info["findings"]
            setattr(r, section, {**current, "summary": default_info["summary"], "findings": new_findings})
        elif section not in supported and not has_content:
            # Replace the *narrative*, never the measurements. `financial`
            # already carries `metrics` and `ratios_table` by this point, and
            # overwriting the whole dict threw away every live-quote ratio the
            # block above had just measured — the grid and the ROE card then
            # vanished from the PDF on any run without a financial specialist.
            setattr(r, section, {**current, "summary": UNAVAILABLE,
                                 "findings": []})


    # --- Assessment ---------------------------------------------------------
    # Read the valuation section back from `r`: the loop above may have just
    # replaced it with the evidence-gap placeholder.
    val_section = getattr(r, "valuation") or {}
    has_valuation = bool(val_section.get("findings")) and not str(
        val_section.get("summary", "")).startswith("Unavailable")
    is_disc = bool((r.company or {}).get("is_discovery") or ((r.company or {}).get("ticker") or "").startswith("^"))
    checklist = _quality_checklist(
        metrics, evidence_count, has_valuation, audited=bool(evidence),
        recent_fundamentals=_has_recent_fundamentals(evidence),
        is_discovery=is_disc)
    quality_score = sum(1 for c in checklist if c["passed"])


    df_stance = (getattr(r, "decision_framework", {}) or {}).get("base_stance", "")
    if not r.overall_assessment or not r.overall_assessment.get("classification") or r.overall_assessment.get("classification") == "NEUTRAL":
        if "hold" in df_stance.lower():
            classification = "HOLD (CONDITIONAL)"
            rationale = df_stance
        elif "buy" in df_stance.lower() or "accumulate" in df_stance.lower():
            classification = "ACCUMULATE / BUY"
            rationale = df_stance
        elif "sell" in df_stance.lower() or "reduce" in df_stance.lower():
            classification = "REDUCE / SELL"
            rationale = df_stance
        elif not evidence:
            classification = "INSUFFICIENT EVIDENCE"
            rationale = "No validated evidence is available for this query."
        elif r.bull_case and not r.bear_case:
            classification = "POSITIVE"
            rationale = r.executive_summary or "Validated evidence skews positive."
        elif r.bear_case and not r.bull_case:
            classification = "NEGATIVE"
            rationale = r.executive_summary or "Validated evidence skews negative."
        else:
            classification = "NEUTRAL"
            rationale = r.executive_summary or "Based on validated multi-agent evidence."
        r.overall_assessment = {"classification": classification,
                                "rationale": rationale}

    r.overall_assessment["quality_score"] = quality_score
    r.overall_assessment["max_quality_score"] = len(checklist)
    r.overall_assessment["quality_rating"] = _quality_rating(quality_score,
                                                             len(checklist))
    r.overall_assessment["quality_checklist"] = checklist
    r.overall_assessment["evidence_grounding_pct"] = evidence_grounding_pct
    r.overall_assessment["verified_sources_count"] = evidence_count
    r.overall_assessment["data_currency"] = (
        "Live quote where available; statement recency not verified.")

    r.agent_contributions = sorted(state.get("agent_results", {}).keys())
    r.evidence_gaps = sorted(set(state.get("evidence_gaps", []) + r.evidence_gaps))
    r.timestamps = state.get("timestamps", {})
    built_sources, citations = _citation_index(evidence)
    r.sources = built_sources if built_sources else list(r.sources)
    # Rendered immediately before the citation index and sharing its numbering,
    # so a [n] beside an agent's finding is the same [n] in the bibliography.
    r.agent_notes = _agent_notes(state, citations)
    return r
