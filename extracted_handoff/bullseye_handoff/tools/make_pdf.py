from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether)
from reportlab.graphics.shapes import Drawing, Rect, String, Line

INK = colors.HexColor("#1B2238")
MUTED = colors.HexColor("#5B6478")
ACCENT = colors.HexColor("#3B5BFF")
GOOD = colors.HexColor("#15803D")
BAD = colors.HexColor("#B91C1C")
WATCH = colors.HexColor("#B45309")
LIGHT = colors.HexColor("#F3F5FA")
LINE = colors.HexColor("#D9DEEA")

def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)

h_title = S("t", fontName="Helvetica-Bold", fontSize=22, leading=26)
h1 = S("h1", fontName="Helvetica-Bold", fontSize=14, leading=18, spaceBefore=12, spaceAfter=6, textColor=ACCENT)
body = S("b")
small = S("s", fontSize=8.5, leading=12, textColor=MUTED)
cell = S("c", fontSize=9.5, leading=13)
cellb = S("cb", fontSize=9.5, leading=13, fontName="Helvetica-Bold")
verdict_big = S("v", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=WATCH)

def P(t, st=body): return Paragraph(t, st)

def tag(label):
    col = {"GOOD": GOOD, "WATCH": WATCH, "BAD": BAD}[label]
    return Paragraph(f'<font color="{col.hexval()}"><b>{label}</b></font>', cell)

def tbl(data, widths, header=True):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("GRID", (0, 0), (-1, -1), 0.4, LINE),
          ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    if header:
        st += [("BACKGROUND", (0, 0), (-1, 0), LIGHT)]
    t.setStyle(TableStyle(st))
    return t

def box(text, bg=LIGHT, border=ACCENT):
    t = Table([[Paragraph(text, body)]], colWidths=[174 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, border),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t

def bar_chart(title, rows, maxv, w=174 * mm, unit="%"):
    """rows: (label, company, sector). Horizontal bars, drawn from real numbers."""
    rh = 26
    h = 22 + rh * len(rows) + 14
    d = Drawing(w, h)
    d.add(String(0, h - 12, title, fontName="Helvetica-Bold", fontSize=10, fillColor=INK))
    lab_w = 120
    bw = w - lab_w - 50
    y = h - 22 - rh + 6
    for label, c, s in rows:
        d.add(String(0, y + 8, label, fontName="Helvetica", fontSize=9, fillColor=INK))
        d.add(Rect(lab_w, y + 10, bw * c / maxv, 8, fillColor=ACCENT, strokeColor=None))
        d.add(String(lab_w + bw * c / maxv + 4, y + 10, f"TCS {c}{unit}", fontName="Helvetica-Bold", fontSize=8, fillColor=INK))
        d.add(Rect(lab_w, y, bw * s / maxv, 8, fillColor=colors.HexColor("#A9B2C6"), strokeColor=None))
        d.add(String(lab_w + bw * s / maxv + 4, y, f"Typical IT firm {s}{unit}", fontName="Helvetica", fontSize=8, fillColor=MUTED))
        y -= rh
    return d

def quarter_chart(w=174 * mm):
    qs = [("Q4 FY25", 64479, 12224), ("Q1 FY26", 63437, 12760), ("Q3 FY26", 67087, 10657),
          ("Q4 FY26", 70698, 13718), ("Q1 FY27", 72275, 13349)]
    h = 150
    d = Drawing(w, h)
    d.add(String(0, h - 12, "Revenue and profit by quarter (INR crore, from the sample report)", fontName="Helvetica-Bold", fontSize=10, fillColor=INK))
    base = 22
    top = h - 30
    mx = 75000
    slot = w / len(qs)
    for i, (q, rev, pat) in enumerate(qs):
        x = i * slot + 14
        rh = (top - base) * rev / mx
        ph = (top - base) * pat / mx
        d.add(Rect(x, base, 26, rh, fillColor=ACCENT, strokeColor=None))
        d.add(Rect(x + 30, base, 26, ph, fillColor=GOOD, strokeColor=None))
        d.add(String(x + 13, base + rh + 3, f"{rev/1000:.1f}k", fontName="Helvetica", fontSize=7.5, fillColor=INK, textAnchor="middle"))
        d.add(String(x + 43, base + ph + 3, f"{pat/1000:.1f}k", fontName="Helvetica", fontSize=7.5, fillColor=INK, textAnchor="middle"))
        d.add(String(x + 28, 8, q, fontName="Helvetica", fontSize=8, fillColor=MUTED, textAnchor="middle"))
    d.add(Line(0, base, w, base, strokeColor=LINE))
    d.add(Rect(w - 150, h - 14, 8, 8, fillColor=ACCENT, strokeColor=None))
    d.add(String(w - 138, h - 13, "Sales", fontName="Helvetica", fontSize=8, fillColor=MUTED))
    d.add(Rect(w - 100, h - 14, 8, 8, fillColor=GOOD, strokeColor=None))
    d.add(String(w - 88, h - 13, "Profit", fontName="Helvetica", fontSize=8, fillColor=MUTED))
    return d

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Bulls Eye + RKI | SAMPLE plain-wording report using the TCS data from the shared test report | Not investment advice")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate("05_SAMPLE_BEGINNER_REPORT_TCS.pdf", pagesize=A4,
                        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title="Bulls Eye - TCS in Plain Words (sample)", author="Bulls Eye")
st = []

# ---------- PAGE 1 ----------
st += [P("Bulls Eye", S("br", fontName="Helvetica-Bold", fontSize=10, textColor=ACCENT)),
       P("Tata Consultancy Services (TCS) in plain words", h_title),
       P("Your question: <i>Analyze TCS fundamentals</i> &nbsp;|&nbsp; Share price used: INR 2,075 (3 Oct 2026) &nbsp;|&nbsp; Sample layout, data copied from the earlier test report", small),
       Spacer(1, 8)]

st.append(tbl([[P("<b>Our answer</b>", small), P("<b>Confidence</b>", small), P("<b>Best for</b>", small)],
               [P("HOLD (if you already own it)", verdict_big), P("Medium", S("m", fontName="Helvetica-Bold", fontSize=14, leading=18)),
                P("Someone who can wait 3-5 years", cellb)]],
              [90 * mm, 34 * mm, 50 * mm]))
st.append(Spacer(1, 8))
st.append(box("<b>In one sentence:</b> TCS is a very profitable company with almost no debt, but its share price has fallen about 25% in a year because investors worry about weaker IT spending, AI changing how IT work is billed, and a dispute inside the Tata group. "
              "So the research does not clearly support buying a lot more, and it does not support selling in a panic either."))
st.append(Spacer(1, 8))

st.append(P("The 5 numbers that matter most", h1))
st.append(tbl([
    [P("<b>What</b>", cell), P("<b>TCS</b>", cell), P("<b>What it means</b>", cell), P("<b>Verdict</b>", cell)],
    [P("Operating margin", cell), P("24.0%", cellb), P("Out of every Rs 100 of sales, Rs 24 is left after running costs. A typical IT firm keeps about Rs 18.*", cell), tag("GOOD")],
    [P("Return on equity (ROE)", cell), P("47.7%", cellb), P("For every Rs 100 shareholders put in, TCS earns about Rs 48 a year. Above 20% is strong.", cell), tag("GOOD")],
    [P("Debt / equity", cell), P("0.10x", cellb), P("Very little borrowing. A bad year is unlikely to put TCS in money trouble.", cell), tag("GOOD")],
    [P("P/E (price to earnings)", cell), P("15.1x", cellb), P("You pay about Rs 15 for every Rs 1 of yearly profit. This is lower than TCS has often traded at, but cheap prices can also mean the market expects slower growth.", cell), tag("WATCH")],
    [P("Share price, 1 year", cell), P("-25.5%", cellb), P("Price is near the bottom of its 1-year range (INR 1,972 to 3,204). Falling prices can keep falling or recover; this number does not predict which.", cell), tag("BAD")],
], [38 * mm, 20 * mm, 96 * mm, 20 * mm]))
st.append(P("* Sector comparison values (25% ROE, 18% margin) were shown in the test report without a stated source. Treat them as rough, until the system computes them from real peers.", small))

# ---------- PAGE 2 ----------
st.append(PageBreak())
st.append(P("Is the business healthy?", h1))
st.append(P("Yes. In the latest quarter (April-June 2026) TCS sold INR 72,275 crore worth of services and earned INR 13,349 crore profit. "
            "Sales grew about 13.9% compared with the same quarter last year (72,275 vs 63,437 crore). Profit grew about 4.6% (13,349 vs 12,760 crore), so sales are growing faster than profit."))
st.append(Spacer(1, 4))
st.append(quarter_chart())
st.append(P("Quarter-wise numbers are taken from the earlier report. The Q2 FY26 quarter was not in that report so it is skipped here. "
            "Note: the earlier report printed 12.1% sales growth, but its own table gives 13.9%. This sample uses the table figure; the app should recompute it with code and show the inputs.", small))
st.append(Spacer(1, 6))
st.append(bar_chart("How TCS compares (rough sector values, unsourced in test report)",
                    [("Return on equity", 47.7, 25.0), ("Operating margin", 24.0, 18.0), ("Net profit margin", 18.1, 14.0)], 55))

st.append(P("Why people are cautious (the Bear case)", h1))
for t in ["<b>Governance worry:</b> a dispute inside Tata Sons (the group that controls TCS) has hurt the share price.",
          "<b>Weak IT spending:</b> big clients in the US and Europe are careful about new projects.",
          "<b>AI effect:</b> AI can do some work faster, so clients may pay less for hours worked, which could squeeze future sales and margins.",
          "<b>Analyst downgrade:</b> one source cut its rating to Sell, citing valuation and performance. (Another listed Hold.)",
          "<b>Price is above book value:</b> P/B of 6.85x is high, but normal for service firms that own few physical assets."]:
    st.append(P("- " + t))

st.append(P("Why others stay positive (the Bull case)", h1))
for t in ["<b>Deals keep coming:</b> TCS reported about $9.5 billion of new deals signed in Q1 FY27. (Signed deals turn into sales only over time.)",
          "<b>Strong balance sheet:</b> almost no debt and a regular dividend (yield about 3.1%).",
          "<b>AI work:</b> TCS is winning AI-related projects and reportedly buying an AI hub in India.",
          "<b>Lower price than before:</b> at 15x profit, expectations are lower than they used to be."]:
    st.append(P("- " + t))

# ---------- PAGE 3 ----------
st.append(PageBreak())
st.append(P("What would the share be worth at different 'mood' levels?", h1))
st.append(P("This is not a forecast. It simply answers: <i>if yearly profit per share stays the same (INR 137.64), what would the price be if investors were more gloomy or more excited?</i>"))
st.append(Spacer(1, 4))
st.append(tbl([
    [P("<b>Investor mood</b>", cell), P("<b>P/E used</b>", cell), P("<b>Price</b>", cell)],
    [P("Gloomy", cell), P("12.4x", cell), P("INR 1,707", cellb)],
    [P("Today", cell), P("15.1x", cell), P("INR 2,075", cellb)],
    [P("More positive", cell), P("17.3x", cell), P("INR 2,381", cellb)],
    [P("Very positive (past high)", cell), P("19.6x", cell), P("INR 2,698", cellb)],
], [80 * mm, 40 * mm, 54 * mm]))
st.append(P("Prices are profit per share x P/E (small rounding differences from the earlier report).", small))

st.append(P("So should I buy, hold or sell?", h1))
st.append(tbl([
    [P("<b>Situation</b>", cell), P("<b>Simple guidance</b>", cell)],
    [P("I already own TCS and can wait 3-5 years", cell), P("<font color='#15803D'><b>Hold</b></font> is reasonable.", cell)],
    [P("TCS is a very big part of my money, or I need cash within 1-2 years", cell), P("<font color='#B45309'><b>Consider reducing</b></font> some, rather than selling everything.", cell)],
    [P("I want to buy a large amount now", cell), P("<font color='#B45309'><b>Go slowly.</b></font> Waiting for sales growth to improve is a safer plan than putting everything in at once.", cell)],
    [P("Sales stop growing for several quarters, margins fall below about 22%, or debt rises", cell), P("<font color='#B91C1C'><b>Re-think.</b></font> The reasons for holding would be weaker.", cell)],
], [78 * mm, 96 * mm]))

st.append(P("What to check every 3 months", h1))
for t in ["Is sales growth staying above about 4% in constant currency (or better)?",
          "Is operating margin staying in the 24-26% range?",
          "Are signed deals turning into actual sales?",
          "Is the Tata Sons dispute getting resolved or worse?"]:
    st.append(P("- " + t))

st.append(P("What we could not confirm (honest gaps)", h1))
for t in ["Cash-flow quality (how much profit becomes real cash) was not fetched, so we make no claim on it.",
          "News was read from headlines only, not full articles, so treat news points as 'reported', not 'proven'.",
          "Peer and sector comparison numbers are rough. The earlier test report did not show a source.",
          "Different sources disagreed on P/E (15.08x vs 14.79x) and dividend yield (3.13% vs 5.4%). We use 15.08x and 3.13% from the price and company data pulled directly; the app should show this conflict clearly."]:
    st.append(P("- " + t))
st.append(Spacer(1, 6))
st.append(box("<b>Important:</b> This is a research summary for learning, not personal financial advice. We do not know your purchase price, tax situation or when you need the money. Past prices do not predict future prices.", bg=colors.HexColor("#FFF7ED"), border=WATCH))

doc.build(st, onFirstPage=footer, onLaterPages=footer)
print("built")
