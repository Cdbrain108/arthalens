"""Market tools exposed as LangGraph tools."""

from __future__ import annotations

from datetime import datetime, timezone
import math

from pydantic import BaseModel

from .base import NativeFunctionTool


def _envelope(data, source_title, source_url=None, ok=True, error=None):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "ok": ok, "data": data,
        "source": {"title": source_title, "url": source_url, "provider": "yfinance",
                   "retrieved_at": now, "fetched_at": now},
        "cache": {"hit": False, "ttl_s": 900},
        "error": error,
    }


class QuoteArgs(BaseModel):
    ticker: str
    exchange: str = "NSE"


class HistoryArgs(BaseModel):
    ticker: str
    period: str = "1y"
    exchange: str = "NSE"


class VolumeArgs(BaseModel):
    ticker: str
    period: str = "3mo"
    exchange: str = "NSE"


class BenchmarkArgs(BaseModel):
    ticker: str
    period: str = "1y"
    exchange: str = "NSE"


class TechnicalsArgs(BaseModel):
    ticker: str
    period: str = "1y"
    exchange: str = "NSE"
    windows: list[int] = [20, 50]


TICKER_ALIASES = {
    "TATAMOTORS": "TMCV",
    "TATAMTRDVR": "TMCV",
    "TATA_MOTORS": "TMCV",
    "M&M": "M_M",
    "L&T": "LT",
    "BAJAJ-AUTO": "BAJAJ_AUTO",
}


def _suffix(ticker: str, exchange: str | None = None) -> str:
    # Index/benchmark symbols (^NSEI, ^GSPC) and pre-suffixed tickers pass through.
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


def _get_quote(ticker: str, exchange: str = "NSE") -> dict:
    """Get the latest price quote for a ticker."""
    try:
        import yfinance as yf

        symbol = _suffix(ticker, exchange)
        t = yf.Ticker(symbol)
        price, chg, curr, as_of = None, None, None, None
        quote_type = 'provider quote; timestamp unavailable'
        try:
            fi = t.fast_info
            price = fi.get("lastPrice") if hasattr(fi, "get") else getattr(fi, "last_price", None)
            chg = fi.get("regularMarketChangePercent") if hasattr(fi, "get") else None
            curr = fi.get("currency") if hasattr(fi, "get") else None
        except Exception:
            pass
        if price is None:
            try:
                hist = t.history(period="5d")
                if hist is not None and len(hist):
                    price = float(hist["Close"].iloc[-1])
                    as_of = str(hist.index[-1].date())
                    quote_type = 'historical daily close'
            except Exception:
                pass
        # Fallback: if suffixed symbol failed on Indian exchange, try bare symbol (US listing)
        if price is None and symbol.endswith((".NS", ".BO")):
            try:
                alt_symbol = ticker.split(".")[0].strip().upper()
                alt_t = yf.Ticker(alt_symbol)
                alt_fi = alt_t.fast_info
                alt_price = alt_fi.get("lastPrice") if hasattr(alt_fi, "get") else getattr(alt_fi, "last_price", None)
                if alt_price is not None:
                    price = alt_price
                    symbol = alt_symbol
                    curr = alt_fi.get("currency") if hasattr(alt_fi, "get") else "USD"
                    quote_type = 'provider quote'
            except Exception:
                pass
        # Fallback: if bare symbol failed, try with .NS
        if price is None and not symbol.endswith((".NS", ".BO")) and "." not in symbol:
            try:
                alt_symbol = symbol + ".NS"
                alt_t = yf.Ticker(alt_symbol)
                alt_fi = alt_t.fast_info
                alt_price = alt_fi.get("lastPrice") if hasattr(alt_fi, "get") else getattr(alt_fi, "last_price", None)
                if alt_price is not None:
                    price = alt_price
                    symbol = alt_symbol
                    curr = alt_fi.get("currency") if hasattr(alt_fi, "get") else "INR"
                    quote_type = 'provider quote'
            except Exception:
                pass
        if price is None:
            return _stooq_quote(ticker, exchange)
        return _envelope({
            "ticker": ticker, "price": float(price),
            "change_pct": float(chg) if chg is not None else None,
            "currency": curr, "as_of": as_of, "quote_type": quote_type,
        }, source_title=f"yfinance quote {ticker}", source_url=f'https://finance.yahoo.com/quote/{symbol}/')
    except Exception as exc:
        return _stooq_quote(ticker, exchange, reason=str(exc))


def _stooq_quote(ticker: str, exchange: str, reason: str = "Yahoo quote unavailable") -> dict:
    """US end-of-day fallback. Never substitute a different country's listing."""
    if exchange.upper() not in {"NASDAQ", "NYSE", "US"} or not ticker.isalpha():
        return _envelope({"ticker": ticker}, f"quote {ticker}", ok=False,
                         error=f"{reason}; Stooq fallback does not cover this listing")
    import csv
    import io
    import httpx
    url = f"https://stooq.com/q/l/?s={ticker.lower()}.us&f=sd2t2ohlcv&h&e=csv"
    try:
        response = httpx.get(url, timeout=8)
        response.raise_for_status()
        row = next(csv.DictReader(io.StringIO(response.text)))
        price = float(row["Close"])
        if not math.isfinite(price) or price <= 0:
            raise ValueError("invalid close")
        result = _envelope({"ticker": ticker, "price": price, "currency": "USD",
                            "change_pct": None, "as_of": row["Date"],
                            "quote_type": "end-of-day", "fallback_reason": reason},
                           f"Stooq daily close {ticker}", url)
        result["source"]["provider"] = "stooq"
        return result
    except Exception as exc:
        return _envelope({"ticker": ticker}, f"Stooq {ticker}", ok=False,
                         error=f"{reason}; fallback unavailable: {type(exc).__name__}")


_PERIOD_ALIASES = {"1m": "1mo", "3m": "3mo", "6m": "6mo", "12m": "1y",
                   "1y": "1y", "5y": "5y", "1d": "1d", "5d": "5d",
                   "1mo": "1mo", "3mo": "3mo", "6mo": "6mo",
                   "2y": "2y", "10y": "10y", "ytd": "ytd", "max": "max"}
_VALID_PERIODS = frozenset(_PERIOD_ALIASES.values())


def _normalize_period(period: str) -> str | None:
    """Alias (1m→1mo) and clean model output. None = missing → default;
    unknown non-empty values pass through for explicit validation downstream."""
    from .base import clean_str
    key = clean_str(period)
    if key is None:
        return None
    return _PERIOD_ALIASES.get(key.lower(), key)


def _get_price_history(ticker: str, period: str = "1y", exchange: str = "NSE") -> dict:
    """Get finite full-OHLCV price history for a ticker (NaN rows dropped)."""
    try:
        import yfinance as yf

        period = _normalize_period(period) or "1y"  # missing means default
        if period not in _VALID_PERIODS:
            return _envelope({"ticker": ticker, "period": period, "series": []},
                             source_title=f"yfinance history {ticker}",
                             ok=False, error=f"invalid period '{period}'; "
                             f"valid: {sorted(_VALID_PERIODS)}")
        df = yf.Ticker(_suffix(ticker, exchange)).history(period=period)
        if df is None or len(df) == 0:
            return _envelope({"ticker": ticker, "period": period, "series": []},
                             source_title=f"yfinance history {ticker}",
                             ok=False, error="history unavailable (empty provider response)")
        series = []
        for idx, row in df.iterrows():
            try:
                values = {key: float(row.get(col)) for key, col in
                          (("open", "Open"), ("high", "High"),
                           ("low", "Low"), ("close", "Close"), ("volume", "Volume"))}
            except (TypeError, ValueError):
                continue
            if not all(math.isfinite(value) for value in values.values()):
                continue
            series.append({"date": str(idx.date()), **values,
                           "volume": int(values["volume"])})
        if not series:
            return _envelope({"ticker": ticker, "period": period, "series": []},
                             source_title=f"yfinance history {ticker}", ok=False,
                             error="history unavailable (no finite OHLCV rows)")
        return _envelope({"ticker": ticker, "period": period, "series": series},
                         source_title=f"yfinance history {ticker}")
    except Exception as exc:
        return _envelope({"ticker": ticker, "period": period, "series": []},
                         source_title=f"yfinance history {ticker}",
                         ok=False, error=str(exc))


def _get_technicals(ticker: str, period: str = "1y", exchange: str = "NSE",
                    windows: list[int] | None = None) -> dict:
    """Deterministic technicals from real history: returns, SMAs, range, volatility.

    Agents may make technical claims ONLY from this output (labeled with the
    computation). No invented indicators.
    """
    try:
        hist = get_price_history.invoke({'ticker': ticker, 'period': period, 'exchange': exchange})
        if not isinstance(hist, dict) or not hist.get("ok"):
            return _envelope({"ticker": ticker, "period": period},
                             source_title=f"yfinance technicals {ticker}",
                             ok=False, error=(hist or {}).get("error") or "history unavailable")
        series = (hist.get("data") or {}).get("series", [])
        closes = [point["close"] for point in series]
        if len(closes) < 2:
            return _envelope({"ticker": ticker, "period": period},
                             source_title=f"yfinance technicals {ticker}",
                             ok=False, error="insufficient history for technicals")
        returns = [(closes[i] / closes[i - 1] - 1.0) for i in range(1, len(closes))]
        total_return = closes[-1] / closes[0] - 1.0
        mean = sum(returns) / len(returns)
        variance = sum((value - mean) ** 2 for value in returns) / len(returns)
        volatility = math.sqrt(variance)
        sma: dict[str, float | None] = {}
        for window in (windows or [20, 50]):
            key = f"sma_{int(window)}"
            sma[key] = (sum(closes[-int(window):]) / int(window)
                        if len(closes) >= int(window) and int(window) > 0 else None)
        data = {"ticker": ticker, "period": period, "points": len(closes),
                "last_close": closes[-1], "total_return": total_return,
                "volatility_daily": volatility,
                "high_52w": max(closes), "low_52w": min(closes),
                "sma": sma,
                "computation": "total_return=last/first-1; sma=mean(last N closes); "
                               "volatility=stdev(daily returns)"}
        return _envelope(data, source_title=f"yfinance technicals {ticker}")
    except Exception as exc:
        return _envelope({"ticker": ticker, "period": period},
                         source_title=f"yfinance technicals {ticker}",
                         ok=False, error=str(exc))


def _get_volume(ticker: str, period: str = "3mo", exchange: str = "NSE") -> dict:
    """Get average, latest, and direction of volume."""
    try:
        hist = get_price_history.invoke({"ticker": ticker, "period": period, "exchange": exchange})
        series = (hist.get("data") or {}).get("series", []) if isinstance(hist, dict) else []
        vols = [d["volume"] for d in series if d.get("volume")]
        if not vols:
            return _envelope({"ticker": ticker}, source_title=f"yfinance volume {ticker}",
                             ok=False, error="volume unavailable (no history)")
        average = sum(vols) / len(vols)
        return _envelope({"ticker": ticker, "avg_volume": average,
                          "latest_volume": vols[-1],
                          "trend": "up" if vols[-1] > average else "down"},
                         source_title=f"yfinance volume {ticker}")
    except Exception as exc:
        return _envelope({"ticker": ticker}, source_title=f"yfinance volume {ticker}",
                         ok=False, error=str(exc))


def _get_benchmark_history(ticker: str, period: str = "1y", exchange: str = "NSE") -> dict:
    benchmark = "^NSEI" if exchange.upper() == "NSE" else "^BSESN" if exchange.upper() == "BSE" else "^GSPC"
    result = _get_price_history(benchmark, period=period, exchange="")
    if result.get("ok"):
        result["data"]["benchmark_for"] = ticker
    return result


get_quote = NativeFunctionTool(
    name="get_quote",
    description="Get the latest quote for a ticker and exchange.",
    args_schema=QuoteArgs,
    function=_get_quote,
    cache_ttl_s=300,
)

get_price_history = NativeFunctionTool(
    name="get_price_history",
    description="Get finite OHLCV history for a ticker.",
    args_schema=HistoryArgs,
    function=_get_price_history,
    cache_ttl_s=900,
)

get_volume = NativeFunctionTool(
    name="get_volume",
    description="Get average, latest, and trend volume statistics.",
    args_schema=VolumeArgs,
    function=_get_volume,
    cache_ttl_s=900,
)

get_benchmark_history = NativeFunctionTool(
    name="get_benchmark_history",
    description="Get a market benchmark series for context against a company.",
    args_schema=BenchmarkArgs,
    function=_get_benchmark_history,
    cache_ttl_s=900,
)

get_technicals = NativeFunctionTool(
    name="get_technicals",
    description=("Get deterministic technicals (returns, SMAs, range, volatility) "
                 "from real price history. Required for any technical claim."),
    args_schema=TechnicalsArgs,
    function=_get_technicals,
    cache_ttl_s=900,
)
