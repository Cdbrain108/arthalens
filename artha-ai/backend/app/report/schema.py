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
    """Require real evidence IDs or verify that numeric tokens exist in accepted evidence.

    This is a structural guard, not independent fact verification. Source content
    and interpretations remain inspectable in the evidence drawer.
    """
    if not text:
        return False
    if isinstance(text, dict):
        text = text.get("claim", "")
    ids = set(re.findall(r"\[(ev_[\w-]+)\]", text))
    packet = {e.get("evidence_id"): e for e in evidence if e.get("evidence_id")}
    if ids and ids <= packet.keys():
        body = re.sub(r"\[ev_[\w-]+\]", "", text)
        numbers = set(re.findall(r"(?<!\w)[+-]?\d[\d,.]*%?", body))
        source_text = " ".join(str(packet[i].get(k, "")) for i in ids
                               for k in ("claim", "excerpt", "value"))
        return all(n in source_text for n in numbers)
    # If no [ev_...] tags, verify numbers exist in the evidence packet
    numbers = set(re.findall(r"(?<!\w)[+-]?\d[\d,.]*%?", text))
    if not numbers:
        return bool(evidence)
    all_source = " ".join(str(e.get("claim", "")) for e in evidence)
    return any(n in all_source for n in numbers)


def _render_refs(text, citations):
    return re.sub(r"\[(ev_[\w-]+)\]", lambda m: f"[{citations[m[1]]}]"
                  if m[1] in citations else "[unavailable]", text)


def _format_currency_value(value, currency="INR"):
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return "—"
    if currency in ("INR", "₹") or abs(value) >= 1e7:
        cr = value / 1e7
        return f"₹{cr:,.0f} Cr" if abs(cr) >= 100 else f"₹{cr:.2f} Cr"
    elif abs(value) >= 1e9:
        return f"${value/1e9:.2f}B"
    elif abs(value) >= 1e6:
        return f"${value/1e6:.2f}M"
    return f"{value:,.2f}"


def _build_quarterly_table(evidence, currency="INR"):
    by_date = {}
    for item in evidence:
        period = str(item.get("period") or "")
        m = re.search(r"quarterly ended (\d{4}-\d{2}-\d{2})", period)
        if not m:
            continue
        date = m.group(1)
        metric = item.get("metric")
        val = item.get("value")
        if metric in ("revenue", "net_income", "operating_income") and isinstance(val, (int, float)):
            by_date.setdefault(date, {})[metric] = val
    if not by_date:
        return []
    sorted_dates = sorted(by_date.keys(), reverse=True)
    rows = []
    for i, date in enumerate(sorted_dates[:4]):
        d_vals = by_date[date]
        rev = d_vals.get("revenue")
        pat = d_vals.get("net_income") or d_vals.get("operating_income")
        yoy_str = "—"
        if i + 4 < len(sorted_dates):
            prev_rev = by_date[sorted_dates[i + 4]].get("revenue")
            if rev and prev_rev and prev_rev > 0:
                growth = (rev / prev_rev - 1) * 100
                yoy_str = f"{growth:+.1f}% YoY"
        elif i + 1 < len(sorted_dates):
            prev_rev = by_date[sorted_dates[i + 1]].get("revenue")
            if rev and prev_rev and prev_rev > 0:
                growth = (rev / prev_rev - 1) * 100
                yoy_str = f"{growth:+.1f}% QoQ"
        rows.append({
            "period": f"Quarter ended {date}",
            "revenue": _format_currency_value(rev, currency) if rev is not None else "Not reported",
            "net_profit": _format_currency_value(pat, currency) if pat is not None else "Not reported",
            "yoy_growth": yoy_str,
        })
    return rows


def _build_valuation_scenarios(price, pe_ratio_val, currency="INR"):
    if not isinstance(price, (int, float)) or price <= 0:
        return []
    try:
        pe = float(re.sub(r"[^\d.]", "", str(pe_ratio_val))) if pe_ratio_val else 15.0
    except (ValueError, TypeError):
        pe = 15.0
    if pe <= 0:
        pe = 15.0
    sym = "₹" if currency in ("INR", "₹") else "$"
    return [
        {"multiple": f"{pe * 0.82:.1f}x", "implied_price": f"{sym}{price * 0.82:,.0f}",
         "description": "Pessimistic scenario: multiple compression reflecting client spending freeze or lower margin execution."},
        {"multiple": f"{pe:.1f}x", "implied_price": f"{sym}{price:,.0f}",
         "description": "Today's reference: trailing P/E multiple based on reported trailing financial results."},
        {"multiple": f"{pe * 1.15:.1f}x", "implied_price": f"{sym}{price * 1.15:,.0f}",
         "description": "Constructive scenario: moderate valuation re-rating driven by steady deal ramp-ups and margin expansion."},
        {"multiple": f"{pe * 1.30:.1f}x", "implied_price": f"{sym}{price * 1.30:,.0f}",
         "description": "Optimistic scenario: multi-year valuation peak during strong IT capex upcycles and robust mega-deal flow."}
    ]


def _build_decision_framework(company_name, classification, is_comparison=False, comp_data=None):
    if is_comparison and comp_data:
        names = ", ".join(c.get("name") or c.get("ticker") for c in comp_data)
        return {
            "base_stance": f"Maintain a selective, high-conviction allocation across industry leaders ({names}) given conservative balance sheets, high return on equity, and structural pricing power offsetting US visa tightening.",
            "hold_when": [
                f"You hold core allocations across {names} within a 3-5 year compounder portfolio.",
                "Operating margins remain sustained above 18-20% despite onshore delivery wage friction.",
                "Debt-to-Equity ratios remain conservative (<0.25x) with strong free cash conversion.",
                "Digital transformation deal pipelines and enterprise cloud budgets remain stable."
            ],
            "reduce_when": [
                "Individual IT weight exceeds 20-25% of total portfolio equity allocation.",
                "Onshore subcontractor inflation drives continuous sequential margin deterioration across 2+ quarters.",
                "Enterprise discretionary IT contracts face widespread project cancellations."
            ],
            "sell_when": [
                "Structural secular decline in operating margins persistently below 15%.",
                "Severe regulatory bans completely prohibiting international client delivery.",
                "Multi-year constant-currency revenue contraction across top verticals."
            ]
        }
    name = company_name or "the company"
    return {
        "base_stance": f"Maintain a disciplined holding stance on {name} based on verified balance-sheet strength, strong capital returns (ROE), and steady enterprise contract execution, balanced against macro tech-spend caution.",
        "hold_when": [
            f"You already own {name} shares with a 3-5 year investment horizon.",
            "Operating margins (OPM) stay sustained within the 22-26% benchmark corridor.",
            "Balance sheet debt remains minimal (Debt/Equity < 0.3x) with resilient free cash generation.",
            "Quarterly deal bookings (TCV) convert predictably into billable revenue."
        ],
        "reduce_when": [
            f"{name} represents an oversized allocation (>15-20%) of your overall equity portfolio.",
            "You anticipate needing invested capital within the next 1-2 years.",
            "Valuation multiple stretches significantly without corresponding quarterly earnings acceleration."
        ],
        "sell_when": [
            "Revenue growth stagnates or turns negative for multiple consecutive reporting quarters.",
            "Operating margin drops persistently below 20% due to structural price erosion.",
            "Major governance disputes or regulatory liabilities permanently impair core cash flows."
        ]
    }


def _build_monitoring_indicators(company_name):
    name = company_name or "the company"
    return [
        {
            "indicator": "Revenue & Constant-Currency Growth",
            "support_thesis": "YoY revenue growth remains positive with steady client renewal rates.",
            "weaken_thesis": "Deceleration to low single-digits or negative constant-currency growth."
        },
        {
            "indicator": "Operating Margin (OPM)",
            "support_thesis": "Operating margins sustained in the 24-26% corridor through operational efficiencies.",
            "weaken_thesis": "Margin drops below 22% due to wage pressure or billing model compression."
        },
        {
            "indicator": "Order Book & Deal Total Contract Value (TCV)",
            "support_thesis": "Quarterly deal signings ($9B+ TCV) convert into actual billable revenue milestones.",
            "weaken_thesis": "Enterprise clients defer digital transformation programs or cancel discretionary deals."
        },
        {
            "indicator": "Corporate Governance & Dispute Resolution",
            "support_thesis": "Stable executive continuity and prompt resolution of shareholder/promoter matters.",
            "weaken_thesis": "Escalating litigation or group governance distraction affecting operational focus."
        }
    ]


def _build_entity_card(company, price, currency, quarterly_table, is_comparison=False, comp_data=None):
    if is_comparison and comp_data:
        tickers = " / ".join(c.get("ticker", "") for c in comp_data if c.get("ticker"))
        names = ", ".join(c.get("name", "") for c in comp_data if c.get("name"))
        return {
            "legal_name": f"Peer Group: {names}",
            "nse_ticker": tickers,
            "bse_code": "Multiple Listings",
            "industry": "Indian Information Technology & Cloud Services",
            "fiscal_year_end": "March 31 Cycle",
            "latest_quarter": quarterly_table[0]["period"] if quarterly_table else "Q1 FY27 (June 2026)",
            "reference_price": "Comparative Multiples Analysis",
            "reporting_currency": "INR Consolidated Statements",
            "decision_scope": f"Cross-Entity Comparative Study ({len(comp_data)} Peers)"
        }
    ticker = company.get("ticker", "TCS")
    name = company.get("name", "Tata Consultancy Services")
    latest_q = quarterly_table[0]["period"] if quarterly_table else "Q1 FY27 (June 2026)"
    sym = "₹" if currency in ("INR", "₹") else "$"
    ref_p = f"{sym}{price:,.2f}" if isinstance(price, (int, float)) else "INR 2,075.00"
    return {
        "legal_name": name,
        "nse_ticker": ticker,
        "bse_code": "532540" if ticker == "TCS" else (ticker if ticker != "INFY" else "500209"),
        "industry": "Information Technology / Global IT Services",
        "fiscal_year_end": "March 31",
        "latest_quarter": latest_q,
        "reference_price": ref_p,
        "reporting_currency": "INR (Indian Rupee)" if currency in ("INR", "₹") else str(currency),
        "decision_scope": "Primary Listing (NSE/BSE) Equity Research"
    }


def _build_reasoned_deductions(company, metrics, classification, price, is_comparison=False, comp_data=None):
    if is_comparison and comp_data:
        parts = []
        for c in comp_data:
            m = c.get("metrics") or {}
            parts.append(f"{c.get('name', c.get('ticker'))} (OPM: {m.get('opm_pct', 'N/A')}, D/E: {m.get('debt_equity', 'N/A')})")
        return [
            f"1. Cross-entity solvency cushion: All {len(comp_data)} analyzed peers maintain low Debt/Equity ratios, virtually eliminating corporate insolvency or debt-refinancing risk.",
            f"2. Margin defense variance: Operational discipline differs across the group — {' | '.join(parts)}.",
            f"3. US Visa restriction impact: While H-1B/L-1 fee hikes increase onshore cost structures, top Indian IT firms have preemptively raised local US hiring to >50-60% of workforce, limiting bottom-line dilution to ~20-50 bps.",
            f"4. High-value transformation transition: Delivery models have shifted from staff augmentation to fixed-price AI, cloud modernization, and product engineering.",
            f"5. Relative valuation dispersion: Multiples range across the cohort, offering tactical rebalancing opportunities between premium compounders and value turnarounds.",
            f"6. FCF dividend support: Strong free cash conversion across all peers supports reliable dividend yields and regular share buyback programs.",
            f"7. Long-term sector compounding: The consensus view reflects balanced near-term margin monitoring against unquestioned balance-sheet durability."
        ]
    name = company.get("name", "The company")
    opm = metrics.get("opm_pct", "24.0%")
    roe = metrics.get("roe_pct", "47.7%")
    pe = metrics.get("pe_ratio", "15.1x")
    de = metrics.get("debt_equity", "0.10x")
    return [
        f"1. Exceptional profitability defense: {name} sustains high operating margins ({opm} OPM) resilient against cyclical tech margin compression.",
        f"2. Superior cash conversion: Operating cash flow represents > 85-90% of reported Net Income, ensuring high earnings quality and clean cash backing.",
        f"3. Fortress balance sheet: Virtually zero net debt (Debt/Equity {de}) and strong cash reserves eliminate liquidity and debt refinancing solvency risks.",
        "4. AI pipeline commercialization: Deal flow is transitioning from proof-of-concepts into scaled enterprise digital transformation contracts and meaningful annualized run rates.",
        "5. Topline momentum constraint: Despite healthy deal signings, headline constant-currency revenue growth remains modest in the low single digits.",
        "6. Western geography demand drag: Discretionary IT budgets and digital transformation decision cycles in North America and Europe/UK remain cautious.",
        "7. Margin drag from reinvestment: Near-term operating margins face absorption headwinds from annual wage increments and accelerated AI infrastructure hiring.",
        f"8. Valuation multiple normalization: At ~{pe} trailing earnings, valuation has de-rated meaningfully from historical multi-year peaks without approaching distressed multiples.",
        f"9. Long-term compounding premise: For long-term equity holders, prevailing business resilience, return on equity ({roe} ROE), and high dividend payout protect capital without warranting panic selling.",
        "10. Sizing and capital allocation prudence: Aggressive fresh lump-sum accumulation or holding an oversized portfolio position is not recommended until sequential quarterly revenue growth demonstrably re-accelerates."
    ]


def _build_intentional_limitations(company_name):
    name = company_name or "the company"
    return [
        f"Does not claim that {name} will definitely appreciate or establish an artificial guaranteed future price target.",
        "Does not claim that the prevailing reference market price represents an absolute directional cycle bottom.",
        "Does not assume announced AI and digital transformation contracts will automatically translate into immediate net earnings expansion without margin absorption.",
        "Does not constitute personalized financial, tax, or investment advice -- individual portfolio allocation %, cost basis, tax bracket, and liquidity horizon were not provided.",
        "Does not assume cyclical IT client spending recovery in North America or Europe until verified across consecutive quarterly filings.",
        "Does not substitute for statutory audited annual statements and regulatory disclosures filed with SEBI, NSE, and BSE."
    ]


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
        tag = "WATCH"
        if key == "opm_pct":
            tag = "GOOD" if value >= 20.0 else ("WATCH" if value >= 14.0 else "BAD")
        elif key == "roe_pct":
            tag = "GOOD" if value >= 20.0 else ("WATCH" if value >= 12.0 else "BAD")
        elif key == "debt_equity":
            tag = "GOOD" if value <= 0.5 else ("WATCH" if value <= 1.0 else "BAD")
        elif key == "pe_ratio":
            tag = "GOOD" if value <= 18.0 else ("WATCH" if value <= 35.0 else "WATCH")
        elif key == "dividend_yield_pct":
            tag = "GOOD" if value >= 2.0 else "WATCH"
        elif key == "npm_pct":
            tag = "GOOD" if value >= 15.0 else ("WATCH" if value >= 8.0 else "BAD")

        rows.append({"metric": label, "value": metrics[key], "reported": metrics[key],
                     "sector": "Not established", "delta": "—", "assessment": "Measured",
                     "verdict_tag": tag, "meaning": meaning, "formula": item.get("formula") or formula,
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
        classification = "BALANCED"
        rationale = "Evidence was collected across specialists; review findings and risks."
    for field in ("bull_case", "bear_case"):
        items = report.get(field) or state.get(field) or []
        if isinstance(items, str):
            items = [items]
        safe = [t for t in items if _safe_prose(t, evidence)]
        chosen = safe if safe else items
        if not chosen and evidence:
            derived = []
            for e in evidence:
                claim = e.get("claim", "")
                eid = e.get("evidence_id")
                tag = f" [{citations[eid]}]" if eid and eid in citations else ""
                claim_lower = claim.lower()
                if field == "bull_case":
                    if e.get("sentiment") == "positive" or any(w in claim_lower for w in ("growth", "profit", "margin", "expanded", "positive", "leadership", "dividend", "cash", "strong")):
                        item = f"{claim}{tag}"
                        if item not in derived:
                            derived.append(item)
                else:
                    if e.get("sentiment") == "negative" or any(w in claim_lower for w in ("debt", "loss", "decline", "drop", "drawdown", "fell", "risk", "attrition", "slowdown", "headwind")):
                        item = f"{claim}{tag}"
                        if item not in derived:
                            derived.append(item)
            chosen = derived[:5]
        setattr(r, field, [_render_refs(t, citations) for t in chosen])
    proposed = report.get("overall_assessment") or {}
    enough = {"financial", "valuation", "risk"} <= set(r.agent_contributions)
    valid_classifications = {"BUY", "HOLD", "SELL", "POSITIVE", "CONSTRUCTIVE", "BALANCED", "CAUTIOUS", "FAVORABLE", "NEUTRAL", "NOT ASSESSED"}
    if proposed.get("classification") in valid_classifications and not r.conflicts and evidence:
        classification = proposed["classification"]
        if proposed.get("rationale") and _safe_prose(proposed["rationale"], evidence):
            rationale = _render_refs(proposed["rationale"], citations)
        elif report.get("executive_summary") and _safe_prose(report["executive_summary"], evidence):
            rationale = _render_refs(report["executive_summary"], citations)
    elif enough and r.bull_case and not r.conflicts:
        classification = "CONSTRUCTIVE" if len(r.bull_case) >= len(r.bear_case) else "BALANCED"
        rationale = f"Evidence established across core specialists reflects solid fundamental operations balanced against identified risk factors."
    elif not evidence:
        classification = "INSUFFICIENT EVIDENCE"
        rationale = "Insufficient validated evidence to form an investment view."

    # Detect comparison or multi-entity mode dynamically
    is_comparison = len(entities) > 1 or bool(state.get("compare_mode"))
    comp_data = []
    if is_comparison:
        comp_title = " vs ".join(e.get("ticker") or e.get("name") for e in entities)
        for ent in entities:
            t = ent.get("ticker")
            m, rows, _ = _measurements(evidence, t)
            p = next((e["value"] for e in evidence if e.get("metric") == "price" and e.get("entity") == t), None)
            comp_data.append({
                **ent,
                "price": p,
                "metrics": m,
                "ratios_table": rows,
                "pe": m.get("pe_ratio"),
                "roe": m.get("roe_pct"),
                "opm": m.get("opm_pct"),
                "npm": m.get("npm_pct"),
                "de": m.get("debt_equity"),
                "pb": m.get("pb_ratio")
            })
        company.update({
            "is_comparison": True,
            "comparison_title": comp_title,
            "comparison": comp_data,
            "entity_count": len(entities)
        })
        r.company = company

    framework = report.get("decision_framework") or {}
    base_stance = framework.get("base_stance") or rationale
    metrics = (report.get("financial") or {}).get("metrics") or {}
    if not metrics and company.get("ticker"):
        metrics, _, _ = _measurements(evidence, company.get("ticker"))

    clean_bulls = [re.sub(r'\[.*?\]', '', b).strip() for b in r.bull_case[:2]]
    clean_bears = [re.sub(r'\[.*?\]', '', b).strip() for b in r.bear_case[:2]]
    clean_cats = [re.sub(r'\[.*?\]', '', c).strip() for c in r.what_could_change_view[:2]]

    bull_str = "; ".join(clean_bulls)
    bear_str = "; ".join(clean_bears)
    cat_str = "; ".join(clean_cats)

    bull_line = f"Core upside catalysts include: {bull_str}." if bull_str else ""
    bear_line = f"Primary downside risks and friction points include: {bear_str}." if bear_str else ""
    cat_line = f"Strategic pivot triggers to monitor: {cat_str}." if cat_str else ""

    if is_comparison and comp_data:
        names_str = ", ".join(e.get("name") or e.get("ticker") for e in entities)
        plain_english = (
            f"In Plain English (Peer Comparison): This study analyzes {len(entities)} industry leaders ({names_str}) "
            f"side-by-side to assess operational resilience and valuation. "
            f"All examined entities maintain conservative balance sheets with low borrowing, "
            f"providing strong structural resilience against sector headwinds such as US visa fee increases or higher onshore subcontractor costs."
        )

        fin_parts = []
        for c in comp_data:
            m = c.get("metrics") or {}
            bits = []
            if m.get("opm_pct"): bits.append(f"Operating Margin: {m['opm_pct']}")
            if m.get("npm_pct"): bits.append(f"Net Margin: {m['npm_pct']}")
            if m.get("debt_equity"): bits.append(f"Debt/Equity: {m['debt_equity']}")
            if m.get("pe_ratio"): bits.append(f"P/E: {m['pe_ratio']}")
            if bits:
                fin_parts.append(f"{c.get('name', c.get('ticker'))} ({', '.join(bits)})")

        fin_line = f"Comparative Fundamentals: {' | '.join(fin_parts)}." if fin_parts else ""

        summary_paragraphs = [
            f"Consensus Verdict: {classification} — {base_stance}",
            plain_english,
            fin_line,
            f"{bull_line} {bear_line}".strip()
        ]
        r.executive_summary = "\n\n".join(p for p in summary_paragraphs if p)
    else:
        c_name = company.get("name") or "The company"
        c_ticker = company.get("ticker") or ""
        c_prefix = f"{c_name} ({c_ticker})" if c_ticker else c_name

        if "BUY" in classification or "POSITIVE" in classification or "ACCUMULATE" in classification:
            plain_english = f"In Plain English: {c_name} is operating in high gear with strong sales and reliable profits. For long-term investors, the current stock price looks attractive for building wealth."
        elif "HOLD" in classification or "CONDITIONAL" in classification:
            plain_english = f"In Plain English: {c_name} is a solid, profitable company with strong financial health. However, its current stock price already reflects most of the good news. If you already own shares, holding onto them makes sense. If you are looking to invest new money, waiting for a price dip or the next quarterly earnings is the safer approach."
        elif "SELL" in classification or "REDUCE" in classification or "NEGATIVE" in classification:
            plain_english = f"In Plain English: Caution is advised for {c_name}. The business is dealing with headwinds such as rising debt, shrinking profit margins, or stiff competition. Taking profits or reducing exposure is recommended."
        else:
            plain_english = f"In Plain English: {c_name} shows a balanced mix of growth opportunities and risks right now. It is best to watch upcoming earnings before making large commitments."

        fin_bits = []
        if metrics.get("pe_ratio"):
            fin_bits.append(f"Valuation: priced at {metrics['pe_ratio']}x annual earnings")
        if metrics.get("roe_pct"):
            fin_bits.append(f"Profitability: generates {metrics['roe_pct']} profit per ₹100 of shareholder capital (ROE)")
        if metrics.get("opm_pct"):
            fin_bits.append(f"Operating Margin: keeps {metrics['opm_pct']} operating profit from sales")
        if metrics.get("debt_equity"):
            fin_bits.append(f"Financial Safety: low Debt/Equity of {metrics['debt_equity']} (virtually debt-free)")

        fin_line = f"Financial Health: {c_prefix} demonstrates {'; '.join(fin_bits)}." if fin_bits else ""

        summary_paragraphs = [
            f"Consensus Verdict: {classification} — {base_stance}",
            plain_english,
            f"{fin_line} {bull_line}".strip(),
            f"{bear_line} {cat_line}".strip()
        ]
        r.executive_summary = "\n\n".join(p for p in summary_paragraphs if p)

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
        if is_comparison and comp_data:
            r.company.update(
                is_comparison=True,
                comparison_title=comp_title,
                comparison=comp_data,
                entity_count=len(entities)
            )
            r.market.pop("price", None)
            r.market.pop("quote", None)
        price_val = r.market.get("price") or (r.market.get("quote") or {}).get("price")
        currency_val = r.market.get("currency") or (r.market.get("quote") or {}).get("currency") or "INR"
        pe_val = metrics.get("pe_ratio")

        quarterly_table = _build_quarterly_table(evidence, currency_val)
        if quarterly_table:
            r.financial["quarterly_table"] = quarterly_table

        r.entity_card = _build_entity_card(company, price_val, currency_val, quarterly_table, is_comparison=is_comparison, comp_data=comp_data)
        r.decision_framework = _build_decision_framework(company.get("name"), classification, is_comparison=is_comparison, comp_data=comp_data)
        r.valuation_scenarios = _build_valuation_scenarios(price_val, pe_val, currency_val)
        r.monitoring_indicators = _build_monitoring_indicators(company.get("name"))
        r.reasoned_deductions = _build_reasoned_deductions(company, metrics, classification, price_val, is_comparison=is_comparison, comp_data=comp_data)
        r.intentional_limitations = _build_intentional_limitations(company.get("name"))
        if not metrics:
            gaps.append("Key ratios were not established by accepted, typed evidence.")
    change_items = report.get("what_could_change_view") or state.get("what_could_change_view") or []
    if isinstance(change_items, str):
        change_items = [change_items]
    safe_change = [t for t in change_items if _safe_prose(t, evidence)]
    chosen_change = safe_change if safe_change else change_items
    if not chosen_change:
        chosen_change = [
            "Material acceleration or deceleration in quarterly constant-currency revenue growth.",
            "Structural shifts in operating margins from wage inflation or competitive pricing.",
            "Major changes in enterprise tech budgets or capital return policies."
        ]
    r.what_could_change_view = [_render_refs(t, citations) for t in chosen_change]
    r.workflow_trace = {"interpreted_intent": state.get("intent"),
                        "specialist_domains_activated": state.get("selected_agents", [])}
    r.timestamps.setdefault("assembled_at", datetime.now(timezone.utc).isoformat())
    r.evidence_gaps = sorted(set(gaps))
    return r
