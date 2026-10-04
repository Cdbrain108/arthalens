"""Deterministic PDF pipeline: ReportJSON -> Jinja2 HTML -> WeasyPrint PDF.

No LLM anywhere in this path — layout quality is decoupled from model
formatting quality (Framework §Q, ADR-6).
"""
import logging
import os
import re
from pathlib import Path
from typing import Any
from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import settings
from ..schemas.models import ReportJSON

logger = logging.getLogger("bullseye.report")

_env = Environment(
    loader=FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates")),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_html(report: ReportJSON, charts: dict[str, str] | None = None) -> str:
    template_name = ("news_report.html.j2"
                     if (report.overall_assessment or {}).get("report_type") == "news"
                     else "report.html.j2")
    template = _env.get_template(template_name)
    return template.render(report=report, charts=charts or {})


def render_pdf(report: ReportJSON, job_id: str) -> str:
    os.makedirs(settings.reports_dir, exist_ok=True)
    path = os.path.join(settings.reports_dir, f"{job_id}.pdf")
    charts: dict[str, str] = {}
    try:
        from .charts import generate_report_charts
        charts_dir = os.path.join(settings.reports_dir, "charts")
        generated = generate_report_charts(report.model_dump(), charts_dir) or {}
        # WeasyPrint needs file URIs when rendering HTML from a string.
        charts = {key: Path(value).resolve().as_uri()
                  for key, value in generated.items() if value and os.path.exists(value)}
    except Exception as exc:  # noqa: BLE001 - charts are optional
        logger.warning("Chart generation failed (%s); rendering without charts.", exc)
    html = render_html(report, charts=charts)
    try:
        from weasyprint import HTML
        HTML(string=html).write_pdf(path)
        return path
    except Exception as exc:
        # Windows without GTK (or any WeasyPrint failure) -> pure-python fallback.
        logger.warning("WeasyPrint unavailable (%s); using fpdf2 fallback.", exc)
        return _render_pdf_fallback(report, path)


def _render_pdf_fallback(report: ReportJSON, path: str) -> str:
    if (report.overall_assessment or {}).get("report_type") == "news":
        return _render_news_pdf_fallback(report, path)

    from fpdf import FPDF

    def _safe(t) -> str:
        if t is None:
            return ""
        s = str(t)
        # Clean unicode replacements before latin-1 fallback
        replacements = {
            "\u20b9": "INR ",
            "\u2018": "'", "\u2019": "'",
            "\u201c": '"', "\u201d": '"',
            "\u2013": "-", "\u2014": "--",
            "\u2022": "-", "\u2026": "...",
            "\u00a0": " ", "\u20ac": "EUR ",
            "\u00a3": "GBP ",
            "\u2713": "+", "\u25b2": "!", "\u2192": ">",
        }
        for k, v in replacements.items():
            s = s.replace(k, v)
        return s.encode("latin-1", errors="replace").decode("latin-1")

    # Generate visual charts for this report. Every consumer below tests
    # `"key" in charts` first, so an empty dict degrades to a chart-less report
    # instead of losing the whole PDF to one matplotlib failure.
    charts_dir = os.path.join(os.path.dirname(path), "charts")
    charts: dict = {}
    try:
        from .charts import generate_report_charts
        charts = generate_report_charts(report.model_dump(), charts_dir) or {}
    except Exception as exc:                       # noqa: BLE001 - charts are optional
        logger.warning("Chart generation failed (%s); rendering the PDF without charts.", exc)

    comp_name = report.company.get("name") or "Company Research"
    ticker = report.company.get("ticker") or ""
    exch = report.company.get("exchange") or "NSE"
    ticker_badge = f" | {exch}: {ticker}" if ticker else ""

    class ReportPDF(FPDF):
        def header(self):
            if self.page_no() > 1:
                self.set_font("Helvetica", "I", 7.5)
                self.set_text_color(148, 163, 184)
                self.cell(0, 4.5, _safe(f"Artha AI Institutional Research  |  {comp_name}{ticker_badge}"), border="B")
                self.ln(5)

        def footer(self):
            self.set_y(-10)
            self.set_font("Helvetica", "I", 7.5)
            self.set_text_color(148, 163, 184)
            self.cell(0, 4, f"Page {self.page_no()} of {{nb}}  |  Artha AI Evidence-First Research  |  Decision-Support Only", align="C")

    pdf = ReportPDF(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    page_w = pdf.epw  # Effective printable width (approx 190mm)

    # 1. Executive Dark Slate Header Banner
    pdf.set_fill_color(15, 23, 42)  # #0F172A
    pdf.rect(pdf.l_margin, pdf.get_y(), page_w, 24, style="F")
    
    pdf.set_xy(pdf.l_margin + 5, pdf.get_y() + 3)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(page_w - 10, 7, "ARTHA AI INSTITUTIONAL RESEARCH", new_x="LMARGIN", new_y="NEXT")

    pdf.set_x(pdf.l_margin + 5)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(148, 163, 184)  # Slate 400
    pdf.cell(page_w - 10, 5, _safe(f"{comp_name}{ticker_badge}  -  Schema v{report.schema_version}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(9)

    # 1b. Perfectly Aligned Query Pill Card
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(pdf.l_margin, pdf.get_y(), page_w, 8, style="FD")
    pdf.set_xy(pdf.l_margin + 4, pdf.get_y() + 1.8)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(79, 70, 229)
    pdf.cell(24, 4.5, "USER QUERY:", align="L")
    pdf.set_font("Helvetica", "I", 8.2)
    pdf.set_text_color(30, 41, 59)
    query_text = _safe(f'"{report.query}"') if report.query else '"Investment and fundamental analysis"'
    pdf.cell(page_w - 32, 4.5, query_text, align="L")
    pdf.set_y(pdf.get_y() + 7)
    pdf.ln(3)

    # 2. Executive KPI Cards (5 Tiles Side-by-Side)
    oa = report.overall_assessment or {}
    verdict = (oa.get("classification") or "NEUTRAL").upper()
    # `or` defaults are wrong here: a genuine score of 0 or 0.0% grounding is
    # falsy and would silently render as a flattering fabricated number.
    q_score = oa.get("quality_score")
    q_max = oa.get("max_quality_score") or 9
    q_rating = oa.get("quality_rating")
    grounding = oa.get("evidence_grounding_pct")
    grounding_label = (f"{grounding}% Verified" if grounding is not None
                       else "Not measured")

    comp_list = (report.company or {}).get("comparison") or []
    # Comparison layout follows the assembled report, not a substring scan of
    # the query ("vs" matches inside TVS, Novartis, ...).
    is_comp = len(comp_list) >= 2 or bool((report.company or {}).get("is_comparison"))
    is_disc = bool((report.company or {}).get("is_discovery") or ((report.company or {}).get("ticker") or "").startswith("^"))

    cards_data = []

    if is_comp and len(comp_list) >= 2:
        c1, c2 = comp_list[0], comp_list[1]
        cards_data.append(("HEAD-TO-HEAD", _safe(f"{c1.get('ticker')} vs {c2.get('ticker')}"), (30, 41, 59)))
        cards_data.append(("VERDICT", _safe(verdict), (71, 85, 105)))
        if c1.get("pe") and c2.get("pe"):
            cards_data.append(("P/E SPREAD", _safe(f"{c1['pe']} vs {c2['pe']}"), (217, 119, 6)))
        if c1.get("roe") or c2.get("roe"):
            lead = f"{c1.get('ticker')} ({c1['roe']})" if c1.get("roe") else f"{c2.get('ticker')} ({c2['roe']})"
            cards_data.append(("PROFITABILITY", _safe(lead), (99, 102, 241)))
        if grounding_label and grounding_label != "Not measured":
            cards_data.append(("EVIDENCE BASIS", _safe(grounding_label), (71, 85, 105)))
    elif not is_disc:
        # Price extraction for specific company
        price_val = None
        m_dict = report.market if isinstance(report.market, dict) else (report.market.model_dump() if hasattr(report.market, "model_dump") else {})
        p_num = m_dict.get("price") or (m_dict.get("quote") or {}).get("price")
        if p_num is not None:
            curr = m_dict.get("currency") or ("$" if (report.company and report.company.get("exchange") in ("NYSE", "NASDAQ")) else "INR ")
            curr = "$" if curr == "$" else "INR "
            price_val = f"{curr}{float(p_num):,.2f}"
        else:
            market_text = " ".join([
                str(report.market.get("summary", "") if isinstance(report.market, dict) else getattr(report.market, "summary", "")),
                *[str(f.get("claim", f) if isinstance(f, dict) else f) for f in ((report.market.get("findings", []) if isinstance(report.market, dict) else getattr(report.market, "findings", [])) or [])]
            ])
            num_match = re.search(r"(?:trading\s+at|quote\s+is|price\s+is|current\s+price|market\s+quote:?|quote:?)\s*([$₹€£]|INR|USD)?\s*([0-9,]+(?:\.[0-9]+)?)", market_text, re.I) \
                or re.search(r"([$₹€£]|INR|USD)\s*([0-9,]+(?:\.[0-9]+)?)", market_text, re.I) \
                or re.search(r"\bquote\s+([0-9,]+(?:\.[0-9]+)?)\b", market_text, re.I)
            if num_match:
                sym = num_match.group(1) or ("$" if (report.company and report.company.get("exchange") in ("NYSE", "NASDAQ")) else "INR ")
                sym = "$" if sym == "$" else "INR "
                v_str = num_match.group(2) if num_match.lastindex and num_match.lastindex >= 2 and num_match.group(2) else num_match.group(1)
                try:
                    val = float(v_str.replace(",", ""))
                    price_val = f"{sym}{val:,.2f}"
                except Exception:
                    price_val = f"{sym}{v_str}"

        # 1. Price tile (only if valid price exists)
        if price_val and price_val not in ("Quote Pending", "--", "None", ""):
            cards_data.append(("MARKET PRICE", _safe(price_val), (30, 41, 59)))

        # 2. Verdict tile (always present for specific stock)
        v_color = ((16, 185, 129) if any(k in verdict for k in ("POSITIVE", "BUY", "ACCUMULATE", "HOLD"))
                   else (239, 68, 68) if any(k in verdict for k in ("NEGATIVE", "SELL"))
                   else (217, 119, 6))
        cards_data.append(("VERDICT", _safe(verdict), v_color))

        # 3. Corporate Business Health & Fundamentals (only for single equities when measured)
        if q_score is not None and q_score > 0 and q_rating not in ("Not scored", "None"):
            score_label = q_rating or f"{q_score} / {q_max}"
            score_color = ((16, 185, 129) if q_score >= 7
                           else (217, 119, 6) if q_score >= 4
                           else (239, 68, 68))
            cards_data.append(("BUSINESS HEALTH", _safe(score_label), score_color))

        # 4. ROE (only if actually measured)
        roe_entry = next(
            (row for row in ((report.financial or {}).get("ratios_table") or [])
             if "roe" in str(row.get("metric", "")).lower()), None)
        if roe_entry and roe_entry.get("value") and roe_entry["value"] not in ("Not measured", "--", "None", ""):
            cards_data.append(("RETURN ON EQUITY", _safe(roe_entry["value"]), (99, 102, 241)))

        # 5. Evidence Grounding (only if measured)
        if grounding_label and grounding_label != "Not measured":
            cards_data.append(("RESEARCH GROUNDING", _safe(grounding_label), (71, 85, 105)))
    else:
        # Discovery, broad, news, or thematic questions do not force arbitrary KPI boxes
        cards_data = []

    if cards_data:
        cards_data = cards_data[:5]
        n_cards = len(cards_data)
        card_w = (page_w - (n_cards - 1) * 3) / n_cards
        card_h = 17
        start_y = pdf.get_y()

        for i, (label, val, color) in enumerate(cards_data):
            cx = pdf.l_margin + i * (card_w + 3)
            pdf.set_xy(cx, start_y)
            pdf.set_fill_color(248, 250, 252)
            pdf.set_draw_color(226, 232, 240)
            pdf.rect(cx, start_y, card_w, card_h, style="FD")
            
            pdf.set_xy(cx + 1, start_y + 2.5)
            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(100, 116, 139)
            pdf.cell(card_w - 2, 3.5, label, align="C")
            
            pdf.set_xy(cx + 1, start_y + 7.5)
            if len(val) > 16:
                pdf.set_font("Helvetica", "B", 7.2)
            elif len(val) > 12:
                pdf.set_font("Helvetica", "B", 8.2)
            else:
                pdf.set_font("Helvetica", "B", 9.5)
            pdf.set_text_color(*color)
            pdf.cell(card_w - 2, 6, val, align="C")

        pdf.set_y(start_y + card_h + 4)

    # 2b. Executive Bottom Line & Actionable Stance Hero Banner
    df = getattr(report, "decision_framework", {}) or {}
    base_stance = df.get("base_stance")
    if base_stance and not is_comp:
        pdf.set_fill_color(240, 253, 244)
        pdf.set_draw_color(34, 197, 94)
        pdf.set_font("Helvetica", "B", 8.8)
        pdf.set_text_color(22, 101, 52)
        v_label = verdict if verdict != "NEUTRAL" else "HOLD (CONDITIONAL)"
        pdf.cell(page_w, 5.0, _safe(f"  BOTTOM LINE VERDICT: {v_label}"), border="LRT", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 7.6)
        pdf.set_text_color(30, 41, 59)
        pdf.multi_cell(page_w, 3.8, _safe(f"  Base Stance: {base_stance}"), border="LR", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 6.8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(page_w, 3.4, _safe("  Market-based research framework, not personalized financial advice (purchase price, tax bracket, liquidity horizon not known)."), border="LRB", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3.0)

    # 3. Executive Summary Container
    if report.executive_summary:
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(99, 102, 241)  # Indigo accent border
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(15, 23, 42)
        exec_title = "Investment Decision Thesis & Executive Summary" if ("HOLD" in verdict or "BUY" in verdict or "SELL" in verdict) else "Executive Thesis & Summary"
        pdf.cell(page_w, 5.5, exec_title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(30, 41, 59)
        pdf.multi_cell(page_w, 4.8, _safe(report.executive_summary), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # 3a. Institutional Entity Card & Scope Definition
    ec = getattr(report, "entity_card", {}) or (report.company or {}).get("entity_card") or {}
    if ec and ec.get("legal_name") and not is_comp:
        if pdf.get_y() > 220:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5, _safe(f"{ec.get('legal_name')} - Institutional Entity Card"), new_x="LMARGIN", new_y="NEXT")

        pdf.set_fill_color(248, 250, 252)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "", 7.2)

        ec_rows = [
            ("Legal / Common Name", ec.get("legal_name", ""), "Ticker / Exchange", f"NSE: {ec.get('nse_ticker', '')} | BSE: {ec.get('bse_code', '')}"),
            ("Listing Status", ec.get("listing_status", ""), "Fiscal Year Cycle", ec.get("fiscal_year_end", "")),
            ("Latest Quarter", ec.get("latest_quarter", ""), "Reporting Currency", ec.get("reporting_currency", "")),
            ("Industry / Sector", ec.get("industry", ""), "Reference Spot Price", f"{ec.get('reference_price', '')} (as of {ec.get('reference_date', '')})"),
        ]

        col_w1 = page_w * 0.22
        col_w2 = page_w * 0.28
        col_w3 = page_w * 0.22
        col_w4 = page_w * 0.28

        for r_idx, (l1, v1, l2, v2) in enumerate(ec_rows):
            pdf.set_fill_color(241, 245, 249) if r_idx % 2 == 0 else pdf.set_fill_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(71, 85, 105)
            pdf.cell(col_w1, 4.4, _safe(f" {l1}"), border=1, fill=True)
            pdf.set_font("Helvetica", "", 6.8)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(col_w2, 4.4, _safe(f" {v1}"), border=1, fill=True)

            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(71, 85, 105)
            pdf.cell(col_w3, 4.4, _safe(f" {l2}"), border=1, fill=True)
            pdf.set_font("Helvetica", "", 6.8)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(col_w4, 4.4, _safe(f" {v2}"), border=1, fill=True)
            pdf.ln(4.4)

        if ec.get("decision_scope"):
            pdf.set_fill_color(241, 245, 249)
            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(79, 70, 229)
            pdf.cell(col_w1, 4.4, " Decision Scope", border=1, fill=True)
            pdf.set_font("Helvetica", "I", 6.6)
            pdf.set_text_color(51, 65, 85)
            pdf.cell(col_w2 + col_w3 + col_w4, 4.4, _safe(f" {ec['decision_scope']}"), border=1, fill=True)
            pdf.ln(4.4)
        pdf.ln(3)

    # 3b. Head-to-Head Comparative Valuation Matrix (Rendered when comparing entities)
    if is_comp and len(comp_list) >= 2:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Comparative Valuation & Quality Matrix (Head-to-Head)", new_x="LMARGIN", new_y="NEXT")

        c_col_w = [page_w * 0.30, page_w * 0.17, page_w * 0.17, page_w * 0.18, page_w * 0.18]
        pdf.set_fill_color(238, 242, 255)
        pdf.set_draw_color(199, 210, 254)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(67, 56, 202)
        pdf.cell(c_col_w[0], 5.5, "Company (Ticker)", border=1, fill=True)
        pdf.cell(c_col_w[1], 5.5, "Market Price", border=1, fill=True, align="C")
        pdf.cell(c_col_w[2], 5.5, "P/E Multiple", border=1, fill=True, align="C")
        pdf.cell(c_col_w[3], 5.5, "ROE (Quality)", border=1, fill=True, align="C")
        pdf.cell(c_col_w[4], 5.5, "Operating Margin", border=1, fill=True, align="C")
        pdf.ln(5.5)

        for c_idx, comp in enumerate(comp_list):
            pdf.set_fill_color(255, 255, 255) if c_idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(c_col_w[0], 5.5, _safe(f"{comp.get('name')} ({comp.get('ticker')})"), border=1, fill=True)
            
            pdf.set_font("Helvetica", "", 8)
            p_curr = comp.get("currency", "INR")
            p_val = comp.get("price")
            p_str = f"{p_curr} {p_val:,.2f}" if isinstance(p_val, (int, float)) else str(p_val or "--")
            pdf.cell(c_col_w[1], 5.5, _safe(p_str), border=1, fill=True, align="C")
            
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(99, 102, 241)
            pdf.cell(c_col_w[2], 5.5, _safe(comp.get("pe") or "--"), border=1, fill=True, align="C")
            
            pdf.set_text_color(16, 185, 129)
            pdf.cell(c_col_w[3], 5.5, _safe(comp.get("roe") or "--"), border=1, fill=True, align="C")
            
            pdf.set_text_color(14, 165, 233)
            pdf.cell(c_col_w[4], 5.5, _safe(comp.get("opm") or "--"), border=1, fill=True, align="C")
            pdf.ln(5.5)
        pdf.ln(3)

    # Helper for educational beginner & expert reading guide boxes
    def _render_guide_box(title: str, beginner_tip: str, expert_context: str = ""):
        if pdf.get_y() > 248:
            pdf.add_page()
        pdf.set_fill_color(248, 250, 252)
        pdf.set_draw_color(226, 232, 240)
        
        pdf.set_font("Helvetica", "B", 7.2)
        pdf.set_text_color(79, 70, 229)
        pdf.cell(page_w, 3.8, _safe(f"  [i] {title}"), border="LRT", fill=True, new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("Helvetica", "B", 6.8)
        pdf.set_text_color(16, 185, 129)
        pdf.cell(page_w, 3.2, "   Beginner Reading Guide: ", border="LR", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 7.0)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(page_w, 3.5, _safe(f"   {beginner_tip}"), border="LR", fill=True, new_x="LMARGIN", new_y="NEXT")
        
        if expert_context:
            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(100, 116, 139)
            pdf.cell(page_w, 3.2, "   Institutional / Expert Context: ", border="LR", fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "I", 6.8)
            pdf.set_text_color(71, 85, 105)
            pdf.multi_cell(page_w, 3.5, _safe(f"   {expert_context}"), border="LR", fill=True, new_x="LMARGIN", new_y="NEXT")
            
        pdf.cell(page_w, 0.8, "", border="LRB", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2.0)

    # 4. Key Ratios & Fundamental Health Table Grid
    ratios = (report.financial or {}).get("ratios_table") or []
    if ratios:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Key Fundamental Multiples & Health Grid", new_x="LMARGIN", new_y="NEXT")

        # Assessment gets 0.25 of the width, not 0.20: _assess() can emit
        # "Net cash / minimal leverage", which is ~39mm in bold 7.5pt and used
        # to spill over its own border at 0.20 (38mm). The metric column has the
        # slack to give — its longest label, "ROE (return on equity)", is ~40mm.
        col_w = [page_w * 0.30, page_w * 0.16, page_w * 0.16, page_w * 0.13,
                 page_w * 0.25]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(col_w[0], 5, "Metric / Operational Factor", border=1, fill=True)
        pdf.cell(col_w[1], 5, "Reported Value", border=1, fill=True, align="C")
        pdf.cell(col_w[2], 5, "Sector Benchmark", border=1, fill=True, align="C")
        pdf.cell(col_w[3], 5, "Delta", border=1, fill=True, align="C")
        pdf.cell(col_w[4], 5, "Assessment", border=1, fill=True, align="C")
        pdf.ln(5)

        for idx, row in enumerate(ratios):
            pdf.set_fill_color(255, 255, 255) if idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(col_w[0], 5, _safe(row.get("metric", "")), border=1, fill=True)
            pdf.set_font("Helvetica", "B", 8)
            pdf.cell(col_w[1], 5, _safe(row.get("reported") or row.get("value", "")),
                     border=1, fill=True, align="C")
            pdf.set_font("Helvetica", "", 7.5)
            # These read `sector`/`assessment` because that is what
            # report/schema.py::_ratios_table() emits. Reading `benchmark`
            # and `posture` left both columns blank in every PDF.
            pdf.cell(col_w[2], 5, _safe(row.get("sector", "")), border=1, fill=True, align="C")
            pdf.set_text_color(100, 116, 139)
            pdf.cell(col_w[3], 5, _safe(row.get("delta", "--")), border=1, fill=True, align="C")

            assessment = str(row.get("assessment") or "Measured")
            is_pos = any(k in assessment for k in
                         ("Well above", "Above sector", "Net cash", "Conservative",
                          "Bullish"))
            # fpdf2's cell() does not clip, it overflows the border, so a long
            # verdict steps down a size rather than bleeding into the next column.
            pdf.set_font("Helvetica", "B", 6.5 if len(assessment) > 22 else 7.5)
            pdf.set_text_color(16, 185, 129) if is_pos else pdf.set_text_color(79, 70, 229)
            pdf.cell(col_w[4], 5, _safe(assessment), border=1, fill=True, align="C")
            pdf.ln(5)
        pdf.ln(2)

        _render_guide_box(
            "How to Read Fundamental Multiples",
            "P/E indicates how many rupees you pay per rupee of annual profit (lower can indicate value if profits are stable). ROE shows how efficiently management converts shareholder funds into profit (>20% is strong). Net Cash means bank reserves exceed all borrowings, eliminating insolvency risk.",
            "Capital-light compounding profile: sustained ROE outperformance without leverage reflects pricing moats, disciplined capital allocation, and strong returns on incremental invested capital (ROIC)."
        )

    # 4b. Quarterly Performance & Earnings Progression Grid (Q1-Q4)
    q_table = (report.financial or {}).get("quarterly_table") or []
    if q_table:
        if pdf.get_y() > 215:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Quarterly Financial Performance & Earnings Progression (Q1-Q4)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 7.2)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(page_w, 3.8, "Fiscal periods mapped to corporate March 31 year-end cycle (Apr-Jun = Q1, Jul-Sep = Q2, Oct-Dec = Q3, Jan-Mar = Q4).", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        q_col_w = [page_w * 0.28, page_w * 0.18, page_w * 0.18, page_w * 0.18, page_w * 0.18]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(q_col_w[0], 5, "Reporting Quarter", border=1, fill=True)
        pdf.cell(q_col_w[1], 5, "Revenue (Topline)", border=1, fill=True, align="C")
        pdf.cell(q_col_w[2], 5, "Net Profit (PAT)", border=1, fill=True, align="C")
        pdf.cell(q_col_w[3], 5, "Operating Margin", border=1, fill=True, align="C")
        pdf.cell(q_col_w[4], 5, "YoY Revenue Growth", border=1, fill=True, align="C")
        pdf.ln(5)

        for q_idx, q_row in enumerate(q_table):
            pdf.set_fill_color(255, 255, 255) if q_idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(q_col_w[0], 5, _safe(q_row.get("period", "")), border=1, fill=True)

            pdf.set_font("Helvetica", "", 7.5)
            pdf.cell(q_col_w[1], 5, _safe(q_row.get("revenue", "--")), border=1, fill=True, align="C")

            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(16, 185, 129)
            pdf.cell(q_col_w[2], 5, _safe(q_row.get("net_profit", "--")), border=1, fill=True, align="C")

            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(q_col_w[3], 5, _safe(q_row.get("opm", "--")), border=1, fill=True, align="C")

            growth = q_row.get("yoy_growth", "--")
            pdf.set_font("Helvetica", "B", 7.5)
            is_growth_pos = str(growth).startswith("+")
            pdf.set_text_color(16, 185, 129) if is_growth_pos else (pdf.set_text_color(239, 68, 68) if str(growth).startswith("-") else pdf.set_text_color(100, 116, 139))
            pdf.cell(q_col_w[4], 5, _safe(growth), border=1, fill=True, align="C")
            pdf.ln(5)
        pdf.ln(2)

        _render_guide_box(
            "How to Read Quarterly Financial Progression",
            "Revenue is total sales generated from clients (topline); Net Profit (PAT) is cash left after all costs, salaries, and taxes (bottom line); Operating Margin (OPM) is profit percentage before financing costs. Check whether sequential quarters show stable execution or margin compression.",
            "Sequential constant-currency velocity and operating margin resilience isolate operating leverage, employee utilization rates, and wage inflation absorption across reporting cycles."
        )

    # 4c. Valuation Sensitivity Analysis (EPS Multiple Scenarios)
    v_scenarios = getattr(report, "valuation_scenarios", []) or []
    if v_scenarios:
        if pdf.get_y() > 220:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Valuation Sensitivity Analysis (EPS Multiple Scenarios)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 7.2)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(page_w, 3.8, "Sensitivity model holds trailing EPS constant and varies earnings multiples to derive mechanical valuations.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        s_col_w = [page_w * 0.22, page_w * 0.28, page_w * 0.50]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(s_col_w[0], 5, "Multiple Scenario", border=1, fill=True)
        pdf.cell(s_col_w[1], 5, "Implied Share Price", border=1, fill=True, align="C")
        pdf.cell(s_col_w[2], 5, "Scenario Rationale", border=1, fill=True)
        pdf.ln(5)

        for s_idx, s_row in enumerate(v_scenarios):
            pdf.set_fill_color(255, 255, 255) if s_idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(s_col_w[0], 5, _safe(s_row.get("multiple", "")), border=1, fill=True)

            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(79, 70, 229)
            pdf.cell(s_col_w[1], 5, _safe(s_row.get("implied_price", "--")), border=1, fill=True, align="C")

            pdf.set_font("Helvetica", "", 7.2)
            pdf.set_text_color(71, 85, 105)
            pdf.cell(s_col_w[2], 5, _safe(s_row.get("description", "")), border=1, fill=True)
            pdf.ln(5)
        pdf.ln(2)

        _render_guide_box(
            "How to Read Valuation Sensitivity Scenarios",
            "This table does NOT forecast future stock prices. Instead, it asks: 'Assuming current annual profit per share stays constant, what would the stock be worth under pessimistic (10-11x), fair (13-14x), or optimistic (17-18x) market sentiment?' It establishes an objective valuation corridor.",
            "Mechanical sensitivity isolates the equity risk premium and multiple compression/expansion dynamics holding earnings static, benchmarking market price against historical valuation cycles."
        )

    # 4. Embed Financial Charts
    if "financial_metrics" in charts and os.path.exists(charts["financial_metrics"]):
        if pdf.get_y() > 210:
            pdf.add_page()
        pdf.image(charts["financial_metrics"], x=pdf.l_margin, w=page_w)
        pdf.ln(2)
        _render_guide_box(
            "Visual Chart Interpretation",
            "The visual bars depict revenue and net profit progression across historical periods. Upward stair-steps confirm operational growth; flat bars indicate consolidation or cyclical cooling.",
            "Visual inspection of revenue-to-PAT conversion highlights operating leverage trends, tax rate consistency, and fixed cost absorption across cycles."
        )
        # Helper for true hanging-indent bullet lists across all sections
    def _render_bullet(text: str, marker: str = "-", marker_color=(71, 85, 105),
                       text_color=(51, 65, 85), font_size: float = 8.5,
                       line_height: float = 4.2, tag: str = "", indent: float = 2.0):
        if pdf.get_y() > 268:
            pdf.add_page()
        start_x = pdf.l_margin + indent
        pdf.set_font("Helvetica", "B", font_size)
        measured_marker_w = pdf.get_string_width(_safe(marker))
        marker_w = max(4.5, measured_marker_w + 2.5)
        text_w = page_w - indent - marker_w
        clean_text = text.replace("Publisher reports: ", "").strip()
        full_text = f"{clean_text}{tag}"
        start_y = pdf.get_y()

        pdf.set_xy(start_x, start_y)
        pdf.set_font("Helvetica", "B", font_size)
        pdf.set_text_color(*marker_color)
        pdf.cell(marker_w, line_height, _safe(marker), align="L")

        pdf.set_xy(start_x + marker_w, start_y)
        pdf.set_font("Helvetica", "", font_size)
        pdf.set_text_color(*text_color)
        pdf.multi_cell(text_w, line_height, _safe(full_text), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(0.8)

    # 5. Specialist Section Card Builder
    def render_section_card(title: str, content: Any, accent_color=(30, 41, 59)):
        summary = ""
        findings = []
        if isinstance(content, dict):
            summary = (content.get("summary") or "").strip()
            findings = content.get("findings") or []
        elif content:
            summary = str(content).strip()

        is_unavailable = not summary or summary.startswith("Unavailable") or "evidence gap" in summary.lower()
        has_items = any(
            bool(f.get("claim", "") if isinstance(f, dict) else str(f))
            for f in findings
        )

        # In comparative or focused runs, if a section has neither valid narrative nor findings,
        # render a subtle, compact evidence-gap note instead of an empty, orphaned card header.
        if is_unavailable and not has_items:
            if pdf.get_y() > 260:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 9.0)
            pdf.set_text_color(100, 116, 139)
            pdf.cell(page_w * 0.65, 4.8, _safe(title))
            pdf.set_font("Helvetica", "I", 7.8)
            pdf.set_text_color(148, 163, 184)
            pdf.cell(page_w * 0.35, 4.8, "Evidence gap (no disclosures)", align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.2)
            return

        if pdf.get_y() > 225:
            pdf.add_page()

        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(*accent_color)
        pdf.cell(page_w, 5.5, _safe(title), new_x="LMARGIN", new_y="NEXT")

        # Print narrative summary in clean style if available
        if summary and not is_unavailable:
            clean_summary = summary.replace("Publisher reports: ", "").strip()
            pdf.set_font("Helvetica", "I", 9.0)
            pdf.set_text_color(15, 23, 42)
            pdf.set_x(pdf.l_margin + 2)
            pdf.multi_cell(page_w - 4, 4.6, _safe(clean_summary), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

        # Print bulleted findings with clean hanging indentation
        for f in findings:
            claim = f.get("claim", "") if isinstance(f, dict) else str(f)
            claim = claim.strip()
            if claim and claim != summary:
                refs = f.get("citations") or [] if isinstance(f, dict) else []
                tag = (" " + "".join(f"[{n}]" for n in refs)) if refs else ""
                _render_bullet(claim, marker="-", marker_color=accent_color, text_color=(51, 65, 85),
                               font_size=8.5, line_height=4.2, tag=tag, indent=2.0)

        pdf.ln(2.5)

    d = report.model_dump()
    if pdf.get_y() > 185:
        pdf.add_page()
    else:
        pdf.ln(4)

    render_section_card("1. Financial Health & Balance Sheet Quality", d.get("financial"), (15, 23, 42))
    render_section_card("2. Valuation & Relative Multiples", d.get("valuation"), (15, 23, 42))
    render_section_card("3. Market Dynamics & Technical Snapshot", d.get("market"), (15, 23, 42))
    render_section_card("4. Strategic Growth Initiatives & Expansion", d.get("growth"), (15, 23, 42))
    render_section_card("5. Recent Corporate News & Deal Flow", d.get("news"), (15, 23, 42))
    render_section_card("6. Key Risk Factors & Thesis Vulnerabilities", d.get("risk"), (185, 28, 28))

    # 6. Bull vs Bear Thematic Scorecard & Breakdown
    if "scorecard" in charts and os.path.exists(charts["scorecard"]):
        if pdf.get_y() > 210:
            pdf.add_page()
        pdf.image(charts["scorecard"], x=pdf.l_margin, w=page_w)
        pdf.ln(3)

    # Bull & Bear Containers
    if report.bull_case or report.bear_case:
        if pdf.get_y() > 215:
            pdf.add_page()

        if report.bull_case:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(16, 185, 129)
            pdf.cell(page_w, 5.5, "[+] Bull Case & Upside Catalysts", new_x="LMARGIN", new_y="NEXT")
            for item in report.bull_case:
                _render_bullet(item, marker="+", marker_color=(16, 185, 129), text_color=(30, 41, 59), indent=2.0)
            pdf.ln(2)

        if report.bear_case:
            if pdf.get_y() > 240:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(225, 29, 72)
            pdf.cell(page_w, 5.5, "[-] Bear Case & Downside Risks", new_x="LMARGIN", new_y="NEXT")
            for item in report.bear_case:
                _render_bullet(item, marker="-", marker_color=(225, 29, 72), text_color=(30, 41, 59), indent=2.0)
            pdf.ln(2)

        if report.what_could_change_view:
            if pdf.get_y() > 245:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 9.5)
            pdf.set_text_color(79, 70, 229)
            pdf.cell(page_w, 5, "What Could Change This View", new_x="LMARGIN", new_y="NEXT")
            for item in report.what_could_change_view:
                _render_bullet(item, marker=">", marker_color=(79, 70, 229), text_color=(51, 65, 85), font_size=8.5, indent=2.0)
            pdf.ln(2)

    # 6b. Institutional Action Framework: Hold, Reduce, or Sell?
    df = getattr(report, "decision_framework", {}) or {}
    if df and (df.get("hold_when") or df.get("reduce_when") or df.get("sell_when")):
        if pdf.get_y() > 210:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Investment Action Framework: Hold, Reduce, or Sell?", new_x="LMARGIN", new_y="NEXT")

        if df.get("base_stance"):
            pdf.set_fill_color(241, 245, 249)
            pdf.set_draw_color(99, 102, 241)
            pdf.set_font("Helvetica", "B", 8.2)
            pdf.set_text_color(15, 23, 42)
            pdf.multi_cell(page_w, 4.4, _safe(f"Base Stance: {df['base_stance']}"), border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2.5)

        for heading, key, marker, color, bg_col, border_col in [
            ("Hold is more defensible when:", "hold_when", "+", (16, 185, 129), (240, 253, 244), (187, 247, 208)),
            ("Reduce is more defensible when:", "reduce_when", "*", (217, 119, 6), (255, 251, 235), (254, 240, 138)),
            ("Sell is more defensible when:", "sell_when", "-", (225, 29, 72), (255, 241, 242), (254, 205, 211)),
        ]:
            items = df.get(key) or []
            if items:
                if pdf.get_y() > 240:
                    pdf.add_page()
                pdf.set_fill_color(*bg_col)
                pdf.set_draw_color(*border_col)
                pdf.set_font("Helvetica", "B", 8.2)
                pdf.set_text_color(*color)
                pdf.cell(page_w, 4.4, _safe(f"  {heading}"), border="LRT", fill=True, new_x="LMARGIN", new_y="NEXT")
                for itm in items:
                    if pdf.get_y() > 265:
                        pdf.add_page()
                    pdf.set_fill_color(*bg_col)
                    start_x = pdf.l_margin + 2.0
                    m_w = 5.0
                    t_w = page_w - m_w - 4.0
                    s_y = pdf.get_y()
                    pdf.set_xy(start_x, s_y)
                    pdf.set_font("Helvetica", "B", 7.8)
                    pdf.set_text_color(*color)
                    pdf.cell(m_w, 3.8, _safe(f" {marker} "), align="C")
                    pdf.set_xy(start_x + m_w, s_y)
                    pdf.set_font("Helvetica", "", 7.4)
                    pdf.set_text_color(51, 65, 85)
                    pdf.multi_cell(t_w, 3.8, _safe(itm), new_x="LMARGIN", new_y="NEXT")
                pdf.set_fill_color(*bg_col)
                pdf.cell(page_w, 1.2, "", border="LRB", fill=True, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(2.0)

    # 6b-ii. How the Stance Was Reached: Step-by-Step Reasoned Deductions
    deductions = getattr(report, "reasoned_deductions", []) or []
    if deductions:
        if pdf.get_y() > 210:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "How the Stance Was Reached: Step-by-Step Reasoned Deductions", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        for ded in deductions:
            if pdf.get_y() > 265:
                pdf.add_page()
            _render_bullet(ded, marker=">", marker_color=(79, 70, 229), text_color=(30, 41, 59), font_size=7.6, line_height=3.8, indent=2.0)
        pdf.ln(2.5)

    # 6c. Indicators to Monitor Each Quarter
    mon_items = getattr(report, "monitoring_indicators", []) or []
    if mon_items:
        if pdf.get_y() > 200:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Quarterly Monitoring Checklist (What to Track Each Quarter)", new_x="LMARGIN", new_y="NEXT")

        m_col_w = [page_w * 0.32, page_w * 0.34, page_w * 0.34]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "B", 7.2)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(m_col_w[0], 5, "Performance Indicator", border=1, fill=True)
        pdf.cell(m_col_w[1], 5, "Supports Holding Thesis (+)", border=1, fill=True)
        pdf.cell(m_col_w[2], 5, "Weakens Thesis / Action Trigger (-)", border=1, fill=True)
        pdf.ln(5)

        for m_idx, m_row in enumerate(mon_items):
            if pdf.get_y() > 265:
                pdf.add_page()
            pdf.set_fill_color(255, 255, 255) if m_idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
            pdf.set_font("Helvetica", "B", 6.8)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(m_col_w[0], 5, _safe(m_row.get("indicator", "")), border=1, fill=True)

            pdf.set_font("Helvetica", "", 6.6)
            pdf.set_text_color(16, 185, 129)
            pdf.cell(m_col_w[1], 5, _safe(m_row.get("support_thesis", "")), border=1, fill=True)

            pdf.set_text_color(225, 29, 72)
            pdf.cell(m_col_w[2], 5, _safe(m_row.get("weaken_thesis", "")), border=1, fill=True)
            pdf.ln(5)
        pdf.ln(2)

        _render_guide_box(
            "How to Use the Quarterly Monitoring Checklist",
            "Every 3 months when the company reports quarterly earnings, review these items. If actual disclosures match the green column, your holding stance is on track. If key items trigger the red column (such as operating margins dropping below 20%), it signals that it is time to reduce or re-evaluate.",
            "Establishes an empirical falsification rubric, auditing deal TCV conversion into recognized revenue, geographic stabilization in Western markets, and organic cash-backed shareholder distributions."
        )

    # 7. Specialist Agent Reasoning & Findings
    notes = [n for n in (d.get("agent_notes") or []) if isinstance(n, dict)]
    if notes:
        if pdf.get_y() > 195:
            pdf.add_page()
        else:
            pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 6, "Specialist Agent Reasoning & Findings",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(100, 116, 139)
        pdf.multi_cell(page_w, 4, _safe(
            "Each specialist's own account of how it worked the question, followed by "
            "the findings it filed. Bracketed numbers refer to the citation index that "
            "follows."), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        for note in notes:
            if pdf.get_y() > 235:
                pdf.add_page()
            completed = str(note.get("status") or "") == "completed"
            meta_bits = [bit for bit in (
                f"confidence: {note.get('confidence')}" if note.get("confidence") else "",
                f"{note.get('evidence_count', 0)} evidence",
                f"{len(note.get('findings') or [])} findings",
            ) if bit]

            # Clean header bar
            pdf.set_fill_color(241, 245, 249) if completed else pdf.set_fill_color(254, 242, 242)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(15, 23, 42) if completed else pdf.set_text_color(185, 28, 28)
            pdf.cell(page_w * 0.52, 5.5, f" {_safe(note.get('label') or note.get('agent') or '')}", fill=True)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(71, 85, 105)
            pdf.cell(page_w * 0.48, 5.5,
                     _safe(" | ".join(meta_bits) + " " if completed
                           else f"{note.get('status', 'no result')} "),
                     fill=True, align="R")
            pdf.ln(6.5)

            mandate = str(note.get("mandate") or "").strip()
            if mandate:
                pdf.set_font("Helvetica", "I", 7.5)
                pdf.set_text_color(100, 116, 139)
                pdf.set_x(pdf.l_margin + 2)
                pdf.multi_cell(page_w - 4, 3.8, _safe(f"Mandate: {mandate}"), new_x="LMARGIN", new_y="NEXT")

            thought = str(note.get("thought") or "").strip()
            if thought:
                pdf.set_font("Helvetica", "", 8.5)
                pdf.set_text_color(51, 65, 85)
                pdf.set_x(pdf.l_margin + 2)
                pdf.multi_cell(page_w - 4, 4.2, _safe(f"Thought: {thought}"), new_x="LMARGIN", new_y="NEXT")
                pdf.ln(0.8)

            for item in note.get("findings") or []:
                claim = (str(item.get("claim", "")) if isinstance(item, dict) else str(item)).strip()
                if not claim:
                    continue
                refs = item.get("citations") or [] if isinstance(item, dict) else []
                tag = (" " + "".join(f"[{n}]" for n in refs)) if refs else ""
                _render_bullet(claim, marker="•", marker_color=(71, 85, 105), text_color=(30, 41, 59),
                               font_size=8.0, line_height=3.8, tag=tag, indent=3.0)

            for item in note.get("risks") or []:
                claim = (str(item.get("claim", "")) if isinstance(item, dict) else str(item)).strip()
                if not claim:
                    continue
                refs = item.get("citations") or [] if isinstance(item, dict) else []
                tag = (" " + "".join(f"[{n}]" for n in refs)) if refs else ""
                _render_bullet(claim, marker="▲", marker_color=(185, 28, 28), text_color=(185, 28, 28),
                               font_size=8.0, line_height=3.8, tag=tag, indent=3.0)

            gaps = [str(g).strip() for g in (note.get("data_gaps") or []) if str(g).strip()]
            if gaps:
                if pdf.get_y() > 262:
                    pdf.add_page()
                pdf.set_font("Helvetica", "I", 7.5)
                pdf.set_text_color(148, 163, 184)
                pdf.set_x(pdf.l_margin + 2)
                pdf.multi_cell(page_w - 4, 3.8, _safe("Unresolved: " + "; ".join(gaps[:4])),
                               new_x="LMARGIN", new_y="NEXT")
            pdf.ln(3)

    # 7b. Intentional Analysis Boundaries & Negative Disclosures
    neg_disclosures = getattr(report, "intentional_limitations", []) or []
    if neg_disclosures:
        if pdf.get_y() > 215:
            pdf.add_page()
        else:
            pdf.ln(3)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Intentional Analysis Boundaries & Negative Disclosures", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "I", 7.8)
        pdf.set_text_color(100, 116, 139)
        pdf.multi_cell(page_w, 4.0, _safe("What this institutional research intentionally does NOT claim:"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        for disc in neg_disclosures:
            _render_bullet(disc, marker="x", marker_color=(225, 29, 72), text_color=(71, 85, 105), font_size=7.6, line_height=3.8, indent=2.5)
        pdf.ln(2.5)

    # 8. Sources & Evidence Table
    if report.sources:
        if pdf.get_y() > 185:
            pdf.add_page()
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(page_w, 5.5, "Verified Sources & Primary Evidence Citations", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

        src_w = [10, 46, 26, page_w - 82]
        pdf.set_fill_color(241, 245, 249)
        pdf.set_draw_color(203, 213, 225)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(src_w[0], 5, "Ref", border=1, fill=True, align="C")
        pdf.cell(src_w[1], 5, " Publisher / Source", border=1, fill=True)
        pdf.cell(src_w[2], 5, " Date", border=1, fill=True, align="C")
        pdf.cell(src_w[3], 5, " Verified Online Reference", border=1, fill=True)
        pdf.ln(5)

        for idx, s in enumerate(report.sources[:16]):
            if pdf.get_y() > 265:
                pdf.add_page()
            n_tag = f"[{s.get('n', idx + 1)}]"
            src_title = s.get("title") or "Source Document"
            src_url = s.get("url") or ""
            src_date = s.get("publication_date") or "--"
            if len(src_date) > 10 and "T" in src_date:
                src_date = src_date.split("T")[0]

            if len(src_title) > 30:
                src_title = src_title[:27] + "..."

            if not src_url:
                url_display = "Exchange / Regulatory Disclosure"
            elif "news.google.com" in src_url.lower():
                url_display = "Google News Article (Click to Open)"
            elif len(src_url) > 52:
                url_display = src_url[:49] + "..."
            else:
                url_display = src_url

            fill = (idx % 2 == 1)
            pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
            pdf.set_draw_color(226, 232, 240)

            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(79, 70, 229)
            pdf.cell(src_w[0], 5, n_tag, border=1, fill=True, align="C")

            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(src_w[1], 5, f" {_safe(src_title)}", border=1, fill=True)

            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(100, 116, 139)
            pdf.cell(src_w[2], 5, _safe(src_date), border=1, fill=True, align="C")

            pdf.set_font("Helvetica", "U" if src_url else "", 7.5)
            pdf.set_text_color(37, 99, 235) if src_url else pdf.set_text_color(100, 116, 139)
            pdf.cell(src_w[3], 5, f" {_safe(url_display)}", border=1, fill=True, link=src_url)
            pdf.ln(5)
        pdf.ln(3)

    # 9. Institutional Audit & Evidence Governance Protocol
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(page_w, 5.5, "Institutional Research Governance & Verification Protocol", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    audit_col_w = [page_w * 0.32, page_w * 0.68]
    contributions = [c for c in (report.agent_contributions or []) if str(c).strip()]
    audit_rows = [
        ("Research Architecture",
         f"Concurrent specialist pipeline - {len(contributions)} agents contributed to this report"
         if contributions else "Concurrent specialist pipeline"),
        ("Data Grounding Standard",
         f"{grounding}% verified against filings, exchange disclosures & market feeds"
         if grounding is not None
         else "Claim-to-source mapping applied; grounding share not measured for this run"),
        ("Scoring Methodology",
         f"{q_score} / {q_max} - Deterministic fundamental quality formula (no model-assigned scores)"
         if q_score is not None
         else "Deterministic fundamental quality formula; not scored (no measured inputs)"),
        ("Adversarial Synthesis", "Automated multi-perspective thesis balance with verifiable bullish & bearish criteria"),
        ("Hallucination Defense", "Strict claim-to-source mapping; unverified statements flagged as evidence gaps"),
        ("Research Status", "Decision-Support Intelligence (Fiduciary institutional framework; not investment advice)")
    ]

    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(audit_col_w[0], 5, " Governance Dimension", border=1, fill=True)
    pdf.cell(audit_col_w[1], 5, " System Standard & Verification Status", border=1, fill=True)
    pdf.ln(5)

    for idx, (dim, status) in enumerate(audit_rows):
        fill = (idx % 2 == 1)
        pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(audit_col_w[0], 4.8, f" {_safe(dim)}", border=1, fill=True)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(audit_col_w[1], 4.8, f" {_safe(status)}", border=1, fill=True)
        pdf.ln(4.8)

    pdf.ln(3)

    # 9. Methodology Footer
    if pdf.get_y() > 255:
        pdf.add_page()
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(148, 163, 184)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(page_w, 3.5,
                   "Methodology: Multi-agent deterministic evidence validation. Unsupported claims are classified as evidence gaps. "
                   "Decision-support framework only; not investment advice.", new_x="LMARGIN", new_y="NEXT")

    pdf.output(path)
    return path


def _render_news_pdf_fallback(report: ReportJSON, path: str) -> str:
    """Pure-Python focused layout used when WeasyPrint is unavailable."""
    from fpdf import FPDF

    def _safe(value) -> str:
        replacements = {
            "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
            "\u2013": "-", "\u2014": "--", "\u2022": "*", "\u2026": "...",
            "\u00a0": " ", "\u20b9": "INR ", "\u20ac": "EUR ", "\u00a3": "GBP ",
        }
        text = "" if value is None else str(value)
        for source, replacement in replacements.items():
            text = text.replace(source, replacement)
        return text.encode("latin-1", errors="replace").decode("latin-1")

    company = (report.company or {}).get("name") or "News Brief"

    class NewsPDF(FPDF):
        def header(self):
            if self.page_no() > 1:
                self.set_font("Helvetica", "I", 7.5)
                self.set_text_color(148, 163, 184)
                self.cell(0, 4.5, _safe(f"Artha AI News Brief | {company}"), border="B")
                self.ln(5)

        def footer(self):
            self.set_y(-10)
            self.set_font("Helvetica", "I", 7.5)
            self.set_text_color(148, 163, 184)
            self.cell(0, 4, f"Page {self.page_no()} of {{nb}} | Validated News Brief", align="C")

    pdf = NewsPDF(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    width = pdf.epw

    pdf.set_fill_color(15, 23, 42)
    pdf.rect(pdf.l_margin, pdf.get_y(), width, 24, style="F")
    pdf.set_xy(pdf.l_margin + 5, pdf.get_y() + 3)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(width - 10, 7, "VALIDATED NEWS BRIEF", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(pdf.l_margin + 5)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(width - 10, 5, _safe(company), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(9)

    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(pdf.l_margin, pdf.get_y(), width, 13, style="FD")
    pdf.set_xy(pdf.l_margin + 4, pdf.get_y() + 2)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(79, 70, 229)
    pdf.cell(24, 4.5, "QUERY:")
    pdf.set_font("Helvetica", "I", 8.2)
    pdf.set_text_color(30, 41, 59)
    pdf.multi_cell(width - 32, 4.5, _safe(report.query), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(width, 6, "Executive News Intelligence & Summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(30, 41, 59)
    summary_text = (report.news or {}).get("summary") or report.executive_summary or "No validated news evidence was retrieved for this query."
    pdf.multi_cell(width, 4.8, _safe(summary_text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(width, 6, "Dated Headlines and Claims", new_x="LMARGIN", new_y="NEXT")
    findings = (report.news or {}).get("findings") or []
    if not findings:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(148, 163, 184)
        pdf.multi_cell(width, 4.8, "No validated news evidence was retrieved. Retrieval or coverage is unavailable.",
                       new_x="LMARGIN", new_y="NEXT")
    else:
        for item in findings:
            if pdf.get_y() > 245:
                pdf.add_page()
            refs = "".join(f"[{n}]" for n in (item.get("citations") or []))
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(43, 43, 143)
            pdf.multi_cell(width, 4.5, _safe(f"{item.get('publication_date') or 'Date unavailable'} - "
                                             f"{item.get('claim', '')} {refs}"),
                           new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(71, 85, 105)
            source = item.get("source_title") or "Source not named"
            url = item.get("source_url") or ""
            if url and len(url) > 75 and "news.google.com" in url:
                pdf.cell(width, 4, _safe(f"Source: {source} (Google News Link)"), link=url, new_x="LMARGIN", new_y="NEXT")
            elif url:
                pdf.multi_cell(width, 4, _safe(f"Source: {source} {url}"),
                               new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.cell(width, 4, _safe(f"Source: {source}"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(width, 6, "Sources and Citations", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    sources = report.sources or []
    if sources:
        for source in sources:
            date = f" ({source.get('publication_date')})" if source.get("publication_date") else ""
            url = source.get("url") or ""
            if url and len(url) > 75 and "news.google.com" in url:
                pdf.cell(width, 4, _safe(f"[{source.get('n')}] {source.get('title') or 'Source'}{date} (Online Link)"),
                         link=url, new_x="LMARGIN", new_y="NEXT")
            elif url:
                pdf.multi_cell(width, 4, _safe(f"[{source.get('n')}] {source.get('title') or 'Source'}{date} {url}"),
                               new_x="LMARGIN", new_y="NEXT")
            else:
                pdf.cell(width, 4, _safe(f"[{source.get('n')}] {source.get('title') or 'Source'}{date}"),
                         new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.multi_cell(width, 4.5, "No source citations are available because no validated news evidence was retrieved.",
                       new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(width, 6, "Coverage and Limitations", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(71, 85, 105)
    gaps = [str(g) for g in (report.evidence_gaps or []) if str(g).strip()]
    text = "\n".join(gaps) if gaps else (
        "This brief is limited to the validated news evidence listed above; absence "
        "of an item is not evidence that no event occurred.")
    pdf.multi_cell(width, 4.3, _safe(text), new_x="LMARGIN", new_y="NEXT")
    pdf.output(path)
    return path
