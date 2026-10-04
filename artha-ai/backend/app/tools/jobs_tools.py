"""Jobs tools — structured postings from free official ATS APIs (no keys).

Greenhouse / Lever / Ashby all expose unauthenticated public JSON for
published postings. Resolution needs the company's board slug (see
``ats_registry.json``); without one the tool returns ok:false + a gap with
the careers-page fallback instead of inventing listings. LinkedIn and other
scrape-forbidden domains are rejected at the fetch boundary.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from .base import NativeFunctionTool
from .web_tools import _BLOCKED_SCRAPE_DOMAINS

_REGISTRY_PATH = Path(__file__).with_name("ats_registry.json")


def _source(title: str, provider: str, url: str | None = None) -> dict:
    return {"title": title, "url": url, "provider": provider,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def _registry() -> dict:
    try:
        data = json.loads(_REGISTRY_PATH.read_text())
        return {str(k).lower(): v for k, v in data.items() if not k.startswith("_")}
    except Exception:
        return {}


class SearchJobsArgs(BaseModel):
    company: str
    query: str | None = None
    limit: int = 8


class FetchJobDetailArgs(BaseModel):
    url: str


def _normalize(title, location, department, url, posted, provider) -> dict:
    return {"title": title or "Untitled role", "location": location,
            "department": department, "url": url, "posted_date": posted,
            "provider": provider}


def _greenhouse_board(slug: str, limit: int) -> list[dict]:
    import httpx
    resp = httpx.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
                     params={"content": "false"}, timeout=20,
                     headers={"User-Agent": "BullsEye-Research/1.0"})
    resp.raise_for_status()
    jobs = (resp.json() or {}).get("jobs", [])
    rows = []
    for job in jobs[:limit]:
        loc = job.get("location") or {}
        rows.append(_normalize(job.get("title"), loc.get("name"),
                               (job.get("departments") or [{}])[0].get("name"),
                               job.get("absolute_url"), job.get("updated_at"),
                               "greenhouse"))
    return rows


def _lever_board(slug: str, limit: int) -> list[dict]:
    import httpx
    for base in ("https://api.lever.co/v0/postings",
                 "https://api.eu.lever.co/v0/postings"):
        try:
            resp = httpx.get(f"{base}/{slug}", params={"mode": "json", "limit": limit},
                             timeout=20, headers={"User-Agent": "BullsEye-Research/1.0"})
            resp.raise_for_status()
            postings = resp.json()
            if isinstance(postings, list):
                return [_normalize(p.get("text"),
                                   (p.get("categories") or {}).get("location"),
                                   (p.get("categories") or {}).get("team"),
                                   p.get("hostedUrl"), p.get("createdAt"), "lever")
                        for p in postings[:limit]]
        except Exception:
            continue
    raise ValueError(f"lever board unreachable: {slug}")


def _ashby_board(slug: str, limit: int) -> list[dict]:
    import httpx
    resp = httpx.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}",
                     timeout=20, headers={"User-Agent": "BullsEye-Research/1.0"})
    resp.raise_for_status()
    jobs = (resp.json() or {}).get("jobs", [])
    return [_normalize(job.get("title"), job.get("location"),
                       job.get("department") or job.get("team"),
                       job.get("jobUrl"), job.get("publishedAt"), "ashby")
            for job in jobs[:limit]]


def _search_jobs(company: str, query: str | None = None, limit: int = 8) -> dict:
    from .base import clean_str
    company = clean_str(company, "") or ""
    query = clean_str(query)
    entry = _registry().get(company.lower())
    if not entry or entry.get("ats") in (None, "own_portal"):
        return {"ok": False,
                "error": (f"no ATS board registered for '{company}'. Add "
                          f"greenhouse/lever/ashby slug to ats_registry.json; fallback: "
                          f"fetch the official careers page + investor disclosures."),
                "data": {"company": company, "jobs": [],
                         "fallback": f"search_web('{company} official careers site')"},
                "source": _source(f"jobs {company}", "ats_registry")}
    ats, slug = entry.get("ats"), entry.get("slug")
    try:
        if ats == "greenhouse":
            rows = _greenhouse_board(slug, limit)
        elif ats == "lever":
            rows = _lever_board(slug, limit)
        elif ats == "ashby":
            rows = _ashby_board(slug, limit)
        else:
            raise ValueError(f"unknown ats '{ats}'")
    except Exception as exc:
        return {"ok": False, "error": str(exc),
                "data": {"company": company, "jobs": []},
                "source": _source(f"jobs {company}", ats or "ats")}
    if query:
        needle = query.lower()
        rows = [row for row in rows
                if needle in f"{row['title']} {row['department']}".lower()]
    return {"ok": True, "data": {"company": company, "jobs": rows[:limit]},
            "source": _source(f"jobs {company}", ats or "ats"), "error": None}


def _fetch_job_detail(url: str) -> dict:
    low = (url or "").lower()
    if any(domain in low for domain in _BLOCKED_SCRAPE_DOMAINS):
        return {"ok": False, "error": "linkedin.com fetching is forbidden (use official ATS postings)",
                "data": None, "source": _source(url, "httpx", url=url)}
    import httpx
    try:
        # Prefer raw ATS JSON when given an API URL.
        if "boards-api.greenhouse.io" in low or "api.lever.co" in low or "api.ashbyhq.com" in low:
            resp = httpx.get(url, timeout=20, headers={"User-Agent": "BullsEye-Research/1.0"})
            resp.raise_for_status()
            return {"ok": True, "data": {"url": url, "posting": resp.json()},
                    "source": _source(url, "ats", url=url), "error": None}
        from .web_tools import _fetch_page
        page = _fetch_page(url)
        if not page.get("ok"):
            return page
        text = (page.get("data") or {}).get("text", "")
        return {"ok": True, "data": {"url": url, "text": text[:8000]},
                "source": _source(url, "httpx", url=url), "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "data": None,
                "source": _source(url, "httpx", url=url)}


search_jobs = NativeFunctionTool(
    name="search_jobs",
    description=("Search structured job postings via official ATS boards "
                 "(Greenhouse/Lever/Ashby). Returns title/location/department/url/date. "
                 "ok:false when no board is registered — use careers-page fallback."),
    args_schema=SearchJobsArgs,
    function=_search_jobs,
)

fetch_job_detail = NativeFunctionTool(
    name="fetch_job_detail",
    description=("Fetch one job posting detail (ATS JSON preferred, page text fallback). "
                 "LinkedIn URLs are rejected."),
    args_schema=FetchJobDetailArgs,
    function=_fetch_job_detail,
)
