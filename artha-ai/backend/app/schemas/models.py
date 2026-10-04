"""Canonical Pydantic schemas — the contracts from AGENT_CONTRACTS.md as code."""
from typing import Any
from typing import Literal
from pydantic import BaseModel, Field, model_validator


def _confidence_level(value: Any) -> str:
    if isinstance(value, (int, float)):
        return "high" if value >= 0.7 else ("medium" if value >= 0.4 else "low")
    text = str(value or "").lower()
    if "high" in text:
        return "high"
    if "low" in text:
        return "low"
    return "medium"


_INTENT_ALIASES = {
    "conversational": {"conversational", "greeting", "hello", "hi", "hey", "help", "who are you", "what can you do", "chat"},
    "price_move": {"price_move", "price_movement", "explain_stock_price_move",
                   "stock_move", "intraday", "today_move"},
    "long_term": {"long_term", "long-term", "buy", "hold", "sell", "invest",
                  "long_term_investment", "multi_year"},
    "hiring": {"hiring", "jobs", "careers", "layoffs", "headcount"},
    "compare": {"compare", "comparison", "versus", "vs"},
    "document": {"document", "filing", "report", "transcript", "pdf"},
    # A news-only ask is its own intent: it routes to the news specialist alone
    # instead of falling through to "general" (market + news + financial).
    "news": {"news", "news_only", "headlines", "latest_news", "recent_news",
             "updates", "recent_updates", "announcements", "events",
             "news_flow", "developments", "press"},
}


def _normalize_intent(value: Any) -> str:
    text = str(value or "").lower().strip()
    for canonical, aliases in _INTENT_ALIASES.items():
        if text == canonical or text in aliases:
            return canonical
    return "general"


class Entity(BaseModel):
    name: str
    ticker: str | None = None
    exchange: str | None = None
    confidence: Literal["high", "medium", "low"] = "medium"

    @model_validator(mode="before")
    @classmethod
    def _coerce_confidence(cls, values: Any) -> Any:
        if isinstance(values, dict) and "confidence" in values:
            values = dict(values)
            values["confidence"] = _confidence_level(values["confidence"])
        return values


class QueryAnalysis(BaseModel):
    entities: list[Entity]
    intent: Literal["price_move", "long_term", "hiring", "compare", "document",
                    "news", "general", "conversational"]
    time_horizon: str | None = None
    compare_mode: bool = False
    reasoning: str = ""

    @model_validator(mode="before")
    @classmethod
    def _coerce_live_output(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        values = dict(values)
        values["intent"] = _normalize_intent(values.get("intent"))
        mode = values.get("compare_mode")
        if isinstance(mode, str):
            values["compare_mode"] = mode.lower() not in ("", "none", "false", "no", "0")
        else:
            values["compare_mode"] = bool(mode)
        return values


class ResearchPlan(BaseModel):
    steps: list[str]
    selected_agents: list[str]
    required_evidence: list[str] = Field(default_factory=list)
    rationale: str = ""

    @model_validator(mode="before")
    @classmethod
    def _coerce_live_output(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        values = dict(values)
        agents = values.get("selected_agents")
        if not agents:
            for alias in ("specialists", "agents"):
                if values.get(alias):
                    agents = values[alias]
                    break
        values["selected_agents"] = [str(a) for a in (agents or [])]
        if not isinstance(values.get("steps"), list):
            values["steps"] = []
        if not isinstance(values.get("required_evidence"), list):
            values["required_evidence"] = []
        if not isinstance(values.get("rationale"), str):
            values["rationale"] = str(values.get("rationale") or "")
        return values


class Finding(BaseModel):
    """A claim whose supporting evidence is explicit and addressable."""

    claim: str
    evidence_ids: list[str] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    evidence_id: str | None = None
    claim: str
    value: float | str | None = None
    unit: str | None = None
    source_title: str
    source_url: str | None = None
    publication_date: str | None = None
    retrieved_at: str
    document_id: str | None = None
    page: int | None = None
    excerpt: str = ""
    agent: str
    evidence_type: Literal["primary", "secondary"] = "secondary"
    claim_type: Literal["fact", "interpretation", "conclusion"] = "fact"
    confidence: Literal["high", "medium", "low"] = "medium"
    source_type: Literal[
        "provider", "uploaded_document", "deterministic_calculation",
        "web_page", "news_article"
    ] = "provider"
    relevance: float | None = None
    calc_inputs: dict = Field(default_factory=dict)
    metric: str | None = None
    entity: str | None = None
    period: str | None = None
    basis: str | None = None
    formula: str | None = None
    coverage: str | None = None
    sentiment: Literal["positive", "negative", "neutral"] = "neutral"


class AgentResult(BaseModel):
    agent: str
    status: Literal["completed", "partial", "unavailable"] = "completed"
    company: str
    timestamp: str
    # The specialist's own account of how it worked the question: what it
    # searched, what it weighed, what it discarded and why. Reported in the
    # report's agent-reasoning section; never a substitute for evidence.
    reasoning: str = ""
    findings: list[Finding] = Field(default_factory=list)
    positive_signals: list[Finding] = Field(default_factory=list)
    negative_signals: list[Finding] = Field(default_factory=list)
    risks: list[Finding] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"
    data_gaps: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_claim_strings(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        values = dict(values)
        for field in ("findings", "positive_signals", "negative_signals", "risks"):
            raw = values.get(field, []) or []
            values[field] = [
                {"claim": item} if isinstance(item, str) else item
                for item in raw
            ]
        # Models label their working notes inconsistently; accept the common
        # spellings rather than dropping the agent's reasoning on the floor.
        if not values.get("reasoning"):
            for alias in ("thought", "thoughts", "analysis", "approach",
                          "rationale", "method", "methodology"):
                if values.get(alias):
                    values["reasoning"] = values[alias]
                    break
        if not isinstance(values.get("reasoning"), str):
            values["reasoning"] = " ".join(
                str(part) for part in values["reasoning"]) if isinstance(
                    values.get("reasoning"), list) else str(values.get("reasoning") or "")
        return values

    def model_dump(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        """Serialize unlinked legacy findings as strings for old mock consumers.

        Once a finding has evidence IDs, the structured object is retained.
        This lets existing report/UI code consume old deterministic fixtures
        while live LangGraph results carry the stronger evidence contract.
        """
        data = super().model_dump(*args, **kwargs)
        for field in ("findings", "positive_signals", "negative_signals", "risks"):
            data[field] = [
                item["claim"] if not item.get("evidence_ids") else item
                for item in data.get(field, [])
            ]
        return data


class ValidationResult(BaseModel):
    evidence_claim: str
    passed: bool
    checks: dict[str, bool] = Field(default_factory=dict)  # source_exists/relevant/date/numeric
    note: str = ""


class Conflict(BaseModel):
    claim: str
    value_a: str
    value_b: str
    source_a: str
    source_b: str
    resolution: str | None = None  # None => disclosed, not resolved
    evidence_ids: list[str] = Field(default_factory=list)


class ChallengeOutput(BaseModel):
    bull_case: list[str]
    bear_case: list[str]
    risks: list[str]
    what_could_change_view: list[str]

    @model_validator(mode="before")
    @classmethod
    def _coerce_live_output(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        values = dict(values)
        for field in ("bull_case", "bear_case", "risks", "what_could_change_view"):
            raw = values.get(field)
            if raw is None:
                values[field] = []
            elif isinstance(raw, str):
                values[field] = [raw]
            else:
                values[field] = [str(item) for item in raw]
        return values


def _section_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        return {"summary": value, "findings": []}
    return {}


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return [str(item) if not isinstance(item, str) else item for item in value]


class ReportJSON(BaseModel):
    query: str
    company: dict = Field(default_factory=dict)
    executive_summary: str = ""
    overall_assessment: dict = Field(default_factory=dict)  # incl. BUY/HOLD/SELL decision-support
    financial: dict = Field(default_factory=dict)
    valuation: dict = Field(default_factory=dict)
    market: dict = Field(default_factory=dict)
    growth: dict = Field(default_factory=dict)
    news: dict = Field(default_factory=dict)
    workforce: dict = Field(default_factory=dict)
    risk: dict = Field(default_factory=dict)
    industry: dict = Field(default_factory=dict)
    management: dict = Field(default_factory=dict)
    social: dict = Field(default_factory=dict)
    document: dict = Field(default_factory=dict)
    evidence: list[dict] = Field(default_factory=list)
    conflicts: list[dict] = Field(default_factory=list)
    bull_case: list[str] = Field(default_factory=list)
    bear_case: list[str] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)
    what_could_change_view: list[str] = Field(default_factory=list)
    agent_contributions: list[str] = Field(default_factory=list)
    # Institutional decision framework, valuation sensitivity & monitoring
    decision_framework: dict = Field(default_factory=dict)  # hold_when, reduce_when, sell_when, base_stance
    valuation_scenarios: list[dict] = Field(default_factory=list)  # multiple sensitivity scenarios
    monitoring_indicators: list[dict] = Field(default_factory=list)  # 3-column quarterly watch items
    entity_card: dict = Field(default_factory=dict)  # Institutional entity card & scope
    reasoned_deductions: list[str] = Field(default_factory=list)  # 10-step analytical deduction chain
    intentional_limitations: list[str] = Field(default_factory=list)  # What this research intentionally does not claim
    workflow_trace: dict = Field(default_factory=dict)  # Execution trace: question, missing inputs, specialist domains
    # Per-specialist reasoning + its own findings, assembled deterministically
    # in report/schema.py and rendered immediately before the citation index.
    agent_notes: list[dict] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    timestamps: dict = Field(default_factory=dict)
    schema_version: str = "1.0"

    @model_validator(mode="before")
    @classmethod
    def _coerce_live_output(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        values = dict(values)
        values["query"] = str(values.get("query") or "")
        company = values.get("company")
        values["company"] = company if isinstance(company, dict) else (
            {"name": str(company)} if company else {})
        for field in ("executive_summary",):
            if values.get(field) is not None:
                values[field] = str(values[field])
        for field in ("overall_assessment", "financial", "valuation", "market",
                      "growth", "news", "workforce", "risk", "timestamps",
                      "decision_framework", "entity_card", "workflow_trace"):
            values[field] = _section_dict(values.get(field))
        for field in ("bull_case", "bear_case", "evidence_gaps",
                      "what_could_change_view", "agent_contributions",
                      "reasoned_deductions", "intentional_limitations"):
            values[field] = _string_list(values.get(field))
        values["valuation_scenarios"] = [item for item in values.get("valuation_scenarios", []) if isinstance(item, dict)] if isinstance(values.get("valuation_scenarios"), list) else []
        values["monitoring_indicators"] = [item for item in values.get("monitoring_indicators", []) if isinstance(item, dict)] if isinstance(values.get("monitoring_indicators"), list) else []
        sources = values.get("sources")
        if not isinstance(sources, list):
            values["sources"] = []
        else:
            values["sources"] = [
                item if isinstance(item, dict) else {"title": str(item)}
                for item in sources]
        notes = values.get("agent_notes")
        values["agent_notes"] = [item for item in notes
                                 if isinstance(item, dict)] if isinstance(notes, list) else []
        return values


class ReportAnswer(BaseModel):
    """A grounded answer to a question asked against a completed report."""

    answer: str
    sources: list[dict] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)
    follow_up_research_needed: bool = False


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "validating", "synthesizing",
                    "rendering", "succeeded", "failed"]
    query: str
    current_node: str = ""
    intent: str = ""
    entities: list[dict] = Field(default_factory=list)
    selected_agents: list[str] = Field(default_factory=list)
    completed_agents: list[str] = Field(default_factory=list)
    failed_agents: list[str] = Field(default_factory=list)
    agent_statuses: dict[str, str] = Field(default_factory=dict)
    agent_details: dict[str, dict] = Field(default_factory=dict)
    steps: list[dict] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)
