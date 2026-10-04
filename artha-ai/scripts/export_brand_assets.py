"""Export the SVG brand family using the project's PDF rendering dependencies.

Run from any directory: python /path/to/artha-ai/scripts/export_brand_assets.py
"""
import base64
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf
from weasyprint import HTML


ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "frontend" / "public" / "brand"
ET.register_namespace("", "http://www.w3.org/2000/svg")


def rasterize(source: Path, destination: Path, width: int) -> None:
    svg = source.read_bytes()
    root = ET.fromstring(svg)
    _, _, w, h = map(float, root.attrib["viewBox"].split())
    # WeasyPrint handles SVG gradient strokes and font fallback consistently
    # with the report renderer; MuPDF then rasterizes its vector PDF output.
    data = base64.b64encode(svg).decode("ascii")
    html = f'''<style>@page {{ size: {w}px {h}px; margin: 0; }}
      html, body {{ margin: 0; padding: 0; }}
      img {{ display: block; width: {w}px; height: {h}px; }}</style>
      <img src="data:image/svg+xml;base64,{data}">'''
    with pymupdf.open(stream=HTML(string=html).write_pdf(), filetype="pdf") as document:
        page = document[0]
        scale = width / page.rect.width
        page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True).save(destination)


def embed(filename: str, x: int, y: int, width: int, instance: str) -> str:
    """Inline local SVGs so the board has no linked image/font dependencies."""
    root = ET.fromstring((BRAND / filename).read_text(encoding="utf-8"))
    _, _, original_width, original_height = map(float, root.attrib["viewBox"].split())
    # Each embedded asset's IDs must be distinct, including gradient references.
    for node in root.iter():
        for key, value in list(node.attrib.items()):
            if key == "id":
                node.set(key, f"{instance}-{value}")
            elif key == "aria-labelledby":
                node.set(key, " ".join(f"{instance}-{item}" for item in value.split()))
            elif "url(#" in value:
                node.set(key, value.replace("url(#", f"url(#{instance}-"))
    # Flatten the nested viewport into a transformed group for broad renderer
    # support while keeping every path vector-based and independently editable.
    root.tag = "{http://www.w3.org/2000/svg}g"
    root.attrib.clear()
    root.set("transform", f"translate({x} {y}) scale({width / original_width})")
    root.set("fill", "none")
    return ET.tostring(root, encoding="unicode")


def presentation() -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840">
  <rect width="1200" height="840" fill="#090F19"/>
  <g font-family="DejaVu Sans, Arial, sans-serif">
    <text x="56" y="54" fill="#99AEC5" font-size="13" letter-spacing="2">ARTHAAI / BULLS EYE</text>
    <text x="1144" y="54" text-anchor="end" fill="#45E0C0" font-size="11" letter-spacing="2">SIGNAL APERTURE</text>
    <path d="M56 80h1088" stroke="#26374E"/>
    <rect x="56" y="116" width="354" height="354" rx="36" fill="#0D1726" stroke="#26374E"/>
    {embed('arthaai-mark.svg', 121, 181, 224, 'hero')}
    {embed('arthaai-wordmark.svg', 454, 154, 630, 'wordmark')}
    <text x="473" y="362" fill="#EDF5FF" font-size="24">Research beyond the noise.</text>
    <text x="473" y="401" fill="#99AEC5" font-size="14">An open target. An ascending A. A focused insight.</text>
    <text x="473" y="427" fill="#99AEC5" font-size="14">Built for the evidence-first research workspace.</text>
    <rect x="56" y="514" width="350" height="208" rx="18" fill="#101B2C" stroke="#26374E"/>
    <rect x="425" y="514" width="350" height="208" rx="18" fill="#F1F5F9"/>
    <rect x="794" y="514" width="350" height="208" rx="18" fill="#DDE6F0"/>
    {embed('arthaai-mark.svg', 179, 552, 104, 'dark')}
    {embed('arthaai-mark-light.svg', 548, 552, 104, 'light')}
    {embed('arthaai-mark-mono.svg', 917, 552, 104, 'mono')}
    <text x="231" y="698" text-anchor="middle" fill="#99AEC5" font-size="10" letter-spacing="2">DARK INTERFACE</text>
    <text x="600" y="698" text-anchor="middle" fill="#51647C" font-size="10" letter-spacing="2">LIGHT / PRINT</text>
    <text x="969" y="698" text-anchor="middle" fill="#51647C" font-size="10" letter-spacing="2">SINGLE COLOUR</text>
    <circle cx="65" cy="778" r="8" fill="#5B8CFF"/><text x="83" y="782" fill="#99AEC5" font-size="11">SIGNAL BLUE</text>
    <circle cx="227" cy="778" r="8" fill="#45E0C0"/><text x="245" y="782" fill="#99AEC5" font-size="11">INSIGHT MINT</text>
    <circle cx="397" cy="778" r="8" fill="#EDF5FF"/><text x="415" y="782" fill="#99AEC5" font-size="11">ICE</text>
    <text x="1144" y="782" text-anchor="end" fill="#99AEC5" font-size="11">Custom vector identity / SVG + PNG</text>
  </g>
</svg>'''


def main() -> None:
    if not BRAND.is_dir():
        raise SystemExit(f"Brand source directory does not exist: {BRAND}")
    for source in sorted(BRAND.glob("arthaai-*.svg")):
        width = 2240 if "wordmark" in source.stem else 1024
        rasterize(source, source.with_suffix(".png"), width)
        print(f"Exported {source.stem}.png")
    rasterize(BRAND / "favicon.svg", BRAND / "app-icon.png", 512)
    rasterize(BRAND / "favicon.svg", BRAND / "apple-touch-icon.png", 180)
    board = BRAND / "brand-preview.svg"
    board.write_text(presentation(), encoding="utf-8")
    rasterize(board, board.with_suffix(".png"), 1600)
    print("Exported app icons and brand-preview.svg / .png")


if __name__ == "__main__":
    main()
