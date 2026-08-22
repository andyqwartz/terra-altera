// MORPH AUDIT v12 — the REAL stretch-bar measurement, theme-agnostic.
// Instead of guessing land color thresholds, DIFF two renders of the same
// alpha: (1) full render, (2) render with countries hidden. Pixels that
// differ = LAND. Then measure widest horizontal land-run per alpha vs α=1.
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

  async function rasterize(alpha, withLand) {
    return page.evaluate(async ([alpha, withLand]) => {
      state.alpha = alpha;
      state.borders = false;
      const g = gMap.node();
      // Render with or without countries by toggling a flag via re-render hack:
      render();
      if (!withLand) {
        // hide country fills for the diff pass
        g.querySelectorAll("g path[fill]").forEach(p => {
          if (!p.classList.contains("sphere") && !p.classList.contains("graticule")) p.setAttribute("fill", "none");
        });
      }
      const xml = new XMLSerializer().serializeToString(document.getElementById("map"));
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
      try { await img.decode(); } catch {}
      const W = 640, H = 373;
      const cv = document.createElement("canvas"); cv.width=W; cv.height=H;
      const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
      return Array.from(ctx.getImageData(0,0,W,H).data);
    }, [alpha, withLand]);
  }

  console.log("Widest LAND run per alpha (diff-based), ratio vs final.\n");
  for (const proj of ["equalEarth","hoboDyer","gallPeters","equirectangular","hammer","sinusoidal","bertin1953","authaGraph"]) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const measure = async (alpha) => {
      const full = await rasterize(alpha, true);
      const bare = await rasterize(alpha, false);
      const W = 640, H = 373;
      let widest = 0;
      for (let y = 0; y < H; y += 2) {
        let run = 0, best = 0;
        for (let x = 0; x < W; x++) {
          const i = (y*W+x)*4;
          const diff = Math.abs(full[i]-bare[i]) + Math.abs(full[i+1]-bare[i+1]) + Math.abs(full[i+2]-bare[i+2]);
          if (diff > 12) { run++; if (run > best) best = run; } else run = 0;
        }
        if (best > widest) widest = best;
      }
      return widest;
    };
    const ref = await measure(1);
    const sweep = [];
    for (const a of [0.25,0.4,0.5,0.6,0.7,0.8,0.9]) {
      const w = await measure(a);
      sweep.push(`α${a}:${w}px(${(w/ref.widestRun ?? w/ref).toFixed(2)}×)`);
    }
    console.log(`${proj.padEnd(15)} final=${ref}px  ${sweep.map((s,i)=>`α${[0.25,0.4,0.5,0.6,0.7,0.8,0.9][i]}:${s.split(":")[1]}`).join(" ")}`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
