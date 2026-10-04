"""Export original Bullseye SVGs to PNG/ICO using existing PDF dependencies."""
import base64
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf
from PIL import Image
from weasyprint import HTML

BRAND = Path(__file__).resolve().parents[1] / "frontend" / "public" / "brand"


def rasterize(source, destination, width):
    svg = source.read_bytes()
    _, _, w, h = map(float, ET.fromstring(svg).attrib["viewBox"].split())
    data = base64.b64encode(svg).decode("ascii")
    html = f'<style>@page{{size:{w}px {h}px;margin:0}}body{{margin:0}}img{{width:{w}px;height:{h}px}}</style><img src="data:image/svg+xml;base64,{data}">'
    with pymupdf.open(stream=HTML(string=html).write_pdf(), filetype="pdf") as document:
        scale = width / document[0].rect.width
        document[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True).save(destination)


if __name__ == "__main__":
    for size in (16, 32, 180, 512):
        rasterize(BRAND / "favicon.svg", BRAND / f"favicon-{size}.png", size)
    Image.open(BRAND / "favicon-512.png").save(BRAND / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    rasterize(BRAND / "logo-mark.svg", BRAND / "logo-mark.png", 512)
    rasterize(BRAND / "logo-dark.svg", BRAND / "logo-dark.png", 920)
    rasterize(BRAND / "social-card.svg", BRAND / "social-card.png", 1200)
    print("Exported Bullseye logos, sharing image, 16/32/180/512 PNGs and multi-size ICO.")
