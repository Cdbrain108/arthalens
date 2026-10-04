"""Deterministic report assembly from the accepted evidence packet only.

No provider calls belong here: every displayed measurement must refer to evidence
collected before validation. Historical reports retain their original schema.
"""
from datetime import datetime, timezone
import math
import re

from ..schemas.models import ReportJSON

UNAVAILABLE = "Unavailable — evidence gap (no validated evidence)."
SPECIALIST_SECTIONS = ("financial", "valuation", "market", "growth", "news",
                       "workforce", "risk", "industry", "management", "social", "document")
AGENT_LABELS = {name: f"{name.title()} Agent" for name in SPECIALIST_SECTIONS}
AGENT_LABELS.update(workforce="Hiring & Workforce", market="Market & Technicals")
METRICS = {
    "roe_pct": ("ROE (return on equity)", "%", "Profit earned on shareholder capital.",
                "net_income / average_equity × 100"),
    "opm_pct": ("Operating margin", "%", "Operating profit kept from each 100 of sales.",
                "operating_income / revenue × 100"),
    "npm_pct": ("Net profit margin", "%", "Profit after costs and tax; it is not cash flow.",
                "net_income / revenue × 100"),
    "debt_equity": ("Debt / equity", "x", "Borrowing relative to shareholder capital.",
                    "total_debt / equity"),
    "pe_ratio": ("P/E (price to earnings)", "x", "Price paid for one unit of annual earnings. A low ratio can also reflect risk.",
                 "price / trailing_eps"),
    "pb_ratio": ("P/B (price to book)", "x", "Price relative to book value. Compare similar businesses.",
                 "price / book_value_per_share"),
    "dividend_yield_pct": ("Dividend yield", "%", "Annual dividend relative to price; payouts can change.",
                           "dividend_per_share / price × 100"),
}


def _finding_text(value):
    return str(value.get("claim", "")) if isinstance(value, dict) else str(value)


def _citation_index(evidence):
    sources, by_id, seen = [], {}, {}
    for item in evidence:
        key = (item.get("source_title"), item.get("source_url"), item.get("document_id"),
               item.get("page"), item.get("publication_date"))
        if key not in seen:
            seen[key] = len(sources) + 1
            sources.append({"n": seen[key], "title": item.get("source_title"),
                            "url": item.get("source_url"), "page": item.get("page"),
                            "document_id": item.get("document_id"),
                            "publication_date": item.get("publication_date"),
                            "retrieved_at": item.get("retrieved_at")})
        if item.get("evidence_id"):
            by_id[item["evidence_id"]] = seen[key]
    return sources, by_id


def _build_citation_index(evidence):
    return _citation_index(evidence)[0]


def _cited(items, citations, by_claim=None):
    out = []
    for item in items or []:
        claim = _finding_text(item).strip()
        ids = item.get("evidence_ids", []) if isinstance(item, dict) else []
        refs = sorted({citations[i] for i in ids if i in citations})
        if not refs and by_claim and claim.lower() in by_claim:
            refs = [by_claim[claim.lower()]]
        if claim and refs:
            out.append({"claim": claim, "citations": refs, "evidence_ids": ids})
    return out


def grounding_coverage(state):
    """Claim-link coverage, not a claim that a source is independently verified."""
    counts = state.get("claim_coverage")
    if counts:
        total, accepted = counts.get("total", 0), counts.get("accepted", 0)
    else:
        evidence = state.get("evidence") or []
        ids = {e.get("evidence_id") for e in evidence if e.get("evidence_id")}
        claims = {e.get("claim") for e in evidence}
        findings = [f for result in (state.get("agent_results") or {}).values()
                    for field in ("findings", "positive_signals", "negative_signals", "risks")
                    for f in result.get(field, [])]
        total = len(findings)
        accepted = sum(bool(set(f.get("evidence_ids", [])) & ids)
                       if isinstance(f, dict) and f.get("evidence_ids")
                       else _finding_text(f) in claims for f in findings)
    return {"total": total, "accepted": accepted,
            "percentage": round(accepted / total * 100, 1) if total else 0.0}


def _agent_notes(state, citations):
    notes = []
    results = state.get("agent_results") or {}
    for name in dict.fromkeys([*(state.get("selected_agents") or []), *results]):
        result = results.get(name) or {}
        evidence = result.get("evidence") or []
        by_claim = {e["claim"].lower(): citations[e["evidence_id"]]
                    for e in evidence if e.get("evidence_id") in citations}
        status = (state.get('agent_statuses') or {}).get(name) or ("failed" if name in state.get("failed_agents", []) else (
            "partial" if evidence and result.get('data_gaps') else "completed" if evidence else "unavailable"))
        notes.append({
            "agent": name, "label": AGENT_LABELS.get(name, name.replace("_", " ").title()),
            "mandate": result.get("description", ""), "status": status,
            "thought": result.get("reasoning") or "No method note was returned.",
            "self_reported": bool(result.get("reasoning")),
            "confidence": result.get("confidence", "low"), "evidence_count": len(evidence),
            "sources": sorted({e["source_title"] for e in evidence}),
            "data_gaps": result.get("data_gaps", []),
            **{field: _cited(result.get(field), citations, by_claim)
               for field in ("findings", "positive_signals", "negative_signals", "risks")},
        })
    return notes


def _safe_prose(text, evidence):
    """Require real evidence IDs and reject numeric tokens absent from the packet.

    This is a structural guard, not independent fact verification. Source content
    and interpretations remain inspectable in the evidence drawer.
    """
    if not text:
        return False
    ids = set(re.findall(r"\[(ev_[\w-]+)\]", text))
    packet = {e.get("evidence_id"): e for e in evidence}
    if not ids or not ids <= packet.keys():
        return False
    body = re.sub(r"\[ev_[\w-]+\]", "", text)
    numbers = set(re.findall(r"(?<!\w)[+-]?\d[\d,.]*%?", body))
    source_text = " ".join(str(packet[i].get(k, "")) for i in ids
                           for k in ("claim", "excerpt", "value"))
    return all(n in source_text for n in numbers)


def _render_refs(text, citations):
    return re.sub(r"\[(ev_[\w-]+)\]", lambda m: f"[{citations[m[1]]}]"
                  if m[1] in citations else "[unavailable]", text)


def _measurements(evidence, ticker):
    metrics, rows, refs = {}, [], {}
    for item in evidence:
        key, value = item.get("metric"), item.get("value")
        if key not in METRICS or not isinstance(value, (int, float)) or not math.isfinite(value):
            continue
        if item.get("entity") and ticker and item["entity"] != ticker:
            continue
        if key in metrics or not item.get("evidence_id"):
            continue
        label, unit, meaning, formula = METRICS[key]
        metrics[key] = f"{value:.2f}{unit}"
        refs[key] = item["evidence_id"]
        rows.append({"metric": label, "value": metrics[key], "reported": metrics[key],
                     "sector": "Not established", "delta": "—", "assessment": "Measured",
                     "meaning": meaning, "formula": item.get("formula") or formula,
                     "inputs": item.get("calc_inputs", {}), "evidence_id": item["evidence_id"],
                     "source": item["source_title"], "date": item.get("period") or item.get("publication_date"),
                     "retrieved_at": item.get("retrieved_at")})
    return metrics, rows, refs


def assemble_report(report: dict, state: dict) -> ReportJSON:
    evidence = state.get("evidence") or []
    entities = state.get("entities") or []
    company = dict(entities[0] if entities else report.get("company") or {})
    sources, citations = _citation_index(evidence)
    notes = _agent_notes(state, citations)
    coverage = grounding_coverage(state)
    gaps = list(state.get("evidence_gaps") or [])
    r = ReportJSON(query=state.get("query") or report.get("query", ""), company=company,
                   sources=sources, evidence=evidence, agent_notes=notes,
                   conflicts=state.get("conflicts") or [], timestamps=state.get("timestamps") or {})
    r.agent_contributions = [n["agent"] for n in notes if n["evidence_count"]]
    results = state.get("agent_results") or {}
    for name in SPECIALIST_SECTIONS:
        packet = [e for e in evidence if e.get("agent") == name]
        by_claim = {e["claim"].lower(): citations[e["evidence_id"]]
                    for e in packet if e.get("evidence_id") in citations}
        findings = _cited(results.get(name, {}).get("findings"), citations, by_claim)
        if not findings:
            findings = _cited([e["claim"] for e in packet], citations, by_claim)
        # Keep legacy string findings and expose the stronger links separately.
        setattr(r, name, {"summary": findings[0]["claim"] if findings else UNAVAILABLE,
                          "findings": [f["claim"] for f in findings], "cited_findings": findings})
        gaps.extend(results.get(name, {}).get("data_gaps", []))

    classification = "INSUFFICIENT EVIDENCE"
    rationale = "Insufficient validated evidence to form an investment view."
    if evidence:
        classification = "NOT ASSESSED"
        rationale = "Evidence was collected; a supported investment classification was not established."
    for field in ("bull_case", "bear_case"):
        safe = [t for t in state.get(field, []) if _safe_prose(t, evidence)]
        setattr(r, field, [_render_refs(t, citations) for t in safe])
    proposed = report.get("overall_assessment") or {}
    enough = {"financial", "valuation", "risk"} <= set(r.agent_contributions)
    if (enough and r.bull_case and r.bear_case and not r.conflicts
            and proposed.get("classification") in {"BUY", "HOLD", "SELL"}
            and _safe_prose(proposed.get("rationale", ""), evidence)):
        classification = proposed["classification"]
        rationale = _render_refs(proposed["rationale"], citations)
    r.executive_summary = rationale
    r.overall_assessment = {
        "classification": classification, "rationale": rationale,
        "quality_score": None, "max_quality_score": None, "quality_rating": "Not scored",
        "evidence_grounding_pct": coverage["percentage"], "claim_coverage": coverage,
        "verified_sources_count": len(sources),
        "coverage_definition": "Original specialist claims linked to accepted evidence / all original specialist claims. Not independent source verification.",
        "data_currency": "See each source's publication and retrieval timestamps.",
    }
    if state.get("intent") == "conversational":
        r.company = {"name": "Bullseye", "is_conversational": True}
        r.executive_summary = "Ask about a company or ticker to begin evidence-backed stock research."
        r.overall_assessment["classification"] = "CONVERSATIONAL"
    elif state.get("intent") == "news":
        findings = []
        for e in evidence:
            if e.get("agent") != "news" or e.get("evidence_id") not in citations:
                continue
            findings.append({"claim": e["claim"], "publication_date": e.get("publication_date"),
                             "source_title": e["source_title"], "source_url": e.get("source_url"),
                             "citations": [citations[e["evidence_id"]]],
                             "sentiment": e.get("sentiment", "neutral"),
                             "coverage": e.get("coverage", "headline")})
        summary = (f"News briefing for {company.get('name', 'the company')}: {len(findings)} sourced reports."
                   if findings else "No validated news evidence was retrieved for this query.")
        r.news = {"summary": summary, "findings": findings}
        r.executive_summary = summary
        for name in SPECIALIST_SECTIONS:
            if name != "news":
                setattr(r, name, {})
        r.bull_case, r.bear_case = [], []
        r.overall_assessment.update(report_type="news", classification="NEUTRAL", quality_rating="N/A",
                                    rationale="News-only brief; no investment recommendation assessed.")
        if not findings:
            gaps.append("No validated news evidence was retrieved; news coverage is unavailable.")
    else:
        metrics, rows, refs = _measurements(evidence, company.get("ticker"))
        r.financial.update(metrics=metrics, ratios_table=rows, metric_evidence=refs)
        for e in evidence:
            if e.get("metric") == "price" and e.get("entity") == company.get("ticker"):
                r.market.update(price=e["value"], currency=e["unit"], quote={
                    "price": e["value"], "currency": e["unit"], "as_of": e.get("period"),
                    "evidence_id": e.get("evidence_id")})
                break
        if len(entities) > 1:
            r.company.update(is_comparison=True, comparison=[{
                **ent, "metrics": _measurements(evidence, ent.get("ticker"))[0]
            } for ent in entities])
            r.market.pop("price", None)
            r.market.pop("quote", None)
        if not metrics:
            gaps.append("Key ratios were not established by accepted, typed evidence.")
    r.what_could_change_view = [
        _render_refs(t, citations) for t in state.get("what_could_change_view", [])
        if _safe_prose(t, evidence)]
    r.workflow_trace = {"interpreted_intent": state.get("intent"),
                        "specialist_domains_activated": state.get("selected_agents", [])}
    r.timestamps.setdefault("assembled_at", datetime.now(timezone.utc).isoformat())
    r.evidence_gaps = sorted(set(gaps))
    return r
