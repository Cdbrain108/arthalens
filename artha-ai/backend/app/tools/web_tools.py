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


def _search_ddg_lite(query: str, max_results: int = 8) -> list[dict]:
    """Lightweight direct HTTP search via DuckDuckGo Lite. Bypasses datacenter blocks and SDK overhead."""
    hits = []
    try:
        import httpx
        url = "https://lite.duckduckgo.com/lite/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        resp = httpx.post(url, data={"q": query}, headers=headers, timeout=8, follow_redirects=True)
        if resp.status_code == 200:
            html = resp.text
            link_matches = list(re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*class=[\'"]result-link[\'"][^>]*>(.*?)</a>', html, re.DOTALL))
            snippet_matches = list(re.finditer(r'<td[^>]*class=[\'"]result-snippet[\'"][^>]*>(.*?)</td>', html, re.DOTALL))
            for i, match in enumerate(link_matches[:max_results]):
                href = match.group(1).strip()
                title = re.sub(r'<[^>]+>', '', match.group(2)).strip()
                snippet = ""
                if i < len(snippet_matches):
                    snippet = re.sub(r'<[^>]+>', '', snippet_matches[i].group(1)).strip()
                if title and href:
                    hits.append({
                        "title": title,
                        "body": snippet or title,
                        "href": href
                    })
    except Exception:
        pass
    return hits


def _search_web(query: str) -> dict:
    from ..config import settings
    hits = []

    # 1. Primary: Direct DDG Lite (fastest, unblocked from cloud IPs)
    hits = _search_ddg_lite(query, max_results=8)

    # 2. Try official DDGS library if DDG Lite returned nothing
    if not hits:
        try:
            from ddgs import DDGS
            with DDGS(timeout=8) as ddgs:
                hits = list(ddgs.text(query, max_results=8)) or []
        except Exception:
            pass

    # 3. Resilient Fallback: Tavily API (when enabled)
    if not hits and settings.tavily_enabled:
        try:
            import httpx
            resp = httpx.post(
                f"{settings.tavily_base_url}/search",
                json={"query": query, "api_key": settings.tavily_api_key, "max_results": 6},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                for r in data.get("results", []):
                    hits.append({"title": r.get("title", ""), "body": r.get("content", ""), "href": r.get("url", "")})
        except Exception:
            pass

    # 4. Fallback: Google News RSS Search (free, reliable)
    if not hits:
        try:
            from .news_tools import _rss_search
            rss_hits = _rss_search(query, limit=6, resolve_urls=False)
            for r in rss_hits:
                hits.append({"title": r.get("title", ""), "body": r.get("title", ""), "href": r.get("url", "")})
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
