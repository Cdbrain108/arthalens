"""Web tools exposed as LangGraph tools."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from pydantic import BaseModel

from .base import NativeFunctionTool


def _source(title: str, url: str | None = None, provider: str = "ddgs") -> dict:
    return {"title": title, "url": url, "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


class SearchWebArgs(BaseModel):
    query: str


class FetchPageArgs(BaseModel):
    url: str


def _search_web(query: str) -> dict:
    from ..config import settings
    hits = []
    
    # 1. Try DuckDuckGo
    try:
        from ddgs import DDGS
        with DDGS(timeout=10) as ddgs:
            hits = list(ddgs.text(query, max_results=8)) or []
    except Exception:
        pass

    # 2. Resilient Fallback: Tavily API (when DDGS hits h2/rate-limit issues)
    if not hits and settings.tavily_enabled:
        try:
            import httpx
            resp = httpx.post(
                f"{settings.tavily_base_url}/search",
                json={"query": query, "api_key": settings.tavily_api_key, "max_results": 6},
                timeout=12
            )
            if resp.status_code == 200:
                data = resp.json()
                for r in data.get("results", []):
                    hits.append({"title": r.get("title", ""), "body": r.get("content", ""), "href": r.get("url", "")})
        except Exception:
            pass

    # 3. Fallback: Google News RSS Search
    if not hits:
        try:
            from .news_tools import _search_rss
            rss_hits = _search_rss(query, limit=6)
            for r in rss_hits:
                hits.append({"title": r.get("title", ""), "body": r.get("snippet", ""), "href": r.get("url", "")})
        except Exception:
            pass

    if hits:
        return {"ok": True, "data": {"query": query, "results": hits},
                "source": _source("Web search", provider="multi"),
                "error": None}

    return {"ok": False, "error": "Search exhausted all backends",
            "data": {"query": query, "results": []},
            "source": _source("Web search", provider="multi")}


_BLOCKED_SCRAPE_DOMAINS = ("linkedin.com",)

def _fetch_page(url: str) -> dict:
    # Code-level guard (not prompt-only): unauthorized LinkedIn scraping is
    # never a dependency. Block it at the tool boundary for every agent.
    if any(domain in (url or "").lower() for domain in _BLOCKED_SCRAPE_DOMAINS):
        return {"ok": False, "error": "linkedin.com fetching is forbidden (use permitted career pages/disclosures)",
                "data": None, "source": _source(url, url=url, provider="httpx")}
    try:
        import httpx

        resp = httpx.get(url, timeout=20, follow_redirects=True,
                         headers={"User-Agent": "BullsEye-Research/1.0"})
        resp.raise_for_status()
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": None,
                "source": _source(url, url=url, provider="httpx")}
    text = re.sub(r"<script.*?</script>", " ", resp.text, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return {"ok": True, "data": {"url": url, "text": text[:20000]},
            "source": _source(url, url=url, provider="httpx"),
            "error": None}


search_web = NativeFunctionTool(
    name="search_web",
    description="Search the public web and return result snippets with URLs.",
    args_schema=SearchWebArgs,
    function=_search_web,
)

fetch_page = NativeFunctionTool(
    name="fetch_page",
    description="Fetch and clean the text of one public web page.",
    args_schema=FetchPageArgs,
    function=_fetch_page,
)
