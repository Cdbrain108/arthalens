# Bullseye verification record

Run from `artha-ai/` unless the command changes directory explicitly.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Backend regression suite | `MODEL_PROVIDER=mock python3 -m pytest -q` | **100 passed** |
| Backend Ruff fatal checks | `PYTHONPATH=/tmp/omnirush/bullseye-tools python3 -m ruff check backend/app --select F` | **Passed** |
| Frontend unit/API tests | `cd frontend && npm test` | **35 passed** |
| Frontend lint | `cd frontend && npm run lint` | **Passed** |
| Frontend production build | `cd frontend && npm run build` | **Passed** |
| Browser/axe/responsive suite | `cd frontend && npm run test:e2e` | **3 passed** |

The Playwright suite checks the intro animation, Skip/Escape, focus restoration,
session-scoped replay, reduced motion, dark/light themes, width targets 360,
390, 768, 1024, 1280, 1440, 1920 and landscape 844×390, no horizontal overflow,
WCAG 2A/AA axe rules, demo controls, theme persistence and research submission.

## Lighthouse

Command, using the locally installed Chromium binary because the environment's
default Chrome launcher resolves to the host Windows installation:

```bash
CHROME_PATH=/tmp/omnirush/browsers/chromium-1243/chrome-linux64/chrome \
LD_LIBRARY_PATH=/tmp/omnirush/browser-libs/usr/lib/x86_64-linux-gnu \
npx lighthouse http://127.0.0.1:4173 \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=/tmp/omnirush/lighthouse.json \
  --chrome-flags='--headless --no-sandbox --disable-dev-shm-usage'
```

Scores: **Performance 93 · Accessibility 96 · Best Practices 100 · SEO 91**.
The result also identifies follow-up opportunities (contrast in legacy studio
surfaces, unused legacy CSS, robots.txt, and JS/main-thread reduction). The
landing page's axe run has no violations.

## Live tool smoke checks

The opt-in command is:

```bash
python3 scripts/live_smoke.py --query "Research AAPL"
```

Observed on 2026-10-04 with LLM-free mode and live data tools:

- `Research AAPL`: succeeded; all nine core specialists were selected; 85
  evidence items, 34 sources, 16 gaps, PDF generated; classification `NOT ASSESSED`.
- `Latest news on TCS`: succeeded; `news` only; 8 reports, 8 sources, 1 gap;
  PDF generated; classification `NEUTRAL` for a news-only brief.
- `Compare TCS and Infosys`: succeeded; nine core specialists; 167 evidence
  items, 54 sources, 23 gaps; PDF generated; classification `NOT ASSESSED`.

These are provider snapshots, not fixed test fixtures. Data freshness, source
availability and provider behavior can change. A successful job means the
pipeline completed and reports its evidence; it does not mean every specialist
had complete coverage or that the sources are independently verified.

## Remaining requirements

- Configure and test production deployment headers (CSP, HSTS, COOP/XFO) and a
  production robots policy.
- Add registered official ATS boards for companies that need workforce research.
- Expand provider adapters where a deployment requires exchange filings beyond
  the current configured sources.
- Review legacy studio-only contrast and CSS if the in-app workspace is used as
  a public landing route in addition to the new landing experience.
