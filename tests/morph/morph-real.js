// MORPH AUDIT v7 — capture the REAL animation with video-like frame grabs
// during actual play(), so we see EXACTLY what Andy sees (timing included).
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
  fs.rmSync("/tmp/morph-real", { recursive: true, force: true });
  fs.mkdirSync("/tmp/morph-real", { recursive: true });

  for (const proj of ["equalEarth","bertin1953","authaGraph"]) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    let n = 0;
    const t0 = Date.now();
    // start the real animation
    page.click("#btn-play").catch(()=>{});
    while (Date.now() - t0 < 2300) {
      const st = await page.evaluate(() => ({ a: +state.alpha.toFixed(3), clip: +clipForAlpha(state.alpha).toFixed(0), anim: state.animating }));
      if (n % 2 === 0) {
        await page.screenshot({ path: `/tmp/morph-real/${proj}-t${String(n*60).padStart(4,"0")}ms-a${st.a}.png`, clip: {x:220,y:120,width:1000,height:640} });
      }
      console.log(`${proj} t=${n*60}ms alpha=${st.a} clip=${st.clip}`);
      n++;
      await page.waitForTimeout(60);
    }
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
