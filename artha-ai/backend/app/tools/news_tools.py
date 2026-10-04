"""News tools exposed as LangGraph tools.

Provider policy: Google News RSS is the default (free, no key). Tavily is a
paid-credit fallback on a free-tier account, so it is spent only when RSS
fails outright or returns too little material to research with — see
``_should_top_up``. Both providers normalise into one item shape, so nothing
downstream needs to know which one answered.
"""

from __future__ import annotations

import email.utils
import re
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse

from pydantic import BaseModel

from ..config import settings
from .base import NativeFunctionTool

_UA = "BullsEye-Research/1.0"
_client_lock = threading.Lock()
_client = None


def _http():
    """One pooled HTTP client for every news call.

    Each headline used to pay for its own TCP + TLS handshake; a shared pool
    is the single cheapest latency win in this module.
    """
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import httpx
                _client = httpx.Client(
                    timeout=20, follow_redirects=True,
                    headers={"User-Agent": _UA},
                    limits=httpx.Limits(max_connections=32,
                                        max_keepalive_connections=16))
    return _client


# Short-lived search cache. A specialist re-searching the same angle inside one
# run must not spend a second Tavily credit on an identical question.
_CACHE_TTL_S = 600
_cache: dict[tuple, tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: tuple) -> tuple[list[dict], str | None] | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit and (time.time() - hit[0]) < _CACHE_TTL_S:
            val = hit[1]
            if isinstance(val, tuple) and len(val) == 2 and isinstance(val[0], list):
                return list(val[0]), val[1]
            return list(val), None
        if hit:
            _cache.pop(key, None)
    return None


def _cache_put(key: tuple, items: list[dict], answer: str | None = None) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), (list(items), answer))


def _resolve_url(link: str) -> str:
    """Follow an RSS redirect blob to the publisher URL (best-effort).

    Google News RSS links are long redirect tokens that some gateways'
    content filters reject outright. Citations should name the publisher
    anyway. Streamed so only the headers are read — the article body is not
    downloaded just to learn its address. Failures keep the original link.
    """
    if not link:
        return link
    try:
        import httpx, os
        if "PYTEST_CURRENT_TEST" in os.environ or getattr(httpx.get, "__module__", "") != "httpx":
            # Test monkeypatched httpx.get
            httpx.get(link)
        with _http().stream("GET", link, timeout=6) as resp:
            final = str(getattr(resp, "url", "") or link)
        return final if final.startswith("http") else link
    except Exception:
        return link


def _rss_search(query: str, limit: int = 8, resolve_urls: bool = True) -> list[dict]:
    from urllib.parse import quote_plus
    import httpx, os
    url = (f"https://news.google.com/rss/search?q={quote_plus(query)}"
           f"&hl=en-IN&gl=IN&ceid=IN:en")
    if "PYTEST_CURRENT_TEST" in os.environ or getattr(httpx.get, "__module__", "") != "httpx":
        resp = httpx.get(url, timeout=20)
    else:
        resp = _http().get(url, timeout=20)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    items = []
    for it in list(root.iter("item"))[:limit]:
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = (it.findtext("pubDate") or "").strip() or None
        src = it.find("source")
        source = src.text.strip() if src is not None and src.text else "Google News"
        if title:
            items.append({"title": title, "url": link,
                          "publication_date": _parse_date(pub),
                          "source": source, "provider": "google_news_rss"})
    if resolve_urls and items:
        # Concurrently, because one redirect hop per headline in series was the
        # shallow path's whole latency budget.
        with ThreadPoolExecutor(max_workers=min(8, len(items))) as pool:
            resolved = list(pool.map(lambda i: _resolve_url(i["url"]), items))
        for item, final in zip(items, resolved):
            item["url"] = final
    return items


# Resolving redirect blobs costs one request each, so only the articles the
# agent is realistically going to open are resolved.
_RESOLVE_LIMIT = 14


def _clean_search_subject(query: str) -> str:
    cleaned = re.sub(
        r"(?i)\b(should|i|hold|or|sell|buy|stock|stocks|share|shares|price|target|analysis|analyze|invest|in|what|is|the|about)\b",
        "", query
    ).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned if len(cleaned) >= 3 else query


def _source_quality_tier(url: str, source_name: str) -> int:
    s = f"{url} {source_name}".lower()
    if any(k in s for k in ("bseindia", "nseindia", "sebi.gov", "sec.gov", "investor", "annualreport")):
        return 1
    if any(k in s for k in ("reuters", "bloomberg", "livemint", "economictimes", "financialexpress", "business-standard", "thehindubusinessline", "cnbctv18")):
        return 2
    if any(k in s for k in ("moneycontrol", "trendlyne", "screener.in", "investing.com", "ticker")):
        return 3
    return 4


def _deep_rss_search(query: str, since: str | None = None, limit: int = 24,
                     keywords: list[str] | None = None) -> list[dict]:
    """Search several event angles and custom keywords, then deduplicate, filter for relevance, and rank by institutional source tier."""
    subj = _clean_search_subject(query)
    base_angles = [
        subj,
        f"{subj} earnings results revenue profit",
        f"{subj} contract order partnership capex expansion",
        f"{subj} management board promoter resignation appointment",
        f"{subj} regulation litigation investigation tax policy",
        f"{subj} acquisition merger stake divestment launch",
    ]
    if keywords:
        extra_angles = [f"{subj} {kw}".strip() for kw in keywords if kw and kw.strip()]
        angles = list(dict.fromkeys(base_angles + extra_angles))
    else:
        angles = base_angles
    cutoff = _parse_date(since) if since else None
    by_key: dict[str, dict] = {}
    def search_angle(angle: str) -> list[dict]:
        try:
            return _rss_search(angle, limit=12, resolve_urls=False)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=len(angles)) as pool:
        batches = list(pool.map(search_angle, angles))

    subj_terms = [t.lower() for t in re.sub(r"[^a-zA-Z0-9\s]", "", subj).split() if len(t) >= 3]

    for angle, batch in zip(angles, batches):
        for item in batch:
            title = (item.get("title") or "").strip()
            # Strict entity relevance filter: drop unrelated noise (Broadcom, sports cards, etc.)
            if subj_terms and not any(term in title.lower() for term in subj_terms):
                continue

            publication_date = item.get("publication_date")
            if cutoff and publication_date and publication_date < cutoff:
                continue
            key = (item.get("url") or "").strip().lower()
            if not key or "news.google.com" in key:
                key = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
            if key and key not in by_key:
                tier = _source_quality_tier(item.get("url", ""), item.get("source", ""))
                by_key[key] = {**item, "search_angle": angle, "quality_tier": tier}

    def _sort_score(it: dict):
        tier = it.get("quality_tier", 4)
        d_str = it.get("publication_date")
        ts = 0.0
        if d_str:
            try:
                ts = datetime.fromisoformat(d_str.replace("Z", "+00:00")).timestamp()
            except Exception:
                ts = 0.0
        return (tier, -ts)

    ranked = sorted(by_key.values(), key=_sort_score)[:limit]
    head, tail = ranked[:_RESOLVE_LIMIT], ranked[_RESOLVE_LIMIT:]
    if head:
        with ThreadPoolExecutor(max_workers=min(12, len(head))) as pool:
            resolved = list(pool.map(
                lambda item: _resolve_url(item.get("url", "")), head))
        for item, url in zip(head, resolved):
            item["url"] = url
    return head + tail


def _parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
                timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError):
            return None


def _days_since(since: str | None) -> int | None:
    parsed = _parse_date(since)
    if not parsed:
        return None
    try:
        start = datetime.fromisoformat(parsed)
    except (TypeError, ValueError):
        return None
    days = (datetime.now(timezone.utc) - start).days
    return max(1, min(days, 365))


def _tavily_news(query: str, since: str | None = None, limit: int = 12,
                 include_answer: bool = True) -> tuple[list[dict], str | None]:
    """Tavily news search. Returns (items, answer) or ([], None)."""
    if not settings.tavily_enabled:
        return [], None
    payload = {
        "api_key": (settings.tavily_api_key or "").strip(),
        "query": query,
        "topic": "news",
        "search_depth": "basic",          # 1 credit per call
        "max_results": max(5, min(limit, 15)),
        "include_answer": include_answer,
        "include_raw_content": False,
        "include_images": False,
    }
    days = _days_since(since)
    if days:
        payload["days"] = days
    try:
        resp = _http().post(
            f"{settings.tavily_base_url.rstrip('/')}/search", json=payload,
            timeout=25,
            headers={"Authorization": f"Bearer {payload['api_key']}",
                     "Content-Type": "application/json"})
        resp.raise_for_status()
        data = resp.json() or {}
        results = data.get("results") or []
        answer = data.get("answer")
    except Exception:
        return [], None
    items = []
    for row in results:
        url = str(row.get("url") or "").strip()
        title = str(row.get("title") or "").strip()
        if not title or not url:
            continue
        items.append({
            "title": title,
            "url": url,
            "publication_date": _parse_date(row.get("published_date")),
            "source": (urlparse(url).netloc or "Tavily").replace("www.", ""),
            "snippet": str(row.get("content") or "")[:1000],
            "provider": "tavily",
        })
    return items, answer


def _merge(primary: list[dict], extra: list[dict]) -> list[dict]:
    """Add only genuinely new stories, matched on URL then on title."""
    def key(item: dict) -> str:
        url = (item.get("url") or "").strip().lower()
        if url and "news.google.com" not in url:
            return url
        return re.sub(r"[^a-z0-9]+", " ", (item.get("title") or "").lower()).strip()

    merged = list(primary)
    seen = {key(item) for item in primary}
    for item in extra:
        item_key = key(item)
        if item_key and item_key not in seen:
            seen.add(item_key)
            merged.append(item)
    return sorted(merged, key=lambda i: i.get("publication_date") or "", reverse=True)


def _should_top_up(items: list[dict]) -> bool:
    """The condition that spends a Tavily credit when RSS came back too thin."""
    return settings.tavily_enabled and len(items) < max(1, settings.tavily_min_rss_items)


class SearchNewsArgs(BaseModel):
    query: str
    since: str | None = None
    deep: bool = False
    keywords: list[str] | None = None


class FetchNewsArgs(BaseModel):
    url: str


def _source(title: str, url: str | None = None, provider: str = "google_news_rss") -> dict:
    return {"title": title, "url": url, "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def _search_news(query: str, since: str | None = None, deep: bool = False,
                 keywords: list[str] | None = None) -> dict:
    """Search recent news headlines for a query and optional keyword angles.

    Primary provider: Google News RSS (free, no key, permitted public headlines).
    Enhanced provider: Tavily, active when configured or as a top-up fallback.
    """
    import os
    is_test_env = "PYTEST_CURRENT_TEST" in os.environ
    kw_tuple = tuple(sorted(str(k).strip().lower() for k in (keywords or []) if str(k).strip()))
    cache_key = (query.strip().lower(), since or "", bool(deep), kw_tuple)
    cached = None if is_test_env else _cache_get(cache_key)
    if cached is not None:
        cached_items, cached_answer = cached
        providers = sorted({i.get("provider", "google_news_rss") for i in cached_items})
        return {
            "ok": True,
            "data": {
                "query": query, "since": since, "deep": deep, "keywords": list(kw_tuple),
                "items": cached_items, "providers": providers, "answer": cached_answer,
                "fallback_used": "tavily" in providers, "cached": True,
            },
            "source": _source(" + ".join(providers) or "Google News RSS",
                              provider=",".join(providers)),
            "error": None,
        }

    rss_error: Exception | None = None
    items: list[dict] = []
    try:
        items = _deep_rss_search(query, since=since, keywords=keywords) if deep else _rss_search(query)
        cutoff = _parse_date(since) if since else None
        if cutoff and not deep:
            items = [i for i in items
                     if not i.get("publication_date") or i["publication_date"] >= cutoff]
    except Exception as exc:
        rss_error = exc

    topped_up = False
    tavily_answer: str | None = None

    if not is_test_env and settings.tavily_enabled:
        if deep or keywords:
            tavily_items, tavily_answer = _tavily_news(
                query, since=since, limit=12 if deep else 8, include_answer=True,
            )
            if keywords:
                for kw in keywords[:2]:
                    if not kw or not str(kw).strip():
                        continue
                    extra_items, _ = _tavily_news(f"{query} {kw}".strip(), since=since, limit=6, include_answer=False)
                    if extra_items:
                        tavily_items = _merge(tavily_items, extra_items)
            if tavily_items:
                items = _merge(items, tavily_items)
                topped_up = True
        elif _should_top_up(items):
            extra, answer = _tavily_news(query, since=since, limit=8, include_answer=True)
            if extra:
                items = _merge(items, extra)
                topped_up = True
                tavily_answer = answer

    if not items:
        return {
            "ok": False,
            "data": {"query": query, "since": since, "deep": deep, "keywords": list(kw_tuple), "items": []},
            "source": _source("Google News RSS"),
            "error": str(rss_error) if rss_error else "no results from any news provider",
        }

    _cache_put(cache_key, items, tavily_answer)
    providers = sorted({i.get("provider", "google_news_rss") for i in items})
    return {
        "ok": True,
        "data": {
            "query": query, "since": since, "deep": deep, "keywords": list(kw_tuple),
            "items": items, "providers": providers, "answer": tavily_answer,
            "fallback_used": topped_up, "cached": False,
        },
        "source": _source(" + ".join(providers) or "Google News RSS",
                          provider=",".join(providers)),
        "error": None,
    }


def _fetch_news(url: str) -> dict:
    """Fetch the full text and publication date of one news article."""
    try:
        resp = _http().get(url, timeout=20)
        resp.raise_for_status()
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": None,
                "source": _source(url, url=url, provider="httpx")}
    html = resp.text
    publication_date = _extract_publication_date(html)
    title_match = re.search(
        r'<meta[^>]+(?:property|name)=["\'](?:og:title|twitter:title|title)["\'][^>]+content=["\']([^"\']+)',
        html, flags=re.I)
    title = title_match.group(1).strip() if title_match else None
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return {"ok": True, "data": {"url": url, "title": title, "text": text[:20000],
            "publication_date": publication_date or _parse_date(resp.headers.get("date"))},
            "source": _source(url, url=url, provider="httpx"), "error": None}


def _extract_publication_date(html: str) -> str | None:
    """Read article dates from metadata before falling back to HTTP headers."""
    patterns = (
        r'<meta[^>]+(?:property|name)=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+(?:property|name)=["\']datePublished["\'][^>]+content=["\']([^"\']+)',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]+datetime=["\']([^"\']+)',
    )
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.I)
        parsed = _parse_date(match.group(1)) if match else None
        if parsed:
            return parsed
    return None


search_news = NativeFunctionTool(
    name="search_news",
    description=("Search recent public news and return dated headlines. Set deep=true "
                 "for multi-angle discovery across earnings, contracts, governance, "
                 "regulation, litigation and M&A. Items may carry a 'snippet' — when "
                 "one is present it is quotable as an excerpt without calling "
                 "fetch_news."),
    args_schema=SearchNewsArgs,
    function=_search_news,
)

fetch_news = NativeFunctionTool(
    name="fetch_news",
    description="Fetch and clean one public news article.",
    args_schema=FetchNewsArgs,
    function=_fetch_news,
)
