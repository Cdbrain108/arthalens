# Signal Aperture — ArthaAI / Bulls Eye

Custom vector identity for the equity research workspace.

## Concept

- **Open target:** focused research and the Bulls Eye name.
- **Angular A:** the ArthaAI initial, drawn as an ascending peak.
- **Northeast diamond:** a distinct insight emerging from the research.
- **Mint crossbar:** visually connects the letter to the signal accent.

The master symbol is hand-authored SVG geometry, without stock icons, external
images, fonts, scripts, filters, or animation. The editable wordmark uses Inter
with DejaVu Sans / Arial fallbacks. Prefer the PNG wordmark when exact typography
must remain fixed on a machine without those fonts.

## Files

| Asset | Intended surface |
| --- | --- |
| `arthaai-mark.svg` | Dark UI / navy backgrounds, transparent |
| `arthaai-mark-light.svg` | White paper / light backgrounds, transparent |
| `arthaai-mark-mono.svg` | Single-colour ink applications |
| `arthaai-mark-white.svg` | Reversed white applications |
| `arthaai-wordmark.svg` | Horizontal dark-surface brand lockup |
| `arthaai-wordmark-light.svg` | Horizontal light-surface brand lockup |
| `favicon.svg` | Small-size symbol on a navy app tile |
| `app-icon.png` | 512 × 512 app / avatar tile |
| `apple-touch-icon.png` | 180 × 180 home-screen icon |
| `brand-preview.png` / `.svg` | Logo presentation board |

PNG exports of the marks are 1024 × 1024 with transparency. Wordmark PNGs are
2240 × 576. Preview and download the family at `/brand/` while the frontend runs.

## Usage

- Preserve the square aspect ratio of the mark; do not stretch it.
- Leave at least 8 units of clear space around a 64-unit master mark.
- Use the master at 24 px or larger; use `favicon.svg` for smaller sizes.
- Primary palette: blue `#5B8CFF`, mint `#45E0C0`, ice `#EDF5FF`, navy `#0D1726`.
- Print palette: blue `#315ED8`, teal `#087F72`, ink `#102139`.
- `Logo.jsx` uses these static assets, so repeated logos share the same geometry
  and never create conflicting inline SVG gradient IDs.
- When changing the shape, update each SVG variant and regenerate the exports.

## Rebuild PNGs and the presentation board

From the `artha-ai` directory, using the backend Python environment:

```bash
python scripts/export_brand_assets.py
```

The exporter uses the existing WeasyPrint and PyMuPDF dependencies. It performs no network calls
and writes only generated brand images into this directory.
