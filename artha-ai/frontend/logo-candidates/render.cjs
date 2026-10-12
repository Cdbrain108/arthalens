const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CANDIDATES = [
  ['current.svg', '0 · Current', 'The mark in the app today — rings + crosshair, no research story'],
  ['candidate-5-breakout.svg', '5 · Breakout', 'Name + goal: the bullseye with a price line breaking out of it — “See the upside.”'],
  ['candidate-6-dual-thesis.svg', '6 · Dual Thesis', 'Name + goal: green bull arc vs red bear arc around one target — “See the upside. Audit the downside.”'],
  ['candidate-7-candles.svg', '7 · In The Crosshairs', 'Name + goal: bull & bear candles sitting in the crosshairs — precision equity research'],
  ['candidate-8-evidence.svg', '8 · Evidence', 'Name + goal: separate findings converge into one conclusion — “Evidence before opinion.”'],
];

(async () => {
  const dir = __dirname;
  const rows = CANDIDATES.map(([file, name, desc]) => `
    <div class="row">
      <div class="meta"><strong>${name}</strong><span>${desc}</span></div>
      <div class="panel dark">
        <img src="${file}" width="96" height="96">
        <img src="${file}" width="48" height="48">
        <img src="${file}" width="34" height="34">
        <img src="${file}" width="20" height="20">
        <img src="${file}" width="16" height="16">
        <div class="navmock"><img src="${file}" width="34" height="34"><span>Bullseye<b>.</b></span></div>
      </div>
      <div class="panel light">
        <img src="${file}" width="96" height="96">
        <img src="${file}" width="48" height="48">
        <img src="${file}" width="34" height="34">
        <img src="${file}" width="20" height="20">
        <img src="${file}" width="16" height="16">
        <div class="navmock"><img src="${file}" width="34" height="34"><span>Bullseye<b>.</b></span></div>
      </div>
    </div>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { background: #101319; color: #e8eaed; font: 13px/1.5 'Segoe UI', system-ui, sans-serif; padding: 26px; width: 1180px; }
    h1 { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
    p.sub { color: #9aa0a6; margin-bottom: 20px; }
    .row { display: grid; grid-template-columns: 230px 1fr 1fr; gap: 14px; margin-bottom: 16px; align-items: stretch; }
    .meta { padding: 10px 4px; }
    .meta strong { display: block; font-size: 14.5px; color: #fff; margin-bottom: 5px; }
    .meta span { color: #9aa0a6; font-size: 12px; }
    .panel { border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 18px; }
    .panel.dark { background: #07090e; border: 1px solid rgba(255,255,255,.08); }
    .panel.light { background: #f8fafd; border: 1px solid #dfe3ea; }
    .panel.light .navmock span { color: #0f172a; }
    .navmock { display: flex; align-items: center; gap: 9px; margin-left: auto; padding-left: 16px; border-left: 1px dashed rgba(128,128,128,.4); }
    .navmock span { font-size: 21px; font-weight: 750; letter-spacing: -.5px; color: #f1f5f9; }
    .navmock b { color: #4285f4; }
  </style></head><body>
    <h1>Bullseye — logo candidates</h1>
    <p class="sub">Each row: 96 · 48 · 34 (nav) · 20 · 16 (favicon) · nav lockup — on dark & light.</p>
    ${rows}
  </body></html>`;

  const out = path.join(dir, '..', '.shots');
  fs.mkdirSync(out, { recursive: true });
  const htmlPath = path.join(dir, 'preview.html');
  fs.writeFileSync(htmlPath, html);

  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1220, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'logo-candidates.png'), fullPage: true });
  await b.close();
  console.log('done');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
