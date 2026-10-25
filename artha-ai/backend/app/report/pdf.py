"""Deterministic PDF rendering; all prose and measurements come from ReportJSON."""
import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import settings
from ..schemas.models import ReportJSON

logger = logging.getLogger("bullseye.report")
_TEMPLATES = Path(__file__).parent / "templates"


import base64

def _file_to_base64_uri(path: Path) -> str:
    if not path.exists():
        return ""
    suffix = path.suffix.lower().lstrip(".")
    mime = "image/svg+xml" if suffix == "svg" else f"image/{suffix}"
    try:
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{data}"
    except Exception:
        return ""


import re
from markupsafe import Markup, escape


def bold_synthesis_headings(text: str) -> Markup:
    if not text:
        return Markup("")
    cleaned_text = re.sub(r"\.{2,}", ".", str(text))
    lines = cleaned_text.strip().split("\n")
    out = []
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        is_bullet = line.startswith(("•", "*", "-"))
        content = line.lstrip("•*- ").strip() if is_bullet else line
        escaped = str(escape(content))

        # 1. Bold primary lead-in heading (and optional secondary directive right after it) at the start of the line
        escaped = re.sub(
            r"^([A-Z][A-Za-z0-9\s/&()\-–—+“”\"',]{2,75}?):\s*([A-Z][A-Za-z0-9\s/&()\-–—+]{2,55}:)?",
            lambda m: (
                f'<strong style="color: #0f172a; font-weight: 800;">{m.group(1)}:</strong>'
                + (f' <strong style="color: #1e3a8a; font-weight: 700;">{m.group(2)}</strong>' if m.group(2) else ' ')
            ),
            escaped,
            count=1,
        )

        # 2. Bold inline sub-headings within the paragraph (e.g., NEXT 6–12 MONTHS:, Business Strengths:, Watchpoints:, Sell only if:)
        escaped = re.sub(
            r"(?<!>)\b(NEXT\s+\d+[–\-]\d+\s+MONTHS|LONG-TERM\s*\([^)]+\)|SHORT-TO-MEDIUM\s+TERM|Business Strengths|Watchpoints|Sell only if):",
            r'<strong style="color: #0f172a; font-weight: 700;">\1:</strong>',
            escaped,
        )

        if is_bullet:
            out.append(
                f'<p class="synthesis-bullet" style="margin: 0 0 3px 0;"><strong style="color: #0f172a; font-weight: 800;">•</strong> {escaped}</p>'
            )
        else:
            out.append(f'<p style="margin: 0 0 3px 0;">{escaped}</p>')
    return Markup("\n".join(out))


def bold_inline_directive(text: str) -> Markup:
    if not text:
        return Markup("")
    cleaned = re.sub(r"^EXACT RULES FOR WHEN TO SELL:\s*", "", str(text).strip())
    escaped = str(escape(cleaned))
    escaped = re.sub(
        r"^([A-Z][A-Za-z0-9\s/&()\-–—+]{2,55}?):",
        r'<strong style="color: #0f172a; font-weight: 800;">\1:</strong>',
        escaped,
        count=1,
    )
    return Markup(escaped)


def render_html(report: ReportJSON, charts=None) -> str:
    env = Environment(loader=FileSystemLoader(str(_TEMPLATES)), autoescape=select_autoescape(["html", "j2"]))
    env.filters["bold_headings"] = bold_synthesis_headings
    env.filters["bold_directive"] = bold_inline_directive
    name = "news_report.html.j2" if report.overall_assessment.get("report_type") == "news" else "report.html.j2"
    internal_brand = Path(__file__).parent / "brand"
    external_brand = Path(__file__).resolve().parents[3] / "frontend/public/brand"
    brand_dir = internal_brand if internal_brand.exists() else external_brand
    logo_uri = _file_to_base64_uri(brand_dir / "logo-dark.png") or _file_to_base64_uri(brand_dir / "logo-dark.svg")
    bull_uri = _file_to_base64_uri(brand_dir / "bull.png")
    bear_uri = _file_to_base64_uri(brand_dir / "bear.png")
    duo_uri = _file_to_base64_uri(brand_dir / "bull-bear-duo.png")
    wordmark_uri = _file_to_base64_uri(brand_dir / "arthaai-wordmark.png")
    mark_uri = _file_to_base64_uri(brand_dir / "logo-mark.png") or logo_uri
    return env.get_template(name).render(
        report=report.model_dump(),
        charts=charts or {},
        logo_uri=logo_uri,
        mark_uri=mark_uri,
        bull_uri=bull_uri,
        bear_uri=bear_uri,
        duo_uri=duo_uri,
        wordmark_uri=wordmark_uri,
    )


def _safe(value):
    return str(value or "").replace("—", "-").replace("–", "-").replace("₹", "INR ").encode("latin-1", "replace").decode("latin-1")


def _render_pdf_fallback(report: ReportJSON, path: str) -> str:
    from fpdf import FPDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    internal_logo = Path(__file__).parent / "brand" / "logo-mark.png"
    external_logo = Path(__file__).resolve().parents[3] / "frontend/public/brand/logo-mark.png"
    logo = internal_logo if internal_logo.exists() else external_logo
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
            tag = f" [{row.get('verdict_tag', 'WATCH')}]" if row.get('verdict_tag') else ""
            text(f"{row['metric']}: {row['reported']}{tag}", bold=True)
            text(row.get("meaning", ""))
            text(f"Formula: {row.get('formula')}; inputs: {row.get('inputs')}; evidence: {row.get('evidence_id')}", 8)
    q_rows = report.financial.get("quarterly_table") or []
    if q_rows:
        heading("Recent quarterly financial performance (Filings trend)")
        for q in q_rows:
            text(f"{q['period']}: Revenue {q['revenue']} | PAT {q['net_profit']} | {q['yoy_growth']}", 9)
    if report.valuation_scenarios:
        heading("Valuation sensitivity (Scenario matrix)")
        for sc in report.valuation_scenarios:
            text(f"{sc['multiple']} -> {sc['implied_price']}: {sc['description']}", 9)
    if report.decision_framework and report.decision_framework.get("hold_when"):
        df = report.decision_framework
        heading("Situational guidance: Should you buy, hold or sell?")
        if df.get("base_stance"):
            text(df["base_stance"], 9, bold=True)
        text("Hold when:", 9, bold=True)
        for h in df.get("hold_when", []):
            text(f"- {h}", 9)
        text("Reduce when:", 9, bold=True)
        for r in df.get("reduce_when", []):
            text(f"- {r}", 9)
        text("Sell when:", 9, bold=True)
        for s in df.get("sell_when", []):
            text(f"- {s}", 9)
    if report.monitoring_indicators:
        heading("What to check every 3 months (Quarterly watchlist)")
        for m in report.monitoring_indicators:
            text(f"{m['indicator']}: (+) {m['support_thesis']} | (-) {m['weaken_thesis']}", 8)
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


_CACHED_BROWSER = None

def _find_chromium_browser() -> str | None:
    global _CACHED_BROWSER
    if _CACHED_BROWSER is not None:
        return _CACHED_BROWSER

    import shutil
    import os
    candidates = [
        os.environ.get("CHROME_PATH"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        os.environ.get("EDGE_PATH"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for c in candidates:
        if c and Path(c).is_file():
            _CACHED_BROWSER = str(c)
            return _CACHED_BROWSER
    for name in ("chrome.exe", "chrome", "google-chrome", "msedge.exe", "msedge", "chromium"):
        p = shutil.which(name)
        if p:
            _CACHED_BROWSER = p
            return _CACHED_BROWSER
    _CACHED_BROWSER = None
    return None


def _render_pdf_browser(html_content: str, output_path: Path, browser_exe: str) -> bool:
    import subprocess
    import tempfile
    temp_html = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".html", encoding="utf-8", delete=False) as f:
            f.write(html_content)
            temp_html = Path(f.name)
        cmd = [
            browser_exe,
            "--headless",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-software-rasterizer",
            "--disable-extensions",
            "--no-pdf-header-footer",
            f"--print-to-pdf={output_path.resolve()}",
            temp_html.resolve().as_uri(),
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return output_path.exists() and output_path.stat().st_size > 5000
    except Exception as e:
        logger.warning("Browser PDF generation failed: %s", e)
        return False
    finally:
        if temp_html:
            try:
                temp_html.unlink(missing_ok=True)
            except Exception:
                pass


def render_pdf(report: ReportJSON, job_id: str) -> str:
    directory = Path(settings.reports_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{job_id}.pdf"

    charts = {}
    try:
        from .charts import generate_report_charts
        charts_dir = directory / "charts"
        charts_raw = generate_report_charts(report.model_dump(), str(charts_dir))
        charts = {k: _file_to_base64_uri(Path(v)) for k, v in charts_raw.items()}
    except Exception as exc:
        logger.warning("Failed to generate report charts: %s", exc)

    html_content = render_html(report, charts=charts)

    # 1. On Linux / Cloud Run containers with Pango/Cairo, WeasyPrint is native & ultra-fast (~1s)
    import sys
    if sys.platform != "win32":
        try:
            from weasyprint import HTML
            HTML(string=html_content, base_url=str(_TEMPLATES)).write_pdf(str(path))
            if path.exists() and path.stat().st_size > 5000:
                logger.info("Rendered publication-grade PDF using WeasyPrint for %s", job_id)
                return str(path)
        except Exception as exc:
            logger.info("WeasyPrint renderer unavailable (%s)", exc)

    # 2. Try headless Chromium / Chrome / Edge
    browser = _find_chromium_browser()
    if browser:
        if _render_pdf_browser(html_content, path, browser):
            logger.info("Rendered publication-grade PDF using %s for %s", browser, job_id)
            return str(path)

    # 3. Pure-python fallback (fpdf2) if neither WeasyPrint nor Chromium is available
    logger.warning("Browser PDF engine unavailable; using fpdf2 fallback", extra={"job_id": job_id})
    return _render_pdf_fallback(report, str(path))
