// MORPH AUDIT v9 — the REAL stretch-bar detector: track LAND pixels only.
// Land fill = rgba(126,97,212,0.16) over ocean → distinct from pure ocean.
// A "pulled bar" = a row where land pixels form a continuous horizontal run
// far wider than the same landmass at α=1 (the final, correct width).
// We measure, per alpha, the WIDEST land run and compare to final width.
const { chromium } = require("playwright-core");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = "/Users/andy/Documents/SERENDIPPO-DECOLONIAL-MAPS/src";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  try { res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(fs.readFileSync(fp)); }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.addInitScript({ path: "/tmp/jsdomtest/stretch-helper.js" });
  const results = {};
  for (const proj of ["equalEarth","hoboDyer","gallPeters","equirectangular","hammer","sinusoidal","bertin1953","authaGraph"]) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // Reference: widest land run at α=1
    await page.evaluate(() => { state.alpha = 1; render(); });
    await page.waitForTimeout(80);
    const ref = await page.evaluate(async () => await window.__widestLandRun());
    const sweep = [];
    for (const a of [0.2,0.3,0.4,0.5,0.6,0.7,0.8]) {
      const w = await page.evaluate(async (alpha) => {
        state.alpha = alpha; render();
        return await window.__widestLandRun();
      }, a);
      sweep.push({ a, w, ratio: +(w.widest / ref.widest).toFixed(2) });
    }
    results[proj] = { ref: ref.widest, sweep };
    console.log(`${proj.padEnd(15)} finalWidest=${ref.widest}px  ` +
      sweep.map(s => `α${s.a}:${s.w.widest}px(${s.ratio}×)`).join(" "));
  }
  fs.writeFileSync("/tmp/stretch-audit.json", JSON.stringify(results, null, 1));
  console.log("\nsaved /tmp/stretch-audit.json");
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
