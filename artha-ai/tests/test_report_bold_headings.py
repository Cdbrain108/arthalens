"""The PDF synthesis block must keep the lead-in headings bold without eating
the space between the heading and its explanation."""

from app.report.pdf import bold_inline_directive, bold_synthesis_headings


def test_synthesis_headings_are_bold_and_keep_spacing():
    html = str(
        bold_synthesis_headings(
            "Plain English Executive Summary: Reliance is a hold.\n"
            "• WHAT EXISTING SHAREHOLDERS SHOULD DO: Keep holding.\n"
            "• WHAT TO WATCH (STRENGTHS VS RISKS): Business Strengths: Strong margins. "
            "Watchpoints: Sector swings."
        )
    )

    assert "<strong" in html
    assert "Plain English Executive Summary:</strong> Reliance" in html
    assert "WHAT EXISTING SHAREHOLDERS SHOULD DO:</strong> Keep" in html
    assert "Business Strengths:</strong> Strong" in html
    assert "Watchpoints:</strong> Sector" in html
    # No accidental "Heading:Text" concatenation and no double space after bold lead-ins.
    assert ":</strong>Reliance" not in html
    assert "</strong>  Strong" not in html


def test_inline_directive_headings_are_bold():
    html = str(bold_inline_directive("KEEP HOLDING (Do Not Panic Sell): Keep your shares."))

    assert "KEEP HOLDING (Do Not Panic Sell):</strong> Keep your shares." in html
