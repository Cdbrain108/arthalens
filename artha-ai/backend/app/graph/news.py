"""Deterministic, provenance-preserving news specialist execution.

News is deliberately kept out of the LLM specialist path.  The search tool
already returns publisher headlines (and, when available, snippets), so this
module turns only those dated, linked records into the application's evidence
contract.  It never fetches article bodies or treats a headline as an
article-verified fact.
"""

from __future__ import annotations

import email.utils
import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from ..schemas.models import AgentResult
from ..tools import news_tools


_DEFAULT_WINDOW_DAYS = 30
_MAX_RESULTS = 8
_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_DMY_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b")
_RELATIVE_RE = re.compile(
    r"\b(?:last|past|previous)\s+(\d+)\s+(day|days|week|weeks|month|months)\b",
    re.IGNORECASE,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif not value:
        return None
    else:
        text = str(value).strip()
        parsed = None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except (TypeError, ValueError, OverflowError):
            try:
                parsed = email.utils.parsedate_to_datetime(text)
            except (TypeError, ValueError, OverflowError):
                return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _date_text(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    return parsed.isoformat() if parsed else None


def _requested_since(state: dict[str, Any], now: datetime) -> tuple[datetime, str]:
    """Return a practical explicit date filter, or the 30-day default."""
    for key in ("news_since", "since", "start_date", "from_date"):
        candidate = _parse_datetime(state.get(key))
        if candidate:
            return candidate, candidate.date().isoformat()

    query = str(state.get("query") or "")
    iso = _DATE_RE.search(query)
    if iso:
        candidate = _parse_datetime(iso.group(1))
        if candidate:
            return candidate, candidate.date().isoformat()

    dmy = _DMY_RE.search(query)
    if dmy:
        day, month, year = (int(part) for part in dmy.groups())
        try:
            candidate = datetime(year, month, day, tzinfo=timezone.utc)
            return candidate, candidate.date().isoformat()
        except ValueError:
            pass

    relative = _RELATIVE_RE.search(query)
    if relative:
        count = int(relative.group(1))
        unit = relative.group(2).lower()
        days = count * (
            30 if unit.startswith("month") else 7 if unit.startswith("week") else 1
        )
        candidate = now - timedelta(days=days)
        return candidate, candidate.date().isoformat()

    horizon = str(state.get("time_horizon") or "")
    horizon_match = re.search(r"\b(\d+)\s*(?:d|day|days)\b", horizon, re.IGNORECASE)
    if horizon_match:
        candidate = now - timedelta(days=int(horizon_match.group(1)))
        return candidate, candidate.date().isoformat()

    candidate = now - timedelta(days=_DEFAULT_WINDOW_DAYS)
    return candidate, candidate.date().isoformat()


def _scoped_query(state: dict[str, Any]) -> str:
    query = str(state.get("query") or "").strip()
    scopes: list[str] = []
    for entity in state.get("entities") or []:
        if isinstance(entity, str):
            name, ticker = entity, None
        else:
            if entity.get("is_discovery"):
                continue
            name = str(entity.get("name") or "").strip()
            ticker = str(entity.get("ticker") or "").strip()
        if not name:
            continue
        # An untickered Tata request is intentionally group-scoped rather than
        # narrowed to one listed company.
        scope = "Tata group" if name.lower() == "tata" and not ticker else name
        if ticker and not ticker.startswith("^"):
            scope = f"{scope} {ticker}"
        scopes.append(scope)
    if not scopes:
        return query
    additions = " ".join(scopes)
    return query if additions.casefold() in query.casefold() else f"{query} {additions}".strip()


def _derived_keywords(state: dict[str, Any]) -> list[str]:
    """Generate high-signal keyword angles for multi-dimensional news extraction."""
    explicit = state.get("news_keywords") or state.get("keywords")
    if isinstance(explicit, list) and explicit:
        return [str(k).strip() for k in explicit if str(k).strip()]

    angles = [
        "earnings quarterly results profit revenue margin",
        "capex expansion contract order partnership acquisition",
        "management board promoter CEO resignation appointment",
        "regulatory RBI SEBI litigation investigation tax compliance",
    ]
    query = str(state.get("query") or "").lower()
    if "ipo" in query or "listing" in query:
        angles.insert(0, "IPO listing valuation draft prospectus issue size")
    if "merger" in query or "acquisition" in query or "m&a" in query:
        angles.insert(0, "merger acquisition stake buyout divestment")
    if "debt" in query or "rbi" in query or "cic" in query:
        angles.insert(0, "RBI CIC debt surrender exemption compliance")
    if "ai" in query or "semiconductor" in query:
        angles.insert(0, "semiconductor chip AI technology investments")
    return angles


def _item_source(item: dict[str, Any], envelope: dict[str, Any]) -> str:
    source = item.get("source") or item.get("publisher")
    if isinstance(source, dict):
        source = source.get("title") or source.get("name")
    if source:
        return str(source).strip()
    envelope_source = envelope.get("source") or {}
    if isinstance(envelope_source, dict) and envelope_source.get("title"):
        return str(envelope_source["title"]).strip()
    return "Google News RSS"


def _retrieved_at(item: dict[str, Any], envelope: dict[str, Any], now: datetime) -> str:
    value = item.get("retrieved_at")
    source = envelope.get("source") or {}
    if not value and isinstance(source, dict):
        value = source.get("retrieved_at")
    return _date_text(value) or now.isoformat()


def _evidence_id(title: str, url: str, publication_date: str) -> str:
    material = "|".join((title, url, publication_date))
    return "ev_news_" + hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]


def _empty_result(company: str, timestamp: str, gaps: list[str], reasoning: str) -> AgentResult:
    return AgentResult(
        agent="news",
        company=company,
        timestamp=timestamp,
        reasoning=reasoning,
        confidence="low",
        data_gaps=list(dict.fromkeys(gaps)),
    )


def run_news_specialist(state: dict[str, Any]) -> AgentResult:
    """Search RSS deterministically and return only usable grounded evidence."""
    now = _now()
    timestamp = now.isoformat()
    company = " / ".join(
        str(entity.get("name") if isinstance(entity, dict) else entity)
        for entity in (state.get("entities") or [])
        if (entity.get("name") if isinstance(entity, dict) else entity)
    ) or "UNKNOWN"
    since, since_text = _requested_since(state, now)
    query = _scoped_query(state)
    base_reasoning = (
        f"Deterministic news search for '{query}' since {since_text}; retained dated "
        "publisher reports. Article excerpts are fetched where accessible; neither "
        "headlines nor article text are independently verified facts."
    )

    keywords = _derived_keywords(state)
    entities = state.get("entities") or []
    raw_items: list[dict[str, Any]] = []
    envelope: dict[str, Any] = {}

    if len(entities) > 1:
        # Search news for each entity individually to ensure full coverage across all peers
        for ent in entities:
            ent_name = ent.get("name") if isinstance(ent, dict) else str(ent)
            ent_ticker = ent.get("ticker") if isinstance(ent, dict) else ""
            ent_q = f"{ent_name} {ent_ticker}".strip() or ent_name
            try:
                env = news_tools.search_news.invoke({
                    "query": ent_q,
                    "since": since_text,
                    "deep": False,
                })
                if isinstance(env, dict) and isinstance((env.get("data") or {}).get("items"), list):
                    raw_items.extend(env["data"]["items"][:5])
                    if not envelope:
                        envelope = env
            except Exception:
                pass
    else:
        try:
            envelope = news_tools.search_news.invoke({
                "query": query,
                "since": since_text,
                "deep": True,
                "keywords": keywords,
            })
            if isinstance(envelope, dict):
                data = envelope.get("data") or {}
                raw_items = data.get("items") if isinstance(data, dict) else []
        except Exception:
            raw_items = []

    # Fallback to simple company headline query if deep search returned 0 items
    if not raw_items and entities:
        for ent in entities[:2]:
            ent_name = ent.get("name") if isinstance(ent, dict) else str(ent)
            try:
                fb_env = news_tools.search_news.invoke({"query": ent_name, "since": since_text, "deep": False})
                if isinstance(fb_env, dict) and isinstance((fb_env.get("data") or {}).get("items"), list):
                    raw_items.extend(fb_env["data"]["items"][:4])
                    if not envelope:
                        envelope = fb_env
            except Exception:
                pass

    if not isinstance(raw_items, list):
        raw_items = []

    evidence: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    seen: set[str] = set()
    excluded_undated = excluded_future = excluded_old = excluded_invalid = 0
    aliases = [str(e.get(k) or "").casefold() for e in state.get("entities", [])
               if isinstance(e, dict) for k in ("name", "ticker") if e.get(k)]
    for raw in raw_items:
        if not isinstance(raw, dict):
            excluded_invalid += 1
            continue
        title = str(raw.get("title") or raw.get("headline") or "").strip()
        url = str(raw.get("url") or raw.get("link") or "").strip()
        publication = _parse_datetime(
            raw.get("publication_date") or raw.get("published_at") or raw.get("published")
        )
        if not title or not url or not url.lower().startswith(("http://", "https://")):
            excluded_invalid += 1
            continue
        if not publication:
            excluded_undated += 1
            continue
        if publication > now:
            excluded_future += 1
            continue
        if publication < since:
            excluded_old += 1
            continue
        searchable = (title + " " + str(raw.get("snippet") or raw.get("description") or "")).casefold()
        if aliases and not any(re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", searchable)
                               for alias in aliases):
            excluded_invalid += 1
            continue
        dedupe_key = url.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        publication_text = publication.isoformat()
        source = _item_source(raw, envelope)
        snippet = str(raw.get("snippet") or raw.get("description") or "").strip()
        excerpt = f"Headline: {title}"
        if snippet:
            excerpt += f"\nSnippet: {snippet[:1200]}"
        claim = f"Publisher reports: {title}"
        evidence_id = _evidence_id(title, url, publication_text)
        evidence.append({
            "evidence_id": evidence_id,
            "claim": claim,
            "source_title": source,
            "source_url": url,
            "publication_date": publication_text,
            "retrieved_at": _retrieved_at(raw, envelope, now),
            "excerpt": excerpt,
            "agent": "news",
            "evidence_type": "secondary",
            "claim_type": "fact",
            "confidence": "medium",
            "source_type": "news_article",
            "coverage": "headline",
            "sentiment": "neutral",
        })
        findings.append({"claim": claim, "evidence_ids": [evidence_id]})

    evidence.sort(key=lambda item: item["publication_date"], reverse=True)
    evidence = evidence[:_MAX_RESULTS]
    # Fetch a bounded set in parallel. A blocked publisher remains headline-only.
    from concurrent.futures import ThreadPoolExecutor
    def fetch_article(item):
        try:
            out = news_tools.fetch_news.invoke({"url": item["source_url"]}) or {}
        except Exception:
            out = {}
        body = ((out or {}).get("data") or {}).get("text") or ""
        if out.get("ok") and len(body) >= 200 and "news.google.com" not in item["source_url"]:
            item["excerpt"] += "\nArticle excerpt: " + body[:2400]
            item["coverage"] = "article excerpt"
        # Transparent headline tone only; this is not an investment signal.
        text = item["claim"].casefold()
        positive = bool(re.search(r"\b(raises|beats|wins|expands|growth)\b", text))
        negative = bool(re.search(r"\b(layoffs|cuts|misses|lawsuit|falls|probe)\b", text))
        item["sentiment"] = "positive" if positive and not negative else "negative" if negative and not positive else "neutral"
    if evidence:
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(fetch_article, evidence[:3]))
    allowed_ids = {item["evidence_id"] for item in evidence}
    findings = [item for item in findings if item["evidence_ids"][0] in allowed_ids]
    sources = list(dict.fromkeys(item["source_title"] for item in evidence))
    gaps: list[str] = []
    if excluded_undated or excluded_future or excluded_old or excluded_invalid:
        gaps.append(
            "Excluded news items without usable dates/URLs or outside the requested "
            f"window (undated={excluded_undated}, future={excluded_future}, "
            f"older={excluded_old}, invalid={excluded_invalid})."
        )
    headline_count = sum(e.get("coverage") == "headline" for e in evidence)
    if headline_count:
        gaps.append(f"{headline_count} news items are headline/snippet-only; full article evidence unavailable. Headline tone uses disclosed keyword rules, not a sentiment score.")
    if not evidence:
        error = envelope.get("error")
        if error:
            gaps.append(f"News provider reported: {error}")
        gaps.append(f"No dated, non-future news results were available since {since_text}.")
        return _empty_result(company, timestamp, gaps, base_reasoning)

    return AgentResult(
        agent="news",
        company=company,
        timestamp=timestamp,
        reasoning=base_reasoning,
        findings=findings,
        evidence=evidence,
        sources=sources,
        confidence="medium",
        data_gaps=gaps,
    )
