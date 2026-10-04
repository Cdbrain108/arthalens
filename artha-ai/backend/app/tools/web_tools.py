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
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            hits = list(ddgs.text(query, max_results=8)) or []
        return {"ok": True, "data": {"query": query, "results": hits},
                "source": _source("DuckDuckGo search", provider="ddgs"),
                "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc),
                "data": {"query": query, "results": []},
                "source": _source("DuckDuckGo search", provider="ddgs")}


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
