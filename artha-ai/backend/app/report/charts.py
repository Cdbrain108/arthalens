"""Dynamic chart generation for research reports.

Generates high-resolution, publication-quality financial and catalyst charts
using matplotlib for embedding into PDF and HTML reports.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

import matplotlib
matplotlib.use("Agg")  # Non-interactive headless backend
import matplotlib.pyplot as plt

logger = logging.getLogger("bullseye.charts")

NAVY_PRIMARY = "#0F172A"
SLATE_DARK = "#1E293B"
SLATE_LIGHT = "#F1F5F9"
EMERALD_GREEN = "#10B981"
ROSE_RED = "#EF4444"
AMBER_GOLD = "#F59E0B"
INDIGO_ACCENT = "#6366F1"
TEXT_MUTED = "#64748B"


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _extract_metric(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1).replace(",", ""))
        except (ValueError, TypeError):
            return None
    return None


def generate_report_charts(report_data: dict, output_dir: str) -> dict[str, str]:
    """Generate visual charts from report data and return dict of {chart_id: filepath}."""
    _ensure_dir(output_dir)
    chart_paths = {}

    try:
        scorecard_path = _generate_bull_bear_chart(report_data, output_dir)
        if scorecard_path:
            chart_paths["scorecard"] = scorecard_path
    except Exception as exc:
        logger.warning("Failed to generate bull/bear scorecard chart: %s", exc)

    try:
        fin_path = _generate_financial_metrics_chart(report_data, output_dir)
        if fin_path:
            chart_paths["financial_metrics"] = fin_path
    except Exception as exc:
        logger.warning("Failed to generate financial metrics chart: %s", exc)

    return chart_paths


def _generate_bull_bear_chart(report_data: dict, output_dir: str) -> str:
    """Horizontal bar comparison of Bull vs Bear evidence count & key catalysts."""
    bull_items = report_data.get("bull_case") or []
    bear_items = report_data.get("bear_case") or []
    risks = (report_data.get("risk") or {}).get("findings") or []

    # Counts are evidence, not decoration: they used to be floored at 1, so a
    # report with no bull case still drew a bar reading "1 Factors Identified".
    n_bull = len(bull_items)
    n_bear = len(bear_items) + (1 if risks else 0)
    if not n_bull and not n_bear:
        return ""

    fig, ax = plt.subplots(figsize=(7.2, 2.0), dpi=220)
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#F8FAFC")

    categories = ["Bull Catalysts", "Downside Risks / Bear Factors"]
    counts = [n_bull, n_bear]
    colors = [EMERALD_GREEN, ROSE_RED]

    y_pos = [1, 0]
    bars = ax.barh(y_pos, counts, height=0.45, color=colors, edgecolor="none", zorder=3)

    ax.set_yticks(y_pos)
    ax.set_yticklabels(categories, fontsize=9.5, fontweight="bold", color=SLATE_DARK)
    ax.set_xlim(0, max(counts) + 2)
    ax.set_xlabel("Number of Verified Thematic Points", fontsize=8.5, color=TEXT_MUTED)

    ax.grid(axis="x", linestyle="--", alpha=0.5, color="#CBD5E1", zorder=0)
    for spine in ["top", "right", "left", "bottom"]:
        ax.spines[spine].set_visible(False)

    for bar, count in zip(bars, counts):
        width = bar.get_width()
        label = f"{int(count)} Factor{'' if count == 1 else 's'} Identified"
        ax.text(width + 0.15, bar.get_y() + bar.get_height() / 2, label,
                va="center", ha="left", fontsize=9, fontweight="bold", color=SLATE_DARK)

    plt.title("Adversarial Thematic Balance (Bull vs Bear Drivers)",
              fontsize=10.5, fontweight="bold", color=NAVY_PRIMARY, pad=10, loc="left")

    plt.tight_layout()
    out_file = os.path.join(output_dir, "thematic_balance.png")
    plt.savefig(out_file, bbox_inches="tight", dpi=220)
    plt.close(fig)
    return out_file


def _generate_financial_metrics_chart(report_data: dict, output_dir: str) -> str:
    """Multi-metric bar chart showing Operating Margin, ROE, and Growth indicators."""
    all_findings_text = " ".join(
        str(f) for sec in ("financial", "valuation", "market")
        for f in (report_data.get(sec) or {}).get("findings", [])
    )
    summary_text = (report_data.get("financial") or {}).get("summary", "")
    full_text = f"{all_findings_text} {summary_text}"

    # Read from metrics or ratios_table first
    fin_sec = report_data.get("financial") or {}
    metrics_dict = fin_sec.get("metrics") or {}
    ratios_list = fin_sec.get("ratios_table") or []
    
    roe_val = metrics_dict.get("roe_pct")
    opm_val = metrics_dict.get("opm_pct")
    npm_val = metrics_dict.get("npm_pct")

    for row in ratios_list:
        m_name = str(row.get("metric", "")).lower()
        v_str = str(row.get("value", ""))
        # A margin can legitimately be negative; dropping the sign turned a
        # loss-making quarter into a profitable-looking bar.
        num_m = re.search(r"([-+]?\d+(?:\.\d+)?)", v_str)
        if num_m:
            val = float(num_m.group(1))
            # `is None`, not falsiness: a measured 0.0% is a real reading.
            if "roe" in m_name and roe_val is None:
                roe_val = val
            elif "operating margin" in m_name and opm_val is None:
                opm_val = val
            elif "net profit margin" in m_name and npm_val is None:
                npm_val = val

    def _parse_num(v, default=None):
        if v is None:
            return default
        if isinstance(v, (int, float)):
            return float(v)
        m = re.search(r"([-+]?\d+(?:\.\d+)?)", str(v))
        return float(m.group(1)) if m else default

    roe = _parse_num(roe_val, _extract_metric(full_text, r"ROE\s*(?:of|is|at|:)?\s*([-+]?\d+(?:\.\d+)?)"))
    op_margin = _parse_num(opm_val, _extract_metric(full_text, r"(?:operating\s+margin|OPM)\s*(?:of|is|at|:)?\s*([-+]?\d+(?:\.\d+)?)"))
    net_margin = _parse_num(npm_val, _extract_metric(full_text, r"(?:net\s+margin|profit\s+margin)\s*(?:of|is|at|:)?\s*([-+]?\d+(?:\.\d+)?)"))

    # Only measured metrics are plotted. The bars are labelled "Company Reported",
    # so a metric with no validated value is dropped rather than back-filled with a
    # plausible-looking constant.
    measured = [(name, value, benchmark) for name, value, benchmark in (
        ("Return on Equity (ROE)", roe, 25.0),
        ("Operating Margin (OPM)", op_margin, 18.0),
        ("Net Profit Margin", net_margin, 14.0),
    ) if value is not None]
    if not measured:
        return ""

    metrics = [name for name, _, _ in measured]
    values = [value for _, value, _ in measured]
    benchmarks = [benchmark for _, _, benchmark in measured]

    fig, ax = plt.subplots(figsize=(7.2, max(1.1, 0.77 * len(measured))), dpi=220)
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#F8FAFC")

    y = list(range(len(metrics)))
    height = 0.32

    b1 = ax.barh([p + height / 2 for p in y], values, height=height,
                 color=INDIGO_ACCENT, label="Company Reported", zorder=3)
    b2 = ax.barh([p - height / 2 for p in y], benchmarks, height=height,
                 color="#94A3B8", label="Sector Benchmark", zorder=3)

    ax.set_yticks(y)
    ax.set_yticklabels(metrics, fontsize=9, fontweight="bold", color=SLATE_DARK)
    ax.set_xlabel("Percentage (%)", fontsize=8.5, color=TEXT_MUTED)
    # Keep a negative margin inside the axes instead of clipping it off at zero.
    ax.set_xlim(min(0.0, min(values) * 1.25),
                max(max(values), max(benchmarks)) * 1.25)

    ax.grid(axis="x", linestyle="--", alpha=0.5, color="#CBD5E1", zorder=0)
    for spine in ["top", "right", "left", "bottom"]:
        ax.spines[spine].set_visible(False)

    for bar, val in zip(b1, values):
        ax.text(val + 0.8, bar.get_y() + bar.get_height() / 2, f"{val:.1f}%",
                va="center", ha="left", fontsize=8.5, fontweight="bold", color=INDIGO_ACCENT)

    for bar, val in zip(b2, benchmarks):
        ax.text(val + 0.8, bar.get_y() + bar.get_height() / 2, f"{val:.1f}%",
                va="center", ha="left", fontsize=8, color=TEXT_MUTED)

    ax.legend(loc="lower right", frameon=True, facecolor="#FFFFFF", edgecolor="#E2E8F0",
              fontsize=8)
    plt.title("Key Quality & Profitability Multiples vs Sector Median",
              fontsize=10.5, fontweight="bold", color=NAVY_PRIMARY, pad=10, loc="left")

    plt.tight_layout()
    out_file = os.path.join(output_dir, "financial_metrics.png")
    plt.savefig(out_file, bbox_inches="tight", dpi=220)
    plt.close(fig)
    return out_file
