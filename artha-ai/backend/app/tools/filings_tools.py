"""Filings tools — quarterly results from free official sources (no keys).

US: SEC EDGAR ``data.sec.gov`` JSON (submissions history + XBRL facts).
IN: NSE/BSE official filing pages (deep links; PDFs go through RAG ingest).
Numbers for both markets also come from yfinance quarterly statements
(``financial_tools.get_financials(period="quarterly")``).
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from .base import NativeFunctionTool


def _source(title: str, provider: str, url: str | None = None) -> dict:
    return {"title": title, "url": url, "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def _edgar_headers() -> dict:
    from ..config import settings
    return {"User-Agent": settings.edgar_user_agent,
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate"}


class EdgarQuarterlyArgs(BaseModel):
    ticker: str
    limit: int = 4
    forms: list[str] = Field(default_factory=lambda: ["10-Q", "10-K", "8-K"])


class NseResultsArgs(BaseModel):
    ticker: str


class QuarterlyResultsArgs(BaseModel):
    ticker: str
    exchange: str = "NSE"
    quarter: str | None = None


_CIK_CACHE: dict[str, str] = {}


def _ticker_to_cik(ticker: str) -> str:
    """Resolve a US ticker to a 10-digit CIK via SEC's free ticker map."""
    import httpx
    key = (ticker or "").upper()
    if key in _CIK_CACHE:
        return _CIK_CACHE[key]
    resp = httpx.get("https://www.sec.gov/files/company_tickers.json",
                     headers=_edgar_headers(), timeout=20)
    resp.raise_for_status()
    mapping = resp.json()
    rows = mapping.values() if isinstance(mapping, dict) else mapping
    for row in rows:
        if str(row.get("ticker", "")).upper() == key:
            cik = str(row["cik_str"]).zfill(10)
            _CIK_CACHE[key] = cik
            return cik
    raise ValueError(f"ticker {ticker} not found in SEC ticker map")


def _get_edgar_quarterly(ticker: str, limit: int = 4,
                         forms: list[str] | None = None) -> dict:
    """Recent US quarterly filings (10-Q/10-K/8-K) with archive document URLs."""
    import httpx
    wanted = forms or ["10-Q", "10-K", "8-K"]
    try:
        cik = _ticker_to_cik(ticker)
    except Exception as exc:
        return {"ok": False, "error": str(exc),
                "data": {"ticker": ticker, "filings": []},
                "source": _source(f"SEC EDGAR submissions {ticker}", "sec_edgar")}
    try:
        resp = httpx.get(f"https://data.sec.gov/submissions/CIK{cik}.json",
                         headers=_edgar_headers(), timeout=20)
        resp.raise_for_status()
        recent = (resp.json().get("filings") or {}).get("recent") or {}
        filings = []
        count = len(recent.get("accessionNumber", []))
        for i in range(count):
            form = recent.get("form", [""])[i]
            if form not in wanted:
                continue
            accession = recent.get("accessionNumber", [""])[i].replace("-", "")
            primary = (recent.get("primaryDocument", [""])[i]
                       or recent.get("primaryDocDescription", [""])[i])
            filings.append({
                "form": form,
                "filing_date": recent.get("filingDate", [""])[i],
                "report_date": recent.get("reportDate", [""])[i],
                "accession": recent.get("accessionNumber", [""])[i],
                "document_url": (f"https://www.sec.gov/Archives/edgar/data/"
                                 f"{int(cik)}/{accession}/{primary}") if primary else None,
            })
            if len(filings) >= limit:
                break
        if not filings:
            return {"ok": False, "error": f"no {wanted} filings in recent history",
                    "data": {"ticker": ticker, "cik": cik, "filings": []},
                    "source": _source(f"SEC EDGAR submissions {ticker}", "sec_edgar")}
        return {"ok": True, "data": {"ticker": ticker, "cik": cik, "filings": filings},
                "source": _source(f"SEC EDGAR submissions {ticker}", "sec_edgar"),
                "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc),
                "data": {"ticker": ticker, "filings": []},
                "source": _source(f"SEC EDGAR submissions {ticker}", "sec_edgar")}


def _get_nse_results(ticker: str) -> dict:
    """Official NSE/BSE filing deep links for an Indian ticker (no scrape)."""
    symbol = (ticker or "").upper()
    if not symbol:
        return {"ok": False, "error": "ticker required",
                "data": {"ticker": ticker, "links": []},
                "source": _source("NSE/BSE filings", "nse_bse")}
    links = [
        {"label": "NSE announcements",
         "url": f"https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol={symbol}&tabIndex=equity"},
        {"label": "NSE financial results",
         "url": "https://www.nseindia.com/companies-listing/corporate-filings-financial-results?equityfndatefilter=1"},
        {"label": "BSE announcements (Result category)",
         "url": "https://beta.bseindia.com/corporates/ann.html"},
    ]
    return {"ok": True, "data": {"ticker": symbol, "links": links,
            "note": "Open the announcement link, download the result PDF, upload to /documents for RAG-grounded analysis."},
            "source": _source(f"NSE/BSE filings {symbol}", "nse_bse"), "error": None}


def _get_quarterly_results(ticker: str, exchange: str = "NSE",
                           quarter: str | None = None) -> dict:
    """One quarterly bundle: statement + filings + earnings news (free legs).

    Legs never fail the bundle: each missing leg becomes a named gap while
    successful legs still return. ``quarter`` (e.g. "Q1FY26") filters news
    text when supplied.
    """
    from .financial_tools import _get_financials
    from .news_tools import _search_news
    gaps: list[str] = []
    bundle: dict = {"ticker": ticker, "exchange": exchange, "quarter": quarter}

    stmt = _get_financials(ticker, statement="income", period="quarterly",
                           exchange=exchange)
    if isinstance(stmt, dict) and stmt.get("ok"):
        bundle["statement"] = stmt["data"]
    else:
        gaps.append(f"quarterly statement unavailable: {(stmt or {}).get('error') or 'empty'}")

    if (exchange or "").upper() in ("", "NASDAQ", "NYSE", "US"):
        edgar = _get_edgar_quarterly(ticker)
        if edgar.get("ok"):
            bundle["edgar"] = edgar["data"]
        else:
            gaps.append(f"EDGAR quarterly unavailable: {edgar.get('error')}")
    else:
        nse = _get_nse_results(ticker)
        bundle["filings"] = nse["data"]

    query = f"{ticker} {quarter + ' ' if quarter else ''}quarterly results earnings"
    try:
        news = _search_news(query)
        items = (news.get("data") or {}).get("items", []) if isinstance(news, dict) else []
        if items:
            bundle["news"] = items[:5]
        else:
            gaps.append(f"quarterly news empty ({(news or {}).get('error') or 'no items'})")
    except Exception as exc:
        gaps.append(f"quarterly news error: {exc}")
    bundle["gaps"] = gaps
    ok = any(key in bundle for key in ("statement", "edgar", "filings", "news"))
    return {"ok": ok, "data": bundle,
            "source": _source(f"quarterly results {ticker}", "bundle",
                              url=None), "error": None if ok else "; ".join(gaps)}


get_edgar_quarterly = NativeFunctionTool(
    name="get_edgar_quarterly",
    description=("Get recent US quarterly filings (10-Q/10-K/8-K) with SEC archive "
                 "document URLs. US tickers only; needs no key."),
    args_schema=EdgarQuarterlyArgs,
    function=_get_edgar_quarterly,
    cache_ttl_s=3600,
)

get_nse_results = NativeFunctionTool(
    name="get_nse_results",
    description=("Get official NSE/BSE filing deep links for an Indian ticker. "
                 "Download the result PDF and upload for RAG analysis."),
    args_schema=NseResultsArgs,
    function=_get_nse_results,
    cache_ttl_s=900,
)

get_quarterly_results = NativeFunctionTool(
    name="get_quarterly_results",
    description=("Get one quarterly bundle: quarterly statement + filings "
                 "(EDGAR for US, NSE/BSE links for India) + earnings news. "
                 "Missing legs become gaps, never invented numbers."),
    args_schema=QuarterlyResultsArgs,
    function=_get_quarterly_results,
    cache_ttl_s=3600,
)
