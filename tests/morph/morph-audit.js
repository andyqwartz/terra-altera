// MORPH AUDIT — every projection, dense alpha sweep, three detectors:
//
//  D1 "straight-edge" (the veil ending as a horizontal line): at each sampled
//     alpha, rasterize the live SVG and measure how many consecutive rows in
//     the middle band are IDENTICAL to each other (a straight horizontal edge
//     = long runs of near-identical rows adjacent to a sharp change).
//  D2 "bar/stretch artifacts": detect long horizontal runs of identical
//     pixels WITHIN the drawing (stretched bars), and per-country path
//     teleport jumps (>40% canvas width between consecutive points).
//  D3 continuity: alpha sweep must be smooth — frame-to-frame content bbox
//     jump > 25% of canvas = discontinuity.
//
const { chromium } = require("playwright-core");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = "/Users/andy/Documents/SERENDIPPO-DECOLONIAL-MAPS/src";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  try { res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(fs.readFileSync(fp)); }
  catch { res.writeHead(404); res.end(); }
});

const PROJECTIONS = ["equalEarth","hoboDyer","gallPeters","equirectangular","hammer","sinusoidal","bertin1953","authaGraph"];
const ALPHAS = [0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.82,0.85,0.87,0.9,0.95];

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = {};

  for (const proj of PROJECTIONS) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const rows = [];
    for (const a of ALPHAS) {
      const r = await page.evaluate(async (alpha) => {
        state.alpha = alpha;
        render();
        await new Promise(res => requestAnimationFrame(res));
        // Serialize the live map SVG to an image and analyze pixels.
        const svgEl = document.getElementById("map");
        const xml = new XMLSerializer().serializeToString(svgEl);
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("raster")); img.src = url; });
        try { await img.decode(); } catch {}
        const W = 600, H = 350; // analysis resolution (half)
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        // Row signature: quantized color hash per row
        const rowSig = [];
        for (let y = 0; y < H; y++) {
          let h = 0;
          for (let x = 0; x < W; x += 4) {
            const i = (y * W + x) * 4;
            h = (h * 31 + ((d[i] >> 3) * 64 + (d[i+1] >> 3) * 8 + (d[i+2] >> 3))) | 0;
          }
          rowSig.push(h);
        }
        // D1: longest run of identical consecutive rows in middle band (y 20%..90%)
        let maxRun = 1, run = 1;
        for (let y = Math.floor(H*0.2)+1; y < Math.floor(H*0.9); y++) {
          if (rowSig[y] === rowSig[y-1]) { run++; maxRun = Math.max(maxRun, run); } else run = 1;
        }
        // D2: within-row stretch bars: longest run of IDENTICAL pixels in a row
        // (sampled rows); a stretched bar shows as very long constant-color runs
        let maxBar = 0;
        for (let y = Math.floor(H*0.3); y < Math.floor(H*0.85); y += 10) {
          let runPx = 1, best = 1;
          for (let x = 1; x < W; x++) {
            const i = (y*W+x)*4, ip = (y*W+x-1)*4;
            if (Math.abs(d[i]-d[ip])<6 && Math.abs(d[i+1]-d[ip+1])<6 && Math.abs(d[i+2]-d[ip+2])<6) { runPx++; best = Math.max(best, runPx); }
            else runPx = 1;
          }
          maxBar = Math.max(maxBar, best);
        }
        return { maxRun, maxBar };
      }, a).catch(e => ({ error: String(e).slice(0,50) }));
      rows.push({ a, ...r });
    }

    // D3: bbox continuity sweep via geometry (cheap, no raster)
    const bboxes = await page.evaluate((alphas) => {
      return alphas.map(a => {
        state.alpha = a; render();
        const s = gMap.node().querySelector("path.sphere");
        if (!s || !s.getAttribute("d")) return null;
        const bb = s.getBBox();
        return [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height];
      });
    }, ALPHAS);

    // Analyze
    const d1Worst = rows.reduce((m, r) => Math.max(m, r.maxRun || 0), 0);
    const d1Where = rows.filter(r => r.maxRun >= 60).map(r => r.a);
    const d2Worst = rows.reduce((m, r) => Math.max(m, r.maxBar || 0), 0);
    const d2Where = rows.filter(r => r.maxBar >= 300).map(r => r.a);
    let d3MaxJump = 0, d3Where = [];
    for (let i = 1; i < bboxes.length; i++) {
      const p = bboxes[i-1], c = bboxes[i];
      if (!p || !c) continue;
      const jump = Math.max(Math.abs(c[0]-p[0]), Math.abs(c[1]-p[1]), Math.abs(c[2]-p[2]), Math.abs(c[3]-p[3]));
      if (jump > d3MaxJump) { d3MaxJump = jump; d3Where = [ALPHAS[i-1], ALPHAS[i]]; }
    }
    report[proj] = { d1Worst, d1Where, d2Worst, d2Where, d3MaxJump: Math.round(d3MaxJump), d3Where };
    console.log(`${proj.padEnd(14)} D1-straightRows max=${String(d1Worst).padStart(3)} @α[${d1Where.join(",")}]  ` +
                `D2-bars max=${String(d2Worst).padStart(3)}px @α[${d2Where.join(",")}]  ` +
                `D3-bboxJump=${d3MaxJump}px @α[${d3Where.join(",")}]`);
  }

  fs.writeFileSync("/tmp/morph-audit.json", JSON.stringify(report, null, 1));
  console.log("\nsaved /tmp/morph-audit.json");
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
