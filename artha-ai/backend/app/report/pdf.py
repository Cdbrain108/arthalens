"""Deterministic PDF rendering; all prose and measurements come from ReportJSON."""
import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import settings
from ..schemas.models import ReportJSON

logger = logging.getLogger("bullseye.report")
_TEMPLATES = Path(__file__).parent / "templates"


def render_html(report: ReportJSON, charts=None) -> str:
    env = Environment(loader=FileSystemLoader(str(_TEMPLATES)), autoescape=select_autoescape(["html", "j2"]))
    name = "news_report.html.j2" if report.overall_assessment.get("report_type") == "news" else "report.html.j2"
    logo = Path(__file__).resolve().parents[3] / "frontend/public/brand/logo-dark.svg"
    return env.get_template(name).render(report=report.model_dump(), charts=charts or {},
                                         logo_uri=logo.as_uri())


def _safe(value):
    return str(value or "").replace("—", "-").replace("–", "-").replace("₹", "INR ").encode("latin-1", "replace").decode("latin-1")


def _render_pdf_fallback(report: ReportJSON, path: str) -> str:
    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    logo = Path(__file__).resolve().parents[3] / "frontend/public/brand/logo-mark.png"
    if logo.exists():
        pdf.image(str(logo), x=pdf.l_margin, y=pdf.get_y(), w=16)
        pdf.ln(18)
    pdf.set_title("Bullseye research: " + report.query)
    pdf.set_author("Bullseye")

    def text(value, size=10, bold=False):
        pdf.set_font("Helvetica", "B" if bold else "", size)
        pdf.set_text_color(24, 39, 31)
        pdf.multi_cell(0, 5.5, _safe(value), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    def heading(value):
        pdf.ln(4)
        text(value, 14, True)

    text("Bullseye / Research beyond the noise", 12, True)
    heading(report.company.get("name") or "Company research")
    text(report.query)
    text(report.overall_assessment.get("classification", "NOT ASSESSED"), 16, True)
    text(report.executive_summary)
    text("Research aid, not financial advice. Sources can be incomplete or delayed.", 9)
    for name in ("financial", "valuation", "market", "growth", "news", "workforce", "risk", "industry", "management", "document", "social"):
        section = getattr(report, name) or {}
        if not section:
            continue
        heading(name.replace("workforce", "Hiring & workforce").title())
        findings = section.get("cited_findings") or section.get("findings") or []
        if not findings:
            text(section.get("summary") or "Data unavailable.")
        for finding in findings:
            refs = ""
            if isinstance(finding, dict):
                refs = " ".join(f"[{n}]" for n in finding.get("citations", []))
                text(f"{finding.get('claim', '')} {refs}")
                if finding.get("publication_date"):
                    text(finding["publication_date"], 8)
            else:
                text(finding)
    rows = report.financial.get("ratios_table") or []
    if rows:
        heading("Measured ratios: beginner guide and expert inputs")
        for row in rows:
            text(f"{row['metric']}: {row['reported']}", bold=True)
            text(row.get("meaning", ""))
            text(f"Formula: {row.get('formula')}; inputs: {row.get('inputs')}; evidence: {row.get('evidence_id')}", 8)
    for label, items in (("Bull case", report.bull_case), ("Bear case", report.bear_case),
                         ("Evidence gaps", report.evidence_gaps)):
        heading(label)
        for item in items:
            text(item)
        if not items:
            text("No supported finding available.")
    if report.conflicts:
        heading("Data conflicts")
        for c in report.conflicts:
            text(f"{c['claim']}: {c['value_a']} ({c['source_a']}) versus {c['value_b']} ({c['source_b']}). Unresolved.")
    heading("Agent contributions")
    for note in report.agent_notes:
        text(f"{note['label']}: {note['status']}", bold=True)
        text(note.get("thought"), 9)
    heading("Sources & citations")
    for source in report.sources:
        text(f"[{source['n']}] {source.get('title')}", bold=True)
        text(f"Published: {source.get('publication_date') or 'Not provided'}; retrieved: {source.get('retrieved_at') or 'Not provided'}", 8)
        if source.get("url"):
            # Long RSS URLs need break opportunities in the pure-Python renderer.
            url = source["url"]
            text("\n".join(url[i:i + 90] for i in range(0, len(url), 90)), 8)
    pdf.output(path)
    return path


def render_pdf(report: ReportJSON, job_id: str) -> str:
    directory = Path(settings.reports_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{job_id}.pdf"
    try:
        from weasyprint import HTML
        HTML(string=render_html(report), base_url=str(_TEMPLATES)).write_pdf(str(path))
        return str(path)
    except Exception:
        logger.exception("PDF renderer unavailable; using fpdf2", extra={"job_id": job_id})
        return _render_pdf_fallback(report, str(path))
