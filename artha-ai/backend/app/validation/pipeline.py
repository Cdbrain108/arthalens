"""Validation pipeline — source existence/relevance, date, numeric consistency,
cross-source conflict detection, fact-vs-interpretation (Framework §L)."""
import itertools

from ..schemas.models import EvidenceItem, ValidationResult, Conflict


def run_validation(evidence: list[dict]) -> tuple[list[ValidationResult],
                                                  list[Conflict], list[str]]:
    items = [EvidenceItem(**e) for e in evidence]
    results: list[ValidationResult] = []
    gaps: list[str] = []

    for item in items:
        # Trusted internal sources carry no public URL: deterministic
        # calculations by source_type, provider feeds by recognized title
        # (e.g. "yfinance quote TCS", "DuckDuckGo search"), uploaded docs by
        # document_id. Generic titles like "Exchange filing" with no URL,
        # no doc ID, and no recognized provider still fail. Web/news claims
        # require a URL (or a document_id for archived copies).
        has_source = False
        if item.source_type == "deterministic_calculation":
            has_source = bool(item.source_title)
        elif item.source_type == "uploaded_document":
            has_source = bool(item.source_title and (item.document_id or item.source_url))
        elif item.source_type == "provider" and _is_trusted_provider(item.source_title):
            has_source = bool(item.source_title)
        else:
            has_source = bool(item.source_title and (item.source_url or item.document_id))
        checks = {
            "source_exists": has_source,
            "date_known": item.publication_date is not None,
            "excerpt_present": bool(item.excerpt),
            "numeric_typed": item.value is None or item.unit is not None,
            "relevance_known": item.relevance is None or 0 <= item.relevance <= 1,
            "calc_inputs_retained": item.source_type != "deterministic_calculation"
            or bool(item.calc_inputs),
        }
        checks["numeric_finite"] = not isinstance(item.value, (int, float)) or __import__("math").isfinite(item.value)
        passed = (checks["source_exists"] and checks["excerpt_present"]
                  and checks["relevance_known"] and checks["calc_inputs_retained"]
                  and checks["numeric_typed"] and checks["numeric_finite"])
        results.append(ValidationResult(
            evidence_claim=item.claim, passed=passed, checks=checks,
            note="" if passed else "insufficient provenance"))
        if not passed:
            gaps.append(f"Unvalidated claim: {item.claim[:80]}")

    conflicts = _detect_conflicts(items)
    for c in conflicts:
        if c.resolution is None:
            gaps.append(f"Unresolved conflict: {c.claim[:80]} "
                        f"({c.source_a} vs {c.source_b})")
    return results, conflicts, gaps


_TRUSTED_PROVIDER_TITLE_HINTS = (
    "yfinance", "deterministic", "duckduckgo", "ddgs",
    "google news", "bulls eye", "faiss",
    "sec edgar", "nse", "bse", "quarterly results",
    "jobs", "greenhouse", "lever", "ashby",
)


def _is_trusted_provider(title: str | None) -> bool:
    low = (title or "").lower()
    return any(hint in low for hint in _TRUSTED_PROVIDER_TITLE_HINTS)


def _detect_conflicts(items: list[EvidenceItem]) -> list[Conflict]:
    """Cross-source numeric conflict detection: same claim+unit, values differ
    beyond tolerance -> flag for period/basis/revision check."""
    conflicts: list[Conflict] = []
    by_key: dict[tuple, list[EvidenceItem]] = {}
    for item in items:
        if item.value is None or item.claim_type != "fact":
            continue
        key = (item.metric or item.claim.lower().strip(), item.unit,
               item.entity, item.period, item.basis)
        by_key.setdefault(key, []).append(item)
    for (claim, _unit, _entity, _period, _basis), group in by_key.items():
        numeric = [g for g in group if isinstance(g.value, (int, float))]
        # Every pair, not just adjacent ones: a disagreement between two sources
        # was previously missed whenever the pair sitting between them happened
        # to agree. Only the widest spread per claim is reported, so a large
        # group cannot flood the report with restatements of one disagreement.
        worst = None
        for a, b in itertools.combinations(numeric, 2):
            if a.source_title == b.source_title:
                continue
            spread = abs(a.value - b.value)
            if spread > 0.02 * max(abs(a.value), abs(b.value), 1e-9):
                if worst is None or spread > worst[0]:
                    worst = (spread, a, b)
        if worst is not None:
            _spread, a, b = worst
            conflicts.append(Conflict(
                claim=claim, value_a=str(a.value), value_b=str(b.value),
                source_a=a.source_title, source_b=b.source_title,
                resolution=None, evidence_ids=[i.evidence_id for i in group if i.evidence_id]))
    return conflicts
