"""Tool helpers used by the provider adapters.

Exposes LangChain BaseTool instances for tool-calling in LangGraph agents.
``NativeFunctionTool`` keeps the useful ``invoke({...})`` and ``run(...)``
interfaces while providing robust error handling and signature validation.
"""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable
from copy import deepcopy
from typing import Any
import inspect
import json
import threading
import time

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


_TOOL_CACHE_MAX_ENTRIES = 512
_tool_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
_tool_inflight: dict[str, threading.Event] = {}
_tool_cache_lock = threading.RLock()


def clear_tool_cache() -> None:
    """Clear shared provider results (useful after a provider refresh or in tests)."""
    with _tool_cache_lock:
        _tool_cache.clear()


def _cache_key(name: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    """Create a stable key for normalized, read-only tool arguments."""
    return json.dumps([name, args, kwargs], sort_keys=True, default=str,
                      separators=(",", ":"))


class NativeFunctionTool(BaseTool):
    """Expose a normal Python function as a standard LangChain/LangGraph tool.

    The function owns provider-specific normalization and should return the
    project's common result envelope. Unexpected exceptions are converted to
    an error envelope so a single provider cannot abort an agent run.
    """

    function: Callable[..., Any] = Field(exclude=True, repr=False)
    # Read-only provider adapters opt in to caching. Local calculations leave
    # this at zero, while market/filing calls use a short TTL to avoid the same
    # quote being fetched independently by parallel specialists.
    cache_ttl_s: float = Field(default=0.0, exclude=True)

    def _cached_call(self, key: str, fn: Callable[[], Any]) -> Any:
        """Cache successful read-only calls and collapse concurrent duplicates."""
        ttl = max(0.0, float(self.cache_ttl_s))
        if ttl <= 0:
            return fn()

        # Single-flight prevents parallel financial/market agents from all
        # opening the same provider request before the first response is cached.
        while True:
            owner = False
            with _tool_cache_lock:
                now = time.monotonic()
                hit = _tool_cache.get(key)
                if hit:
                    expires_at, value = hit
                    if expires_at > now:
                        _tool_cache.move_to_end(key)
                        return deepcopy(value)
                    _tool_cache.pop(key, None)

                event = _tool_inflight.get(key)
                if event is None:
                    event = threading.Event()
                    _tool_inflight[key] = event
                    owner = True

            if owner:
                break
            event.wait()

        try:
            value = fn()
            # Do not turn a temporary provider outage into a long-lived cache
            # hit. Provider adapters use the common ``ok`` envelope; values
            # without that field are still cacheable for local read-only tools.
            if not (isinstance(value, dict) and value.get("ok") is False):
                with _tool_cache_lock:
                    _tool_cache[key] = (time.monotonic() + ttl, deepcopy(value))
                    _tool_cache.move_to_end(key)
                    while len(_tool_cache) > _TOOL_CACHE_MAX_ENTRIES:
                        _tool_cache.popitem(last=False)
            return value
        finally:
            with _tool_cache_lock:
                _tool_inflight.pop(key, None)
                event.set()

    def _run(self, *args: Any, **kwargs: Any) -> Any:
        try:
            # 1. Positional argument unpack if single dict or JSON string was passed
            call_kwargs = dict(kwargs)
            call_args = list(args)
            if len(call_args) == 1 and not call_kwargs:
                first = call_args[0]
                if isinstance(first, dict):
                    call_kwargs = dict(first)
                    call_args = []
                elif isinstance(first, str):
                    s = first.strip()
                    if s.startswith("{") and s.endswith("}"):
                        try:
                            parsed = json.loads(s)
                            if isinstance(parsed, dict):
                                call_kwargs = parsed
                                call_args = []
                        except Exception:
                            pass
                    elif self.args_schema:
                        # Single required string field fallback (e.g. ticker="TCS", query="...")
                        fields = list(self.args_schema.model_fields.keys())
                        if len(fields) == 1:
                            call_kwargs = {fields[0]: first}
                            call_args = []

            # 2. Parse stringified JSON inputs for fields expecting dict/list
            if self.args_schema:
                for field_name, field_info in self.args_schema.model_fields.items():
                    val = call_kwargs.get(field_name)
                    if isinstance(val, str) and (val.startswith("{") or val.startswith("[")):
                        try:
                            call_kwargs[field_name] = json.loads(val)
                        except Exception:
                            pass

            call_kwargs = self._validate_kwargs(call_kwargs)

            # 3. Signature introspection: filter hallucinated extra kwargs if func has no **kwargs
            sig = inspect.signature(self.function)
            has_var_keyword = any(
                p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
            )
            if not has_var_keyword:
                allowed = set(sig.parameters.keys())
                call_kwargs = {k: v for k, v in call_kwargs.items() if k in allowed}

            key = _cache_key(self.name, tuple(call_args), call_kwargs)
            return self._cached_call(key, lambda: self.function(*call_args, **call_kwargs))
        except Exception as exc:  # provider boundary: return a structured failure
            return {
                "ok": False,
                "data": None,
                "source": {"title": self.name, "provider": "application"},
                "error": str(exc),
            }

    def _validate_kwargs(self, kwargs: dict[str, Any]) -> dict[str, Any]:
        """Validate keyword arguments against args_schema with extra resilience for LLM hallucinations."""
        if self.args_schema is not None and self.args_schema.model_fields:
            # 1. Filter out extra kwargs that aren't in args_schema
            allowed_fields = set(self.args_schema.model_fields.keys())
            clean_kwargs = {k: v for k, v in kwargs.items() if k in allowed_fields}

            # 2. For fields expecting dict or list, parse if passed as stringified JSON
            for field_name, field_info in self.args_schema.model_fields.items():
                val = clean_kwargs.get(field_name)
                if isinstance(val, str) and (val.startswith("{") or val.startswith("[")):
                    try:
                        clean_kwargs[field_name] = json.loads(val)
                    except Exception:
                        pass

            try:
                validated = self.args_schema.model_validate(clean_kwargs)
                return validated.model_dump()
            except Exception as e:
                hint = f" (expected fields: {list(self.args_schema.model_fields.keys())})" if hasattr(self.args_schema, 'model_fields') else ""
                raise ValueError(
                    f"Tool '{self.name}' arguments validation failed: {e}{hint}"
                ) from e
        return kwargs

    def format_output_for_agent(self, raw_result: Any) -> str:
        """Format raw result as JSON so agent receives clean JSON."""
        if isinstance(raw_result, (dict, list)):
            try:
                return json.dumps(raw_result, default=str)
            except Exception:
                pass
        return str(raw_result)

    def run(self, *args: Any, **kwargs: Any) -> Any:
        """Direct execution method compatible with LangChain and legacy callers."""
        check = dict(kwargs)
        if len(args) == 1 and not check and isinstance(args[0], dict):
            check = dict(args[0])
        self._validate_kwargs(check)
        return self._run(*args, **kwargs)

    def invoke(self, input: Any = None, **kwargs: Any) -> Any:
        """Compatibility alias for callers that previously used LangChain tools."""
        check = dict(input or {}) if isinstance(input, dict) else dict(kwargs)
        self._validate_kwargs(check)
        if isinstance(input, dict):
            values = dict(input)
            values.update(kwargs)
            return self._run(**values)
        if input is not None:
            return self._run(input, **kwargs)
        return self._run(**kwargs)


def tool_args(**fields: Any) -> type[BaseModel]:
    """Create a named Pydantic args schema without duplicating boilerplate."""
    from pydantic import create_model

    return create_model("NativeToolArgs", **fields)


_NULL_STRINGS = frozenset({"", "null", "none", "nil", "n/a", "na", "undefined"})


def clean_str(value: Any, default: str | None = None) -> str | None:
    """Normalize model-provided strings: 'null'/'none'/'' become missing.

    LLMs frequently emit the literal string "null" for optional args they
    don't want to set. Without this, such values become real filters and
    silently reject every result.
    """
    if value is None:
        return default
    text = str(value).strip()
    if not text or text.lower() in _NULL_STRINGS:
        return default
    return text


# ---------------------------------------------------------------------------
# Dynamic Ticker & Exchange Resolver (Universal Global Market Coverage)
# ---------------------------------------------------------------------------
_TICKER_CACHE: dict[str, dict[str, Any]] = {}
_TICKER_CACHE_LOCK = threading.RLock()

EXCHANGE_CODE_MAP = {
    # US exchanges (bare symbol in yfinance)
    "NASDAQ": "", "NMS": "", "NGM": "", "NCM": "",
    "NYSE": "", "NYQ": "", "NYS": "",
    "AMEX": "", "ASE": "", "AMX": "", "ARCA": "", "BATS": "",
    "US": "", "USA": "",
    # Indian exchanges
    "NSE": ".NS", "NSI": ".NS",
    "BSE": ".BO", "BOM": ".BO",
    # European exchanges
    "LSE": ".L", "LON": ".L",
    "GER": ".DE", "XETRA": ".DE", "FRA": ".DE", "XET": ".DE",
    "PAR": ".PA", "EPA": ".PA",
    "AMS": ".AS", "EAM": ".AS",
    "BRU": ".BR", "EBR": ".BR",
    "MCE": ".MC", "BME": ".MC",
    "MIL": ".MI", "BIT": ".MI",
    "SWX": ".SW", "VTX": ".SW",
    # Asian & Global exchanges
    "TYO": ".T", "TSE": ".T", "JPX": ".T",
    "HKG": ".HK", "HKEX": ".HK",
    "SS": ".SS", "SHH": ".SS",
    "SZ": ".SZ", "SHZ": ".SZ",
    "TW": ".TW", "TWO": ".TWO",
    "KRX": ".KS", "KOSDAQ": ".KQ",
    "ASX": ".AX",
    "TSX": ".TO", "TOR": ".TO", "CVE": ".V",
    "SAO": ".SA", "BVMF": ".SA",
    "JSE": ".JO",
}

EXCHANGE_DISPLAY_MAP = {
    "NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ",
    "NYQ": "NYSE", "NYS": "NYSE",
    "ASE": "AMEX", "AMX": "AMEX", "ARCA": "NYSE Arca",
    "NSI": "NSE", "BSE": "BSE",
    "GER": "XETRA", "FRA": "Frankfurt", "LSE": "LSE", "LON": "LSE",
    "AMS": "Euronext Amsterdam", "PAR": "Euronext Paris",
    "TYO": "Tokyo Stock Exchange", "JPX": "Tokyo Stock Exchange",
    "HKG": "HKEX", "TSX": "TSX", "TOR": "TSX", "ASX": "ASX",
}


def resolve_ticker_info(ticker: str | None, exchange: str | None = None) -> dict[str, str]:
    """Dynamically resolve any ticker or company name across global exchanges.

    Queries Yahoo Finance search dynamically with smart query candidate expansions,
    TTL caching, and resilient offline/mock fallbacks. Works for US, Indian, European,
    Asian, indices, and global assets without hardcoded ticker dictionaries.
    """
    import urllib.request
    import urllib.parse
    import re

    raw = clean_str(ticker, "") or ""
    raw = raw.lstrip("$").strip()
    if not raw:
        return {"symbol": "", "ticker": "", "exchange": "", "name": ""}

    raw_up = raw.upper()

    # Pass-through pre-suffixed symbols, indices, crypto/futures
    if raw.startswith("^") or "=F" in raw_up or "-USD" in raw_up:
        return {"symbol": raw_up, "ticker": raw_up, "exchange": "INDEX", "name": raw_up}
    if "." in raw:
        base, suffix = raw_up.split(".", 1)
        ex = "NSE" if suffix == "NS" else "BSE" if suffix == "BO" else suffix
        return {"symbol": raw_up, "ticker": base, "exchange": ex, "name": base}

    ex_clean = clean_str(exchange, "")
    base = raw_up.replace(".NS", "").replace(".BO", "")

    # If exchange is explicitly provided
    if ex_clean:
        ex_up = ex_clean.upper()
        if ex_up in EXCHANGE_CODE_MAP:
            suffix = EXCHANGE_CODE_MAP[ex_up]
            return {"symbol": base + suffix, "ticker": base, "exchange": ex_up, "name": base}
        return {"symbol": base, "ticker": base, "exchange": ex_up, "name": base}

    # Unspecified exchange -> check cache
    cache_key = base
    with _TICKER_CACHE_LOCK:
        if cache_key in _TICKER_CACHE:
            return _TICKER_CACHE[cache_key]

    # Dynamic search via Yahoo Finance search endpoint
    headers = {"User-Agent": "Mozilla/5.0"}
    candidates = [base]
    if "&" in base:
        candidates.append(base.replace("&", ""))
        candidates.append(base + ".NS")
    spaced = re.sub(r"([a-zA-Z]+)(MOTORS|POWER|STEEL|TECH|AUTO|BANK|FINANCE)", r"\1 \2", base)
    if spaced != base:
        candidates.append(spaced)
    candidates.append(base + ".NS")

    seen = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        try:
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(cand)}&quotesCount=5&newsCount=0"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                quotes = data.get("quotes", [])
                for q in quotes:
                    sym = q.get("symbol")
                    qtype = q.get("quoteType", "")
                    if sym and qtype in ("EQUITY", "ETF", "INDEX", "MUTUALFUND"):
                        q_ex = q.get("exchange", "")
                        ex_disp = EXCHANGE_DISPLAY_MAP.get(q_ex, q_ex)
                        info = {
                            "symbol": sym,
                            "ticker": sym.split(".")[0],
                            "exchange": ex_disp,
                            "name": q.get("shortname") or q.get("longname") or base,
                        }
                        with _TICKER_CACHE_LOCK:
                            _TICKER_CACHE[cache_key] = info
                        return info
        except Exception:
            pass

    # Offline / Seeded fallback from KNOWN_COMPANIES
    try:
        from ..llm_mock import KNOWN_COMPANIES
        meta = KNOWN_COMPANIES.get(base)
        if meta and meta.get("exchange"):
            m_ex = meta["exchange"].upper()
            suffix = EXCHANGE_CODE_MAP.get(m_ex, "")
            info = {
                "symbol": meta.get("ticker", base) + suffix,
                "ticker": meta.get("ticker", base),
                "exchange": m_ex,
                "name": base,
            }
            with _TICKER_CACHE_LOCK:
                _TICKER_CACHE[cache_key] = info
            return info
    except Exception:
        pass

    fallback_info = {"symbol": base, "ticker": base, "exchange": "", "name": base}
    with _TICKER_CACHE_LOCK:
        _TICKER_CACHE[cache_key] = fallback_info
    return fallback_info


def resolve_ticker_symbol(ticker: str | None, exchange: str | None = None) -> str:
    """Dynamically resolve any ticker/company to its exact yfinance symbol."""
    return resolve_ticker_info(ticker, exchange)["symbol"]

