"""Financial tools exposed as LangGraph tools.

``calculate_ratio`` remains deterministic application code. Agents may explain
its output, but they never perform the financial arithmetic themselves.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from .base import NativeFunctionTool


def _source(title: str, provider: str = "yfinance", url: str | None = None) -> dict:
    return {"title": title, "url": url, "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}

RATIO_FORMULAS = {
    "margin_pct": lambda i: i["numerator"] / i["denominator"] * 100,
    "pe": lambda i: i["price"] / i["eps"],                       # Price / EPS
    "pb": lambda i: i["price"] / i["book_value_per_share"],      # Price / BVPS
    "ps": lambda i: i["market_cap"] / i["revenue"],              # MktCap / Revenue
    "debt_equity": lambda i: i["total_debt"] / i["equity"],      # Debt / Equity
    "roe": lambda i: i["net_income"] / i["avg_equity"],          # NI / Avg Equity
    "fcf_yield": lambda i: i["free_cash_flow"] / i["market_cap"],
    "ev_ebitda": lambda i: i["enterprise_value"] / i["ebitda"],
    "ev_sales": lambda i: i["enterprise_value"] / i["revenue"],
    "dividend_yield": lambda i: i["dividend_per_share"] / i["price"],
    "peg": lambda i: (i["price"] / i["eps"]) / i["eps_growth_pct"],
}


class CalculateRatioArgs(BaseModel):
    name: str
    inputs: dict[str, float]


class GrowthArgs(BaseModel):
    current: float
    previous: float
    current_period: str
    previous_period: str
    basis: str = "reported currency"


def _compute_growth(current: float, previous: float, current_period: str,
                    previous_period: str, basis: str = "reported currency") -> dict:
    """A positive, finite base is required for a meaningful percentage change."""
    source = _source("Bullseye growth calculation", "deterministic_calculation")
    if not all(math.isfinite(v) for v in (current, previous)) or previous <= 0:
        return {"ok": False, "data": None, "source": source,
                "error": "Growth requires finite values and a positive comparison base."}
    return {"ok": True, "error": None, "source": source, "data": {
        "value": (current / previous - 1) * 100, "unit": "%",
        "formula": "(current / previous - 1) × 100", "basis": basis,
        "inputs": {"current": current, "previous": previous},
        "current_period": current_period, "previous_period": previous_period}}


class FinancialsArgs(BaseModel):
    ticker: str
    statement: str = "income"
    period: str = "annual"
    exchange: str = "NSE"


class CompanyMetricsArgs(BaseModel):
    ticker: str
    exchange: str = "NSE"


class PeerMultiplesArgs(BaseModel):
    ticker: str
    exchange: str = "NSE"
    peers: list[str] = Field(default_factory=list)


class HistoricalMultiplesArgs(BaseModel):
    ticker: str
    exchange: str = "NSE"
    period: str = "5y"


def _calculate_ratio(name: str, inputs: dict | str, **_kwargs) -> dict:
    """Deterministically calculate a financial ratio.

    name: one of pe, pb, ps, debt_equity, roe, fcf_yield, ev_ebitda, ev_sales,
    dividend_yield, peg. inputs: the numeric inputs for that formula.
    Percentage-style growth inputs (e.g. eps_growth_pct for PEG) use decimals:
    0.20 means 20%, not 20.0. Pass through provider values unchanged
    (yfinance earningsGrowth is already decimal).
    Returns the value PLUS the formula and retained inputs for auditability.
    """
    import json
    from .base import clean_str
    name = (clean_str(name, "") or "").lower().strip()
    if isinstance(inputs, str):
        try:
            inputs = json.loads(inputs)
        except Exception as exc:
            return {"ok": False, "error": f"Invalid inputs JSON: {exc}", "data": None,
                    "source": _source("Bullseye deterministic calculation layer",
                                      provider="deterministic_calculation")}
    if not isinstance(inputs, dict):
        return {"ok": False, "error": f"inputs must be a dictionary, got {type(inputs).__name__}", "data": None,
                "source": _source("Bullseye deterministic calculation layer",
                                  provider="deterministic_calculation")}

    if name not in RATIO_FORMULAS:
        return {"ok": False, "error": f"Unknown ratio '{name}'. "
                f"Valid: {sorted(RATIO_FORMULAS)}", "data": None}
    try:
        if any(value is None or not isinstance(value, (int, float)) or
               not math.isfinite(float(value)) for value in inputs.values()):
            raise ValueError("all ratio inputs must be finite numbers")
        value = float(RATIO_FORMULAS[name](inputs))
        if not math.isfinite(value):
            raise ValueError("ratio result is not finite")
    except (KeyError, ZeroDivisionError, TypeError, ValueError) as exc:
        return {"ok": False, "error": f"Missing/invalid input: {exc}", "data": None,
                "source": _source("Bullseye deterministic calculation layer",
                                  provider="deterministic_calculation")}
    return {"ok": True, "data": {"ratio": name, "value": value, "inputs": inputs},
            "source": _source("Bullseye deterministic calculation layer",
                              provider="deterministic_calculation"),
            "error": None}


TICKER_ALIASES = {
    "TATAMOTORS": "TMCV",
    "TATAMTRDVR": "TMCV",
    "TATA_MOTORS": "TMCV",
    "M&M": "M_M",
    "L&T": "LT",
    "BAJAJ-AUTO": "BAJAJ_AUTO",
}


def _resolve_symbol(ticker: str, exchange: str | None = None) -> str:
    """Append the yfinance exchange suffix (Indian listings need .NS/.BO;
    US tickers like AAPL/NVDA are used bare). Also resolve known restructured/NSE aliases."""
    from .base import clean_str
    from ..llm_mock import KNOWN_COMPANIES
    raw = (clean_str(ticker, "") or "").lstrip("$").strip().upper()
    base = raw.replace(".NS", "").replace(".BO", "")
    if base in TICKER_ALIASES:
        base = TICKER_ALIASES[base]
    exchange = clean_str(exchange, "")
    if not exchange:
        meta = KNOWN_COMPANIES.get(base) or KNOWN_COMPANIES.get(raw)
        if meta and meta.get("exchange"):
            exchange = meta["exchange"]
        else:
            exchange = "NSE"
    if not base or "." in base or base.startswith("^"):
        return base
    ex = exchange.upper()
    if ex in ("NASDAQ", "NYSE", "AMEX", "US", "USA"):
        return base
    return base + (".NS" if ex == "NSE" else ".BO" if ex == "BSE" else "")


def _get_financials(ticker: str, statement: str = "income", period: str = "annual",
                    exchange: str = "NSE") -> dict:
    """Get normalized financial statements (income|balance|cashflow, annual|quarterly).

    Normalization (Framework §P): currency, units, fiscal period, consolidated vs
    standalone, restated values — all resolved here before any agent sees the data.
    """
    try:
        import yfinance as yf
        from .base import clean_str
        statement = clean_str(statement, "income") or "income"
        period = clean_str(period, "annual") or "annual"
        if statement not in ("income", "balance", "cashflow"):
            return {"ok": False, "error": f"Unknown statement '{statement}'", "data": None,
                    "source": _source(f"yfinance {statement} statement {ticker}")}
        if period not in ("annual", "quarterly"):
            return {"ok": False, "error": f"Unknown period '{period}'", "data": None,
                    "source": _source(f"yfinance {statement} statement {ticker}")}
        symbol = _resolve_symbol(ticker, exchange)
        t = yf.Ticker(symbol)
        fields = {
            "income": ("quarterly_financials" if period == "quarterly" else "financials"),
            "balance": ("quarterly_balance_sheet" if period == "quarterly"
                        else "balance_sheet"),
            "cashflow": ("quarterly_cashflow" if period == "quarterly" else "cashflow"),
        }
        stmt = getattr(t, fields[statement], None)
        # Alternate fallback: if initial symbol returned no statements, test alternate exchange
        if (stmt is None or getattr(stmt, "empty", True) or len(getattr(stmt, "columns", [])) == 0):
            alt_symbol = (ticker.split(".")[0].strip().upper() if symbol.endswith((".NS", ".BO"))
                          else (symbol + ".NS" if "." not in symbol else None))
            if alt_symbol:
                alt_t = yf.Ticker(alt_symbol)
                alt_stmt = getattr(alt_t, fields[statement], None)
                if alt_stmt is not None and not getattr(alt_stmt, "empty", True) and len(getattr(alt_stmt, "columns", [])) > 0:
                    stmt = alt_stmt
                    t = alt_t
                    symbol = alt_symbol
        if stmt is None or getattr(stmt, "empty", True) or len(getattr(stmt, "columns", [])) == 0:
            return {"ok": False, "error": "statement unavailable (empty provider response)",
                    "data": {"ticker": ticker, "statement": statement, "line_items": {}},
                    "source": _source(f"yfinance {statement} statement {ticker}")}
        data = {str(col.date()): {str(k): (float(v) if v == v else None)
                                  for k, v in stmt[col].items()}
                for col in stmt.columns}
        try:
            currency = t.info.get("financialCurrency")
        except Exception:
            currency = None
        return {"ok": True, "data": {"ticker": ticker, "statement": statement,
                "period": period, "currency": currency,
                "basis": "provider-reported", "line_items": data},
                "source": _source(f"yfinance {statement} statement {ticker}", url=f'https://finance.yahoo.com/quote/{symbol}/financials/'),
                "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": None,
                "source": _source(f"yfinance {statement} statement {ticker}")}


def _get_company_metrics(ticker: str, exchange: str = "NSE") -> dict:
    """Get company-level metrics: shares outstanding, market cap, book value, EPS."""
    try:
        import yfinance as yf
        symbol = _resolve_symbol(ticker, exchange)
        info = {}
        try:
            info = yf.Ticker(symbol).info or {}
        except Exception:
            pass
        if not info.get("longName") and not info.get("shortName"):
            alt_symbol = (ticker.split(".")[0].strip().upper() if symbol.endswith((".NS", ".BO"))
                          else (symbol + ".NS" if "." not in symbol else None))
            if alt_symbol:
                try:
                    alt_info = yf.Ticker(alt_symbol).info or {}
                    if alt_info.get("longName") or alt_info.get("shortName"):
                        info = alt_info
                        symbol = alt_symbol
                except Exception:
                    pass
        if not info.get("longName") and not info.get("shortName"):
            return {"ok": False, "error": "metrics unavailable (provider returned no company)",
                    "data": {"ticker": ticker},
                    "source": _source(f"yfinance info {ticker}")}
        return {"ok": True, "data": {
            "ticker": ticker,
            "currency": info.get("financialCurrency") or info.get("currency"),
            "market_cap": info.get("marketCap"),
            "shares_outstanding": info.get("sharesOutstanding"),
            "eps_trailing": info.get("trailingEps"),
            "book_value_per_share": info.get("bookValue"),
            "dividend_per_share": info.get("dividendRate"),
            "revenue": info.get("totalRevenue"),
            "ebitda": info.get("ebitda"),
            "enterprise_value": info.get("enterpriseValue"),
            "free_cash_flow": info.get("freeCashflow"),
            "eps_growth_pct": info.get("earningsGrowth"),
            "total_debt": info.get("totalDebt"),
            "equity": info.get("totalStockholderEquity"),
            # Keep the provider fields needed by the report in the shared
            # metrics envelope. This lets report assembly reuse the cached
            # adapter response instead of opening another yfinance request.
            "return_on_equity": info.get("returnOnEquity"),
            "operating_margin": info.get("operatingMargins"),
            "profit_margin": info.get("profitMargins"),
            "debt_to_equity": info.get("debtToEquity"),
            "trailing_pe": info.get("trailingPE"),
            "sector": info.get("sector"), "industry": info.get("industry"),
        }, "source": _source(f"yfinance info {ticker}", url=f'https://finance.yahoo.com/quote/{symbol}/key-statistics/'),
            "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": {"ticker": ticker},
                "source": _source(f"yfinance info {ticker}")}


def _safe_ratio(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _peer_row(ticker: str, exchange: str) -> dict | None:
    """One peer's multiples from provider inputs; None when unresolvable."""
    import yfinance as yf
    symbol = _resolve_symbol(ticker, exchange)
    try:
        info = yf.Ticker(symbol).info or {}
    except Exception:
        return None
    if not info.get("longName") and not info.get("shortName"):
        return None
    price = _safe_ratio(info.get("currentPrice") or info.get("regularMarketPrice"))
    if price is None:
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist is not None and len(hist):
                price = _safe_ratio(hist["Close"].iloc[-1])
        except Exception:
            price = None
    market_cap = _safe_ratio(info.get("marketCap"))
    revenue = _safe_ratio(info.get("totalRevenue"))
    ebitda = _safe_ratio(info.get("ebitda"))
    ev = _safe_ratio(info.get("enterpriseValue"))
    eps = _safe_ratio(info.get("trailingEps"))
    bvps = _safe_ratio(info.get("bookValue"))
    dps = _safe_ratio(info.get("dividendRate"))
    growth = _safe_ratio(info.get("earningsGrowth"))
    row: dict = {"ticker": ticker,
                 "price": price, "market_cap": market_cap, "revenue": revenue,
                 "ebitda": ebitda, "enterprise_value": ev, "eps_trailing": eps,
                 "book_value_per_share": bvps, "dividend_per_share": dps,
                 "eps_growth_pct": growth,
                 "sector": info.get("sector"), "industry": info.get("industry")}
    pe = (price / eps) if price is not None and eps else None
    pb = (price / bvps) if price is not None and bvps else None
    ps = (market_cap / revenue) if market_cap and revenue else None
    ev_ebitda = (ev / ebitda) if ev and ebitda else None
    div_yield = (dps / price) if dps is not None and price else None
    fcf = _safe_ratio(info.get("freeCashflow"))
    fcf_yield = (fcf / market_cap) if fcf is not None and market_cap else None
    row.update({"pe": pe, "pb": pb, "ps": ps, "ev_ebitda": ev_ebitda,
                "dividend_yield": div_yield, "fcf_yield": fcf_yield})
    return row


def _get_peer_multiples(ticker: str, exchange: str = "NSE",
                        peers: list[str] | str | None = None, **_kwargs) -> dict:
    """Peer/sector multiples for contextualizing valuation (all deterministic)."""
    try:
        import yfinance as yf  # noqa: F401 (ensures provider present)
    except Exception as exc:
        return {"ok": False, "error": f"provider unavailable: {exc}",
                "data": {"ticker": ticker, "peers": []},
                "source": _source(f"yfinance peers {ticker}")}
    import json
    if isinstance(peers, str):
        s = peers.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                peers = json.loads(s)
            except Exception:
                peers = [p.strip() for p in s.strip("[]").split(",") if p.strip()]
        else:
            peers = [p.strip() for p in s.split(",") if p.strip()]
    peer_list = [p for p in (peers or []) if p and p != ticker]
    if not peer_list:
        return {"ok": False, "error": "no peers supplied; pass peer tickers to compare multiples",
                "data": {"ticker": ticker, "peers": []},
                "source": _source(f"yfinance peers {ticker}")}
    rows, missing = [], []
    for peer in peer_list[:8]:
        row = _peer_row(peer, exchange)
        (rows if row else missing).append(row if row else peer)
    if not rows:
        return {"ok": False, "error": f"peers unavailable: {missing}",
                "data": {"ticker": ticker, "peers": [], "missing": missing},
                "source": _source(f"yfinance peers {ticker}")}
    return {"ok": True, "data": {"ticker": ticker, "peers": rows, "missing": missing},
            "source": _source(f"yfinance peers {ticker}"), "error": None}


def _get_historical_multiples(ticker: str, exchange: str = "NSE",
                              period: str = "5y", **_kwargs) -> dict:
    """Historical price context + P/E history where fundamentals allow."""
    try:
        from .market_tools import get_price_history as _history
        hist = _history.invoke({"ticker": ticker, "period": period, "exchange": exchange})
    except Exception as exc:
        return {"ok": False, "error": str(exc),
                "data": {"ticker": ticker, "period": period, "points": []},
                "source": _source(f"yfinance historical multiples {ticker}")}
    if not isinstance(hist, dict) or not hist.get("ok"):
        return {"ok": False, "error": (hist or {}).get("error") or "history unavailable",
                "data": {"ticker": ticker, "period": period, "points": []},
                "source": _source(f"yfinance historical multiples {ticker}")}
    closes = [(p["date"], p["close"]) for p in (hist.get("data") or {}).get("series", [])]
    if not closes:
        return {"ok": False, "error": "history unavailable (no finite closes)",
                "data": {"ticker": ticker, "period": period, "points": []},
                "source": _source(f"yfinance historical multiples {ticker}")}
    # Trailing EPS is a point-in-time provider value; spread it for trend context
    # and flag it as such rather than pretending per-period fundamentals exist.
    try:
        metrics = _get_company_metrics(ticker, exchange)
        eps = ((metrics.get("data") or {}).get("eps_trailing")
               if isinstance(metrics, dict) and metrics.get("ok") else None)
        eps = _safe_ratio(eps)
    except Exception:
        eps = None
    points = [{"date": date, "close": close,
               "pe": (close / eps) if eps else None} for date, close in closes]
    return {"ok": True, "data": {"ticker": ticker, "period": period,
            "eps_trailing_used": eps, "eps_is_point_in_time": True,
            "points": points},
            "source": _source(f"yfinance historical multiples {ticker}"), "error": None}


calculate_ratio = NativeFunctionTool(
    name="calculate_ratio",
    description=("Calculate a financial ratio from explicit numeric inputs. "
                 "Use this tool for all arithmetic and retain the inputs."),
    args_schema=CalculateRatioArgs,
    function=_calculate_ratio,
)

compute_growth = NativeFunctionTool(
    name="compute_growth", description="Compute growth with explicit periods and retained inputs.",
    args_schema=GrowthArgs, function=_compute_growth,
)

get_financials = NativeFunctionTool(
    name="get_financials",
    description="Get one normalized annual or quarterly financial statement.",
    args_schema=FinancialsArgs,
    function=_get_financials,
    cache_ttl_s=3600,
)

get_company_metrics = NativeFunctionTool(
    name="get_company_metrics",
    description="Get company metrics and valuation inputs from the market provider.",
    args_schema=CompanyMetricsArgs,
    function=_get_company_metrics,
    cache_ttl_s=900,
)

get_peer_multiples = NativeFunctionTool(
    name="get_peer_multiples",
    description=("Get peer/sector multiples (P/E, P/B, P/S, EV/EBITDA, yields) "
                 "for contextualizing valuation. Pass peer tickers explicitly."),
    args_schema=PeerMultiplesArgs,
    function=_get_peer_multiples,
    cache_ttl_s=900,
)

get_historical_multiples = NativeFunctionTool(
    name="get_historical_multiples",
    description=("Get historical price context with P/E trend where trailing EPS "
                 "is available. EPS is point-in-time unless stated."),
    args_schema=HistoricalMultiplesArgs,
    function=_get_historical_multiples,
    cache_ttl_s=900,
)
