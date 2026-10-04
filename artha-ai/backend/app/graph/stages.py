"""LangGraph pipeline stages — pure step functions.

These are the core step functions: dict in, state-delta dict out.
Called by LangGraph nodes in `app.graph.nodes`.
"""
from datetime import datetime, timezone
import hashlib

from ..llm import is_mock
from ..schemas.models import (QueryAnalysis, ResearchPlan, ChallengeOutput,
                              EvidenceItem, ValidationResult, ReportJSON)
from ..validation.pipeline import run_validation
from ..report.schema import assemble_report
from ..report.pdf import render_pdf
from .routing import enforce_policy
from . import meta


def _evidence_id(item: dict) -> str:
    """Return a stable ID for a source claim when a provider omitted one."""
    material = "|".join(str(item.get(key, "")) for key in (
        "agent", "claim", "source_title", "source_url", "document_id", "page",
        "publication_date", "excerpt"))
    return "ev_" + hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]


def _finding_parts(value) -> tuple[str, list[str], bool]:
    if isinstance(value, dict):
        return str(value.get("claim", "")), list(value.get("evidence_ids") or []), True
    return str(value), [], False


def _stamp(state, node):
    timestamps = dict(state.get("timestamps") or {})
    timestamps[node] = datetime.now(timezone.utc).isoformat()
    return {"current_node": node, "timestamps": timestamps}


def analyze_query(state: dict) -> dict:
    if is_mock():
        from ..llm_mock import mock_analyze
        a = mock_analyze(state["query"])
        entities = a["entities"]
        intent = a["intent"]
        time_horizon = a["time_horizon"]
        compare_mode = a["compare_mode"]
    else:
        analysis: QueryAnalysis = meta.analyze(state["query"])
        entities = [e.model_dump() for e in analysis.entities]
        intent = analysis.intent
        time_horizon = analysis.time_horizon
        compare_mode = analysis.compare_mode

    # Deterministic guardrail: Indian companies default to primary NSE (INR) listing
    # unless the query explicitly specifies US ADR / NYSE / NASDAQ / USD.
    INDIAN_NAMES = {"infosys", "tcs", "tata consultancy services", "reliance", "wipro", 
                    "hdfc bank", "icici bank", "bharti airtel", "itc", "state bank of india", 
                    "sbi", "larsen & toubro", "l&t", "tata motors"}
    INDIAN_TICKERS = {"INFY", "TCS", "RELIANCE", "WIPRO", "HDFCBANK", "ICICIBANK", "BHARTIARTL", "SBIN", "TATAMOTORS", "ITC", "LT"}
    q_lower = state.get("query", "").lower()
    is_explicit_us = any(k in q_lower for k in ("nyse", "nasdaq", "adr", "usd", "$"))

    for ent in entities:
        ent_name = (ent.get("name") or "").lower()
        ent_ticker = (ent.get("ticker") or "").upper()
        if (ent_name in INDIAN_NAMES or ent_ticker in INDIAN_TICKERS) and not is_explicit_us:
            ent["exchange"] = "NSE"

    return {**_stamp(state, "analyze_query"),
            "entities": entities,
            "intent": intent, "time_horizon": time_horizon,
            "compare_mode": compare_mode}


def create_plan(state: dict) -> dict:
    if is_mock():
        from ..llm_mock import mock_plan
        plan_d = mock_plan(state["intent"], state.get("compare_mode", False))
        from ..schemas.models import QueryAnalysis as _QA, ResearchPlan as _RP
        analysis = _QA(entities=state["entities"], intent=state["intent"],
            time_horizon=state.get("time_horizon"), compare_mode=state.get("compare_mode", False))
        selected = enforce_policy(analysis, _RP(**plan_d))
        return {**_stamp(state, "create_plan"),
                "research_plan": {**plan_d, "selected_agents": selected},
                "selected_agents": selected}
    analysis = QueryAnalysis(
        entities=state["entities"], intent=state["intent"],
        time_horizon=state.get("time_horizon"), compare_mode=state["compare_mode"])
    plan: ResearchPlan = meta.plan(state["query"], analysis)
    selected = enforce_policy(analysis, plan)  # deterministic guardrail
    return {**_stamp(state, "create_plan"),
            "research_plan": {**plan.model_dump(), "selected_agents": selected},
            "selected_agents": selected}


def validate_evidence(state: dict) -> dict:
    evidence, rejected, malformed = [], [], []
    gaps = list(state.get("evidence_gaps", []))
    for item in state.get("evidence", []):
        try:
            parsed = EvidenceItem.model_validate(item)
            if not parsed.evidence_id:
                parsed.evidence_id = _evidence_id(parsed.model_dump())
            evidence.append(parsed.model_dump())
        except (ValueError, TypeError):
            rejected.append(item)
            malformed.append(ValidationResult(
                evidence_claim=str(item.get("claim", "unknown"))
                if isinstance(item, dict) else "unknown",
                passed=False, note="malformed evidence"))
            gaps.append("Malformed evidence excluded from research")

    results, conflicts, validation_gaps = run_validation(evidence)
    gaps.extend(validation_gaps)
    disputed = {c.claim.lower().strip() for c in conflicts if c.resolution is None}
    accepted = []
    for item, result in zip(evidence, results):
        if result.passed and item["claim"].lower().strip() not in disputed:
            accepted.append(item)
        else:
            rejected.append(item)

    grounded = {}
    for name, result in state.get("agent_results", {}).items():
        items = [item for item in accepted if item["agent"] == name]
        claims = {item["claim"] for item in items}
        ids = {item["evidence_id"] for item in items}
        safe = dict(result)
        safe["evidence"] = items
        for field in ("findings", "positive_signals", "negative_signals", "risks"):
            grounded_findings = []
            had_structured = False
            for raw in result.get(field, []) or []:
                claim, linked_ids, structured = _finding_parts(raw)
                had_structured = had_structured or structured
                valid_ids = [evidence_id for evidence_id in linked_ids if evidence_id in ids]
                if not valid_ids and claim in claims:
                    valid_ids = [item["evidence_id"] for item in items if item["claim"] == claim]
                if not valid_ids:
                    for it in items:
                        it_c = it["claim"].lower()
                        c_low = claim.lower()
                        if it_c in c_low or c_low in it_c or (it.get("value") is not None and str(it["value"]) in claim):
                            valid_ids.append(it["evidence_id"])
                            break
                if not valid_ids:
                    gaps.append(f"{name}: unlinked {field[:-1] if field.endswith('s') else field} excluded from synthesis")
                    continue
                grounded_findings.append(
                    {"claim": claim, "evidence_ids": valid_ids}
                    if structured or linked_ids else claim
                )
            if field == "findings" and not grounded_findings and items:
                safe[field] = [
                    {"claim": item["claim"], "evidence_ids": [item["evidence_id"]]}
                    if had_structured else item["claim"]
                    for item in items
                ]
            elif not had_structured and field == "findings":
                safe[field] = list(dict.fromkeys(item["claim"] for item in items))
            elif not had_structured:
                safe[field] = list(dict.fromkeys(
                    (item["claim"] if isinstance(item, dict) else item)
                    for item in grounded_findings))
            else:
                safe[field] = grounded_findings
        safe["sources"] = sorted({item["source_title"] for item in items})
        if not items:
            safe["confidence"] = "low"
            gaps.append(f"{name}: no validated evidence")
        gaps.extend(result.get("data_gaps", []))
        grounded[name] = safe
    if not accepted:
        gaps.append("No validated evidence available; no investment assessment can be made")
    return {**_stamp(state, "validate_evidence"),
            "validation_results": [r.model_dump() for r in results + malformed],
            "conflicts": [c.model_dump() for c in conflicts],
            "evidence": accepted, "rejected_evidence": rejected,
            "agent_results": grounded, "evidence_gaps": sorted(set(gaps))}


def bull_bear_risk(state: dict) -> dict:
    if not state.get("evidence"):
        return {**_stamp(state, "bull_bear_risk"), "bull_case": [], "bear_case": [],
                "risks": ["Insufficient validated evidence to assess risks."],
                "what_could_change_view": ["Obtain verifiable evidence before forming a view."]}
    if is_mock():
        from ..llm_mock import mock_challenge
        out = mock_challenge(state.get("evidence", []), state.get("query", ""))
        return {**_stamp(state, "bull_bear_risk"), **out}
    try:
        out: ChallengeOutput = meta.challenge(state["query"], state.get("evidence", []))
        return {**_stamp(state, "bull_bear_risk"), **out.model_dump()}
    except Exception as exc:
        from ..llm_mock import mock_challenge
        out = mock_challenge(state.get("evidence", []), state.get("query", ""))
        out["risks"] = list(out.get("risks", [])) + [
            f"Adversarial review fell back to deterministic assembly ({exc})."]
        return {**_stamp(state, "bull_bear_risk"), **out}


def synthesize(state: dict) -> dict:
    if state.get("intent") == "conversational" or not (state.get("entities") or []):
        from ..llm_mock import mock_synthesize
        rep = mock_synthesize(dict(state))
        return {**_stamp(state, "synthesize"), "synthesis": rep, "report": rep}
    if not state.get("evidence"):
        report = ReportJSON(
            query=state["query"], company=(state.get("entities") or [{}])[0],
            executive_summary="Insufficient validated evidence to form an investment view.",
            overall_assessment={"classification": "INSUFFICIENT EVIDENCE",
                                "rationale": "No validated evidence is available."},
            evidence_gaps=state.get("evidence_gaps", []),
            what_could_change_view=state.get("what_could_change_view", []),
        ).model_dump()
        return {**_stamp(state, "synthesize"), "synthesis": report, "report": report}
    if is_mock():
        from ..llm_mock import mock_synthesize
        rep = mock_synthesize(dict(state))
        return {**_stamp(state, "synthesize"), "synthesis": rep, "report": rep}
    try:
        report: ReportJSON = meta.synthesize(state)
        return {**_stamp(state, "synthesize"), "synthesis": report.model_dump(),
                "report": report.model_dump()}
    except Exception as exc:
        from ..llm_mock import mock_synthesize
        rep = mock_synthesize(dict(state))
        rep["evidence_gaps"] = list(rep.get("evidence_gaps", [])) + [
            f"Live synthesis failed ({exc}); report assembled deterministically."]
        return {**_stamp(state, "synthesize"), "synthesis": rep, "report": rep}


def build_report(state: dict) -> dict:
    report = assemble_report(state["report"], state)
    return {**_stamp(state, "build_report"), "report": report.model_dump()}


def generate_pdf(state: dict) -> dict:
    path = render_pdf(ReportJSON(**state["report"]), job_id=state["job_id"])
    return {**_stamp(state, "generate_pdf"), "pdf_path": path}
