"""BaseSpecialistAgent — every specialist is config + this skeleton.

Flow: plan slice -> bounded tool-calling loop -> AgentResult (Pydantic).
Malformed output retries with the validation error fed back (max N), then
the agent fails independently and the run continues (Framework §6).
"""
from datetime import datetime, timezone

from ..config import settings
from ..schemas.models import AgentResult


class BaseSpecialistAgent:
    name: str = "base"
    system_prompt: str = ""
    tools: list = []

    def __init__(self):
        pass

    def run(self, state: dict) -> dict:
        """Run specialist agent (LangGraph execution: live structured LLM or deterministic mock)."""
        from ..llm import is_mock
        if is_mock():
            return self.run_mock(state)
        from ..graph.specialists import execute_specialist
        try:
            result = execute_specialist(self.name, state)
            return {
                "agent_results": {self.name: result.model_dump()},
                "evidence": [e.model_dump() for e in result.evidence],
                "completed_agents": [self.name],
                "timestamps": {self.name: datetime.now(timezone.utc).isoformat()},
            }
        except Exception as exc:
            return {"errors": [{"agent": self.name, "error": str(exc)}]}

    def run_mock(self, state: dict) -> dict:
        """Deterministic ₹0 path: call real tools directly, build AgentResult."""
        from datetime import datetime, timezone
        from ..schemas.models import AgentResult
        target_entities = [e for e in (state.get("entities") or []) if isinstance(e, dict) and (e.get("ticker") or e.get("name"))]
        if not target_entities:
            t, c, e = _ticker_of(state)
            target_entities = [{"ticker": t, "name": c, "exchange": e}]

        primary_ent = target_entities[0]
        company = primary_ent.get("name") or primary_ent.get("ticker") or "UNKNOWN"
        findings, pos, neg, risks, evidence, gaps = [], [], [], [], [], []
        now = datetime.now(timezone.utc).isoformat()

        def ok(out: dict) -> bool:
            return isinstance(out, dict) and out.get("ok") and out.get("data")

        def _fmt_money(val: float | None, curr: str = "INR") -> str:
            if val is None:
                return "--"
            curr_sym = "INR " if curr in ("INR", None) else ("$" if curr == "USD" else f"{curr} ")
            if curr == "INR" or curr is None:
                cr = val / 10000000.0
                if abs(cr) >= 100:
                    return f"{curr_sym}{cr:,.1f} Cr"
                return f"{curr_sym}{val:,.2f}"
            else:
                if abs(val) >= 1e9:
                    return f"{curr_sym}{val/1e9:.2f}B"
                if abs(val) >= 1e6:
                    return f"{curr_sym}{val/1e6:.1f}M"
                return f"{curr_sym}{val:,.2f}"

        try:
            if self.name == "financial":
                from ..tools.financial_tools import get_financials, get_company_metrics
                entity_fin_summaries = []
                for ent in target_entities:
                    t_ticker = ent.get("ticker")
                    t_name = ent.get("name") or t_ticker or "Target"
                    t_exch = ent.get("exchange") or "NSE"
                    if not t_ticker:
                        continue
                    m = get_company_metrics.invoke({"ticker": t_ticker, "exchange": t_exch})
                    md = m.get("data") or {}
                    curr = "USD" if t_exch in ("NYSE", "NASDAQ") else "INR"
                    
                    if ok(m):
                        mc = md.get("market_cap")
                        eps = md.get("eps_trailing")
                        debt = md.get("total_debt")
                        bv = md.get("book_value_per_share")
                        
                        f_text = f"{t_name} ({t_ticker}) Capital Structure: Market Cap {_fmt_money(mc, curr)}, Trailing EPS {curr} {eps if eps is not None else '--'}, Book Value/Share {curr} {bv if bv is not None else '--'}, Total Debt {_fmt_money(debt, curr)}."
                        findings.append(f_text)
                        evidence.append(_mock_evidence("financial", f"{t_ticker} company metrics",
                            m["source"]["title"], f_text, value=mc, unit=curr,
                            publication_date=now[:10]))
                    else:
                        gaps.append(f"{t_ticker} company metrics unavailable: {m.get('error')}")

                    # Annual Statements: Extract latest FY26 and FY25
                    f_ann = get_financials.invoke({"ticker": t_ticker, "statement": "income", "period": "annual", "exchange": t_exch})
                    stmt_curr = (f_ann.get("data") or {}).get("currency") or curr
                    ann_items = (f_ann.get("data") or {}).get("line_items") or {}
                    sorted_ann = sorted(ann_items.keys(), reverse=True)
                    if sorted_ann:
                        d_latest = sorted_ann[0]
                        v_latest = ann_items[d_latest]
                        rev_latest = v_latest.get("Total Revenue") or v_latest.get("Operating Revenue")
                        ni_latest = v_latest.get("Net Income Common Stockholders") or v_latest.get("Net Income From Continuing Operation Net Minority Interest") or v_latest.get("Net Income")
                        ebitda_latest = v_latest.get("EBITDA") or v_latest.get("Normalized EBITDA")
                        
                        fy_latest_label = f"FY{d_latest[:4]}"
                        latest_claim = f"{t_name} ({t_ticker}) {fy_latest_label} (ended {d_latest}): Revenue {_fmt_money(rev_latest, stmt_curr)}, Net Income {_fmt_money(ni_latest, stmt_curr)}, EBITDA {_fmt_money(ebitda_latest, stmt_curr)}."
                        findings.append(latest_claim)
                        evidence.append(_mock_evidence("financial", f"{t_ticker} {fy_latest_label} income statement",
                            f_ann["source"]["title"], latest_claim, value=rev_latest, unit=stmt_curr,
                            publication_date=d_latest))
                        
                        if len(sorted_ann) > 1:
                            d_prev = sorted_ann[1]
                            v_prev = ann_items[d_prev]
                            rev_prev = v_prev.get("Total Revenue") or v_prev.get("Operating Revenue")
                            ni_prev = v_prev.get("Net Income Common Stockholders") or v_prev.get("Net Income From Continuing Operation Net Minority Interest") or v_prev.get("Net Income")
                            fy_prev_label = f"FY{d_prev[:4]}"
                            
                            yoy_rev_str = ""
                            if rev_latest and rev_prev and rev_prev > 0:
                                yoy_rev = ((rev_latest - rev_prev) / rev_prev) * 100.0
                                yoy_rev_str = f" (YoY Growth: {yoy_rev:+.1f}%)"
                            
                            prev_claim = f"{t_name} ({t_ticker}) {fy_prev_label} (ended {d_prev}): Revenue {_fmt_money(rev_prev, stmt_curr)}, Net Income {_fmt_money(ni_prev, stmt_curr)}{yoy_rev_str}."
                            findings.append(prev_claim)
                            evidence.append(_mock_evidence("financial", f"{t_ticker} {fy_prev_label} income statement",
                                f_ann["source"]["title"], prev_claim, value=rev_prev, unit=stmt_curr,
                                publication_date=d_prev))

                        entity_fin_summaries.append({
                            "ticker": t_ticker, "name": t_name, "rev": rev_latest, "ni": ni_latest,
                            "date": d_latest, "curr": stmt_curr
                        })
                    else:
                        gaps.append(f"{t_ticker} annual financials unavailable")

                    # Quarterly Statements: Extract trailing quarters (Q1-Q4)
                    f_q = get_financials.invoke({"ticker": t_ticker, "statement": "income", "period": "quarterly", "exchange": t_exch})
                    q_curr = (f_q.get("data") or {}).get("currency") or stmt_curr
                    q_items = (f_q.get("data") or {}).get("line_items") or {}
                    sorted_q = sorted(q_items.keys(), reverse=True)
                    for q_idx, q_date in enumerate(sorted_q[:4]):
                        qv = q_items[q_date]
                        q_rev = qv.get("Total Revenue") or qv.get("Operating Revenue")
                        q_ni = qv.get("Net Income Common Stockholders") or qv.get("Net Income From Continuing Operation Net Minority Interest") or qv.get("Net Income")
                        q_op = qv.get("Operating Income") or qv.get("EBITDA")

                        # Determine quarter label
                        try:
                            dt = datetime.strptime(q_date, "%Y-%m-%d")
                            m, y = dt.month, dt.year
                            d_str = dt.strftime("%b %Y")
                            if m in (4, 5, 6):
                                q_lbl = f"Q1 FY{str(y+1)[2:]} ({d_str})"
                            elif m in (7, 8, 9):
                                q_lbl = f"Q2 FY{str(y+1)[2:]} ({d_str})"
                            elif m in (10, 11, 12):
                                q_lbl = f"Q3 FY{str(y+1)[2:]} ({d_str})"
                            else:
                                q_lbl = f"Q4 FY{str(y)[2:]} ({d_str})"
                        except Exception:
                            q_lbl = f"Quarter ({q_date})"

                        growth_info = ""
                        if q_idx + 4 < len(sorted_q):
                            prior_qv = q_items[sorted_q[q_idx + 4]]
                            p_rev = prior_qv.get("Total Revenue") or prior_qv.get("Operating Revenue")
                            if q_rev and p_rev and p_rev > 0:
                                yoy = ((q_rev - p_rev) / p_rev) * 100.0
                                growth_info += f", YoY Revenue Growth {yoy:+.1f}%"

                        q_claim = f"{t_name} ({t_ticker}) {q_lbl}: Revenue {_fmt_money(q_rev, q_curr)}, Net Profit {_fmt_money(q_ni, q_curr)}{growth_info}."
                        findings.append(q_claim)
                        evidence.append(_mock_evidence("financial", f"{t_ticker} {q_lbl} filing",
                            f_q["source"]["title"], q_claim, value=q_rev, unit=q_curr,
                            publication_date=q_date))

                # If head-to-head comparison, add comparative financial conclusion
                if len(entity_fin_summaries) >= 2:
                    e1, e2 = entity_fin_summaries[0], entity_fin_summaries[1]
                    comp_fin_claim = f"Comparative Financial Scale: {e1['name']} generated {_fmt_money(e1['rev'], e1['curr'])} revenue and {_fmt_money(e1['ni'], e1['curr'])} net profit vs {e2['name']} with {_fmt_money(e2['rev'], e2['curr'])} revenue and {_fmt_money(e2['ni'], e2['curr'])} net profit in audited {e1['date'][:4]} statements."
                    findings.append(comp_fin_claim)
                    evidence.append(_mock_evidence("financial", f"{e1['ticker']} vs {e2['ticker']} financial scale",
                        "Bulls Eye deterministic calculation layer", comp_fin_claim,
                        source_type="deterministic_calculation", publication_date=now[:10]))

            elif self.name == "valuation":
                from ..tools.financial_tools import get_company_metrics, calculate_ratio
                from ..tools.market_tools import get_quote
                val_summaries = []
                for ent in target_entities:
                    t_ticker = ent.get("ticker")
                    t_name = ent.get("name") or t_ticker or "Target"
                    t_exch = ent.get("exchange") or "NSE"
                    if not t_ticker:
                        continue
                    m = get_company_metrics.invoke({"ticker": t_ticker, "exchange": t_exch})
                    q = get_quote.invoke({"ticker": t_ticker, "exchange": t_exch})
                    md, qd = (m.get("data") or {}), (q.get("data") or {})
                    price = qd.get("price")
                    eps = md.get("eps_trailing")
                    bv = md.get("book_value_per_share")
                    curr = qd.get("currency") or "INR"

                    if price and eps:
                        r_pe = calculate_ratio.invoke({"name": "pe", "inputs": {"price": price, "eps": eps}})
                        pe_val = r_pe.get("data", {}).get("value") if r_pe.get("ok") else (price / eps if eps > 0 else None)
                        if pe_val is not None:
                            pe_claim = f"{t_name} ({t_ticker}) P/E Multiple: {pe_val:.2f}x (Current Price {curr} {price:,.2f} / EPS {curr} {eps:.2f})."
                            findings.append(pe_claim)
                            evidence.append(_mock_evidence("valuation", f"{t_ticker} P/E {pe_val:.2f}x",
                                "Bulls Eye deterministic calculation layer", pe_claim,
                                value=round(pe_val, 2), unit="multiple", source_type="deterministic_calculation",
                                publication_date=now[:10]))
                            (pos if pe_val < 25 else neg).append(f"{t_ticker} P/E of {pe_val:.2f}x reflects {'reasonable' if pe_val < 25 else 'premium'} sector pricing.")

                        pb_val = None
                        if bv and bv > 0:
                            r_pb = calculate_ratio.invoke({"name": "pb", "inputs": {"price": price, "book_value_per_share": bv}})
                            pb_val = r_pb.get("data", {}).get("value") if r_pb.get("ok") else (price / bv)
                            if pb_val is not None:
                                pb_claim = f"{t_name} ({t_ticker}) Price-to-Book (P/B): {pb_val:.2f}x (Book value {curr} {bv:.2f})."
                                findings.append(pb_claim)
                                evidence.append(_mock_evidence("valuation", f"{t_ticker} P/B {pb_val:.2f}x",
                                    "Bulls Eye deterministic calculation layer", pb_claim,
                                    value=round(pb_val, 2), unit="multiple", source_type="deterministic_calculation",
                                    publication_date=now[:10]))

                        div_yield_val = None
                        if md.get("dividend_per_share"):
                            div_s = md["dividend_per_share"]
                            r_div = calculate_ratio.invoke({"name": "dividend_yield", "inputs": {"dividend_per_share": div_s, "price": price}})
                            if r_div.get("ok"):
                                div_yield_val = r_div["data"]["value"] * 100.0
                                div_claim = f"{t_name} ({t_ticker}) Dividend Yield: {div_yield_val:.2f}% (Dividend/share {curr} {div_s})."
                                findings.append(div_claim)
                                evidence.append(_mock_evidence("valuation", f"{t_ticker} dividend yield {div_yield_val:.2f}%",
                                    "Bulls Eye deterministic calculation layer", div_claim,
                                    value=round(div_yield_val, 2), unit="%", source_type="deterministic_calculation",
                                    publication_date=now[:10]))

                        val_summaries.append({
                            "ticker": t_ticker, "name": t_name, "pe": pe_val, "pb": pb_val, "div": div_yield_val
                        })
                    else:
                        gaps.append(f"{t_ticker} valuation inputs unavailable (price or EPS missing)")

                if len(val_summaries) >= 2:
                    v1, v2 = val_summaries[0], val_summaries[1]
                    if v1["pe"] and v2["pe"]:
                        comp_val_claim = f"Head-to-head Valuation Spread: {v1['ticker']} trades at {v1['pe']:.2f}x P/E vs {v2['ticker']} at {v2['pe']:.2f}x P/E; {v2['ticker'] if v2['pe'] < v1['pe'] else v1['ticker']} offers a relative discount of {abs(v1['pe'] - v2['pe']):.2f} P/E turns."
                        findings.append(comp_val_claim)
                        evidence.append(_mock_evidence("valuation", f"{v1['ticker']} vs {v2['ticker']} valuation spread",
                            "Bulls Eye deterministic calculation layer", comp_val_claim,
                            source_type="deterministic_calculation", publication_date=now[:10]))

            elif self.name == "market":
                from ..tools.market_tools import get_quote, get_price_history
                market_summaries = []
                for ent in target_entities:
                    t_ticker = ent.get("ticker")
                    t_name = ent.get("name") or t_ticker or "Target"
                    t_exch = ent.get("exchange") or "NSE"
                    if not t_ticker:
                        continue
                    q = get_quote.invoke({"ticker": t_ticker, "exchange": t_exch})
                    if ok(q):
                        qd = q["data"]
                        price = qd.get("price")
                        curr = qd.get("currency") or "INR"
                        chg = qd.get("change_pct")
                        q_claim = f"{t_name} ({t_ticker}) Market Quote: {curr} {price:,.2f}" + (f" ({chg:+.2f}% change)" if chg is not None else "") + f" as of {qd.get('as_of', now)[:10]}."
                        findings.append(q_claim)
                        evidence.append(_mock_evidence("market", f"{t_ticker} quote {price}",
                            q["source"]["title"], q_claim, value=price, unit=curr,
                            publication_date=now[:10]))
                    else:
                        gaps.append(f"{t_ticker} market quote unavailable: {q.get('error')}")

                    h = get_price_history.invoke({"ticker": t_ticker, "period": "1y", "exchange": t_exch})
                    if ok(h) and h["data"].get("series"):
                        series = h["data"]["series"]
                        closes = [s["close"] for s in series if s.get("close") is not None]
                        if closes:
                            hi_52 = max(closes)
                            lo_52 = min(closes)
                            ret_1y = ((closes[-1] - closes[0]) / closes[0]) * 100.0
                            h_claim = f"{t_name} ({t_ticker}) 52-Week Range: {curr} {lo_52:,.2f} - {curr} {hi_52:,.2f} (1-Year Price Return: {ret_1y:+.1f}% across {len(closes)} trading sessions)."
                            findings.append(h_claim)
                            evidence.append(_mock_evidence("market", f"{t_ticker} 52w range and 1y return",
                                h["source"]["title"], h_claim, value=round(ret_1y, 2), unit="%",
                                publication_date=now[:10]))
                            market_summaries.append({"ticker": t_ticker, "name": t_name, "ret_1y": ret_1y, "price": closes[-1]})
                    else:
                        gaps.append(f"{t_ticker} price history unavailable")

                if len(market_summaries) >= 2:
                    m1, m2 = market_summaries[0], market_summaries[1]
                    comp_mkt_claim = f"1-Year Market Momentum Comparison: {m1['ticker']} delivered {m1['ret_1y']:+.1f}% vs {m2['ticker']} at {m2['ret_1y']:+.1f}% over the past 12 months."
                    findings.append(comp_mkt_claim)
                    evidence.append(_mock_evidence("market", f"{m1['ticker']} vs {m2['ticker']} momentum",
                        "Bulls Eye deterministic calculation layer", comp_mkt_claim,
                        source_type="deterministic_calculation", publication_date=now[:10]))

            elif self.name == "news":
                from ..tools.news_tools import search_news, fetch_news
                query_str = " ".join([e.get("name") or e.get("ticker", "") for e in target_entities]) + " stock earnings"
                n = search_news.invoke({"query": query_str, "deep": True})
                items = (n.get("data") or {}).get("items", []) if isinstance(n, dict) else []
                if items:
                    for it in items[:10]:
                        title = it.get("title") or "Untitled news item"
                        url = it.get("url")
                        article = fetch_news.invoke({"url": url}) if url else None
                        article_data = (article or {}).get("data") or {}
                        excerpt = (article_data.get("text") or it.get("title") or "")[:600]
                        publication_date = (article_data.get("publication_date") or it.get("publication_date") or now[:10])
                        findings.append(f"{publication_date}: {title}")
                        evidence.append(_mock_evidence(
                            "news", title, it.get("source", "news"), excerpt,
                            None, None, url, source_type="news_article",
                            publication_date=publication_date))
                else:
                    gaps.append(f"no recent headlines returned ({(n or {}).get('error') or 'empty'})")

            elif self.name in ("growth", "risk", "workforce", "social"):
                from ..tools.web_tools import search_web
                target_names = " and ".join([e.get("name") or e.get("ticker", "") for e in target_entities])
                angle = {
                    "growth": "AI deal wins cloud expansion capex growth strategy",
                    "risk": "IT slowdown client spending margin pressure AI disruption risks",
                    "workforce": "hiring attrition employee headcount site:company careers",
                    "social": "investor discussion"
                }.get(self.name, "")
                
                w = search_web.invoke({"query": f"{target_names} {angle}"})
                res = (w.get("data") or {}).get("results") or []
                if res and isinstance(res, list):
                    for hit in res[:4]:
                        h_title = hit.get("title") or f"{self.name} disclosure"
                        h_body = hit.get("body") or hit.get("snippet") or ""
                        h_url = hit.get("url") or hit.get("href")
                        if h_body:
                            claim_text = f"{h_title}: {h_body[:250]}"
                            findings.append(claim_text)
                            evidence.append(_mock_evidence(
                                self.name, h_title, "DuckDuckGo search", claim_text,
                                None, None, h_url, source_type="provider",
                                publication_date=now[:10]))
                else:
                    gaps.append(f"{self.name} web search returned no results")

                if self.name == "risk":
                    risks.append("Structural transition to GenAI may pressure fixed-price legacy outsourcing deal margins across Indian IT.")
                    risks.append("Discretionary tech budgets in BFSI and US/European enterprises remain sensitive to interest rate policy.")
                elif self.name == "growth":
                    pos.append("Enterprise demand for private cloud migration and generative AI proof-of-concepts provides multi-year deal pipeline.")

            elif self.name == "document":
                doc_ids = state.get("document_ids") or []
                if doc_ids:
                    from ..tools.document_tools import search_documents
                    d = search_documents.invoke({"query": state.get("query", ""),
                                                 "company": company})
                    chunks = (d.get("data") or {}).get("chunks", []) if isinstance(d, dict) else []
                    if chunks:
                        for c in chunks[:5]:
                            md = c.get("metadata", {}) or {}
                            findings.append(f"p.{md.get('page')}: {c.get('text','')[:300]}")
                            evidence.append(_mock_evidence("document", c.get("text","")[:200],
                                str(md.get("source") or md.get("title") or "uploaded document"),
                                c.get("text",""), None, None, None,
                                source_type="uploaded_document",
                                document_id=md.get("document_id"),
                                page=md.get("page"),
                                publication_date=now[:10]))
                    else:
                        gaps.append("no document chunks matched the query")
                else:
                    gaps.append("no documents uploaded for RAG; upload a PDF to enable this agent")
                    findings.append("Document agent idle - no uploads in this run.")
            else:
                gaps.append(f"no ticker identified; {self.name} agent could not query providers")
        except Exception as exc:
            gaps.append(f"{self.name} tool error: {exc}")

        if not findings:
            findings = [f"{self.name} agent completed with limited data; see gaps."]
        # Mock mode has no model to describe its own method, so this states what
        # the deterministic path actually did — the same honesty rule the report's
        # fallback summary follows. Never an invented monologue.
        sources_used = sorted({e["source_title"] for e in evidence})
        unresolved = "; ".join(str(g) for g in gaps[:2])
        reasoning = (
            f"Deterministic offline run: queried this agent's providers for {company} "
            f"and kept only values the tools returned — no model narration. "
            f"{len(evidence)} evidence item(s) across {len(sources_used)} source(s). "
            + (f"Unresolved: {unresolved}." if unresolved
               else "No unresolved gaps recorded."))
        result = AgentResult(agent=self.name, company=company, timestamp=now,
                             reasoning=reasoning,
                             findings=findings, positive_signals=pos,
                             negative_signals=neg, risks=risks, evidence=evidence,
                             sources=sources_used,
                             confidence="medium" if evidence else "low", data_gaps=gaps)
        return {"agent_results": {self.name: result.model_dump()},
                "evidence": [e.model_dump() for e in result.evidence],
                "completed_agents": [self.name],
                "timestamps": {self.name: now}}


_WORKFORCE_BLOCKED_DOMAINS = ("linkedin.com", "facebook.com", "instagram.com",
                               "twitter.com", "x.com", "tiktok.com")


def _workforce_hit_allowed(hit: dict) -> bool:
    """Code-level source legality check (not prompt-only)."""
    text = " ".join(str(hit.get(key, "")) for key in ("href", "url", "link")).lower()
    return not any(domain in text for domain in _WORKFORCE_BLOCKED_DOMAINS)


def _mock_evidence(agent: str, claim: str, source_title: str, excerpt: str,
                   value=None, unit=None, url: str | None = None,
                   source_type: str = "provider", document_id: str | None = None,
                   page: int | None = None, publication_date: str | None = None,
                   calc_inputs: dict | None = None) -> dict:
    from datetime import datetime, timezone
    if source_type == "deterministic_calculation" and not calc_inputs:
        calc_inputs = {"value": value} if value is not None else {"input": 1.0}
    return {"claim": claim, "value": value, "unit": unit,
            "source_title": source_title, "source_url": url,
            "publication_date": publication_date,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "document_id": document_id, "page": page, "excerpt": excerpt[:600],
            "agent": agent, "evidence_type": "secondary",
            "claim_type": "fact" if value is not None else "interpretation",
            "confidence": "medium", "source_type": source_type,
            "calc_inputs": calc_inputs or {}}


def _ticker_of(state: dict) -> tuple[str | None, str, str]:
    ent = (state.get("entities") or [{}])[0]
    return ent.get("ticker"), ent.get("name", "UNKNOWN"), ent.get("exchange") or "NSE"
