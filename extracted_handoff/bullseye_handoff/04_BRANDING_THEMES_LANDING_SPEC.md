# Branding, Themes, Landing Page & Animation Spec

Files: `branding/logo.svg` (static logo) and `branding/landing_prototype.html` (open in a browser: intro animation -> landing page, theme switcher, responsive). Use them as the visual reference. Re-implement in React + Tailwind.

## 1. Names
- Product: **Bulls Eye**. Tagline: **Research Beyond the Noise.**
- Assistant/chatbot: **RKI** (e.g. "Ask RKI").

## 2. Logo
Bull head silhouette with horns, plus a rising/falling chart line that ends in a bullseye dot. The prototype draws the chart line with a stroke-dash animation (draw down, up, then rise) and pulses the bullseye.

## 3. Intro (splash) animation, ~2.5 s
1. 0.0s: dark screen, bull logo fades in.
2. 0.2-1.6s: chart line draws itself, dips, recovers, then climbs.
3. 1.6-2.0s: bullseye dot pulses, "Bulls Eye" text fades in.
4. ~2.4s: splash fades out and the landing page fades in.
Rules: play once per browser session (sessionStorage), "Skip" button, respect `prefers-reduced-motion` (skip animation). Pure SVG + CSS, no heavy libraries.

## 4. Themes (CSS variables, saved in localStorage)
| Theme | Background | Accent | Feel |
|---|---|---|---|
| Midnight (default) | #0B1020 | #6C7CFF | current blue/purple, but calmer |
| Bull Green | #07140F | #22C55E | finance, growth |
| Light | #F7F8FB | #3B5BFF | clean daytime |
| Amber | #130F07 | #F59E0B | warm, premium |
Semantic colours stay fixed in every theme: **green = good, red = bad, amber = watch**. Only one accent colour per theme for buttons/links.

## 5. Landing page sections
1. Sticky nav: logo, How it works, Beginner vs Expert, Agents, Sample report, theme switcher, "Try RKI" button.
2. Hero: headline "Should you buy this share? Get a clear answer in plain words." + one input box ("Ask RKI about any company...") + 3 example chips.
3. How it works (3-4 steps): Ask -> Agents research -> Evidence checked -> Report.
4. Beginner / Expert toggle demo: same TCS result shown simply vs with ratios.
5. Meet the agents: cards for Financial, Valuation, Market, News, Growth, Risk (+ optional Workforce, Document).
6. Trust section: "Every number has a source", evidence-gap honesty, "not investment advice".
7. Sample report preview (download the sample PDF).
8. FAQ (2-3 items) and footer with disclaimer.
Honesty rule from your own docs: no fake live tickers or made-up stats. Prototype uses the TCS sample numbers and labels them "sample".

## 6. Animations to add (all optional, keep light)
- Scroll-reveal (fade-up) for sections using IntersectionObserver.
- Agent cards light up one by one in the "How it works" demo.
- Bull/Bear bars animate from 0 to value on first view.
- Number count-up on the key stats.
- Button hover lift; focus rings for accessibility.

## 7. Responsive rules
- Mobile first: single column under 640px, 2 columns at 640-1024px, 3-4 at >1024px.
- Nav collapses to a menu button on mobile.
- Tap targets at least 44px; font-size at least 16px for inputs (prevents iOS zoom).
- Tables become stacked cards on mobile.
- Test at 360, 768, 1280 widths.

## 8. Report page UI
- Top: plain verdict card (HOLD / BUY / SELL-style label + one sentence + confidence).
- Tabs: **Beginner | Expert**. Beginner = short sentences, Good/Okay/Watch tags, no jargon. Expert = ratios, formulas, sources, evidence drawer.
- Quarterly revenue/profit chart (real data only) and bull-vs-bear list.
- Download PDF button.

## 9. Can Claude make images?
Claude can make **SVG logos, icons, charts and animated HTML/CSS** (included here). It cannot generate photo-style or AI-painted images. For a polished final bull illustration, use a designer or an image tool and swap the SVG in.
