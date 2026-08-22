// MORPH AUDIT v4 — capture actual animation frames as PNGs for VISUAL proof.
// Andy: "le voile se met en ligne droite horizontale parfois pendant une seconde
// avant de récupérer tout correctement" + "zones étirées en barres visibles".
// Record frames 0.55..1.0 of the real play() on each projection.
const { chromium } = require("playwright-core");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = "/Users/andy/Documents/SERENDIPPO-DECOLONIAL-MAPS/src";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  try { res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(fs.readFileSync(fp)); }
  catch { res.writeHead(404); res.end(); }
});
const PROJECTIONS = process.argv[2] ? [process.argv[2]] : ["equalEarth","bertin1953","authaGraph"];
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  fs.mkdirSync("/tmp/morph-frames", { recursive: true });
  for (const proj of PROJECTIONS) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    // Static sweep instead of real-time (deterministic): capture the exact frames.
    for (const a of [0.5,0.6,0.7,0.75,0.8,0.83,0.86,0.9,0.95,1]) {
      await page.evaluate((al) => { state.alpha = al; render(); }, a);
      await page.waitForTimeout(60);
      await page.screenshot({ path: `/tmp/morph-frames/${proj}-${String(a).replace(".","_")}.png`, clip: { x: 200, y: 100, width: 1040, height: 700 } });
    }
    console.log(`${proj}: 10 frames -> /tmp/morph-frames/`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
