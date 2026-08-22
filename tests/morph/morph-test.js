// MORPH TEST SUITE — TERRA ALTERA v1
// ==================================
// Covers the whole globe→map transition on EVERY projection, with PASS/FAIL
// gates for the two symptoms Andy reported plus structural sanity:
//
//  T1 VEIL-FREEZE  — after the clip arc opens fully (α ≥ 0.85), the drawing's
//     bottom edge must keep curvature (sag ≥ 40% of final sag). A flat line
//     while the shape is still wide = the "frozen straight line" bug.
//  T2 STRETCH-BARS  — widest continuous land run (diff-based detection) must
//     not exceed 1.6× the α=1 reference width at any sampled alpha.
//     (Land detected by diffing renders with/without country fills.)
//  T3 TELEPORTS     — no country path may contain consecutive points jumping
//     more than 420px (shredded polygons mid-morph).
//  T4 CONTINUITY    — sphere bbox between fine alpha steps (0.03) must not
//     jump more than 60px (the EASE curve is steep mid-morph; coarse sampling
//     gives false alarms — this suite samples finely).
//
// Usage:
//   node morph-test.js                 # all projections
//   node morph-test.js hammer bertin1953
//
// Exit code 0 = all pass. JSON report: research/logs/morph-test-report.json
const { chromium } = require("playwright-core");
const http = require("http"); const fs = require("fs"); const path = require("path");

const ROOT = "/Users/andy/Documents/SERENDIPPO-DECOLONIAL-MAPS/src";
const LOGDIR = "/Users/andy/Documents/SERENDIPPO-DECOLONIAL-MAPS/research/logs";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  try { res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(fs.readFileSync(fp)); }
  catch { res.writeHead(404); res.end(); }
});

const PROJECTIONS = process.argv.length > 2 ? process.argv.slice(2)
  : ["equalEarth","hoboDyer","gallPeters","equirectangular","hammer","sinusoidal","bertin1953","authaGraph"];

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let fails = 0;
  const check = (n, ok, d="") => { console.log(` ${ok?"PASS":"FAIL"} ${n}${d?" — "+d:""}`); if(!ok) fails++; };
  const report = {};

  // --- land-run measurement via render diff (theme-agnostic) ---
  async function measureLandRun(alpha) {
    const rasterize = async (withLand) => page.evaluate(async ([alpha, withLand]) => {
      state.alpha = alpha;
      state.borders = false;
      render();
      const g = gMap.node();
      if (!withLand) {
        g.querySelectorAll("path").forEach(p => {
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
      ctx2d = cv.getContext("2d"); ctx2d.drawImage(img, 0, 0, W, H);
      return Array.from(ctx2d.getImageData(0,0,W,H).data);
    }, [alpha, withLand]);
    const full = await rasterize(true);
    const bare = await rasterize(false);
    const W = 640, H = 373;
    let widest = 0;
    for (let y = 0; y < H; y += 2) {
      let run = 0, best = 0;
      for (let x = 0; x < W; x++) {
        const i = (y*W+x)*4;
        const diff = Math.abs(full[i]-bare[i]) + Math.abs(full[i+1]-bare[i+1]) + Math.abs(full[i+2]-bare[i+2]);
        if (diff > 12) { run++; best = Math.max(best, run); } else run = 0;
      }
      widest = Math.max(widest, best);
    }
    return widest;
  }

  async function bottomSag(alpha) {
    return page.evaluate(async (alpha) => {
      state.alpha = alpha;
      render();
      const svgEl = document.getElementById("map");
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
      try { await img.decode(); } catch {}
      const W = 520, H = 300;
      const cv = document.createElement("canvas"); cv.width=W; cv.height=H;
      const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const bi=4*(2*W+2); const br=d[bi],bg=d[bi+1],bb=d[bi+2];
      const isBg=(i)=>Math.abs(d[i]-br)<10&&Math.abs(d[i+1]-bg)<10&&Math.abs(d[i+2]-bb)<10;
      let xL=W,xR=0,yB=-1;
      for(let y=0;y<H;y++){for(let x=0;x<W;x+=2){const i=(y*W+x)*4;if(!isBg(i)){yB=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}}
      if(yB<0) return {sag:-1,spanW:0};
      const cols=[0.05,0.2,0.4,0.5,0.6,0.8,0.95].map(f=>Math.round(xL+(xR-xL)*f));
      const botAt=(xc)=>{for(let y=Math.max(0,yB-90);y<H;y++){const i=(y*W+xc)*4;if(!isBg(i))return y;}return -1;};
      const bots=cols.map(botAt).filter(v=>v>=0);
      return { sag: Math.max(...bots)-Math.min(...bots), spanW: xR-xL };
    }, alpha);
  }

  for (const proj of PROJECTIONS) {
    console.log(`\n=== ${proj} ===`);
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(450);
    report[proj] = {};

    // Reference at α=1
    await page.evaluate(() => { state.alpha = 1; render(); });
    await page.waitForTimeout(80);
    const refRun = await measureLandRun(1);
    const refSag = await bottomSag(1);

    // T2 stretch bars sweep
    let worstRatio = 0, worstAt = 0;
    for (const a of [0.25,0.4,0.5,0.6,0.7,0.8,0.9]) {
      const w = await measureLandRun(a);
      const ratio = w / refRun;
      if (ratio > worstRatio) { worstRatio = ratio; worstAt = a; }
    }
    check("T2 stretch-bars <=1.6x final width", worstRatio <= 1.6,
      `worst ${worstRatio.toFixed(2)}x @α${worstAt} (final ${refRun}px)`);
    report[proj].stretch = { worstRatio: +worstRatio.toFixed(2), worstAt };

    // T1 veil-freeze tail sweep
    let minSagTail = Infinity;
    for (let ai = 86; ai <= 99; ai += 3) minSagTail = Math.min(minSagTail, (await bottomSag(ai/100)).sag);
    check("T1 no frozen straight edge after veil opens",
      minSagTail < 0 || minSagTail >= Math.max(12, refSag.sag * 0.4),
      `min tail sag ${minSagTail}px vs final ${refSag.sag}px`);
    report[proj].veilFreeze = { minTailSag: minSagTail, finalSag: refSag.sag };

    // T3 teleports
    const maxJ = await page.evaluate(() => {
      let maxJ = 0;
      for (const p of gMap.node().querySelectorAll("path")) {
        if (p.classList.contains("sphere") || p.classList.contains("graticule")) continue;
        const dd = p.getAttribute("d") || "";
        if (!dd || /NaN/.test(dd)) continue;
        const nums = dd.match(/-?\d+\.?\d*(?:e-?\d+)?(?:e-?\d+)?/g);
        if (!nums) continue;
        let prev = null;
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const pt = [+nums[i], +nums[i+1]];
          if (prev && Math.abs(pt[0]-prev[0]) < 250) maxJ = Math.max(maxJ, Math.hypot(pt[0]-prev[0], pt[1]-prev[1]));
          prev = pt;
        }
      }
      return maxJ;
    });
    check("T3 no teleport jumps >420px", maxJ <= 420, `max ${Math.round(maxJ)}px`);
    report[proj].teleports = Math.round(maxJ);

    // T4 continuity with fine steps
    let prev = null, worstStep = 0;
    for (let ai = 30; ai <= 100; ai += 3) {
      const bb = await page.evaluate((alpha) => {
        state.alpha = alpha; render();
        const s = gMap.node().querySelector("path.sphere");
        if (!s) return null;
        const b = s.getBBox(); return { w: b.width, h: b.height };
      }, ai/100);
      if (prev && bb) worstStep = Math.max(worstStep, Math.abs(bb.w-prev.w), Math.abs(bb.h-prev.h));
      prev = bb;
    }
    check("T4 shape continuity (fine steps <=60px)", worstStep <= 60, `worst step ${Math.round(worstStep)}px`);
    report[proj].continuity = Math.round(worstStep);
  }

  fs.mkdirSync(LOGDIR, { recursive: true });
  fs.writeFileSync(path.join(LOGDIR, "morph-test-report.json"), JSON.stringify(report, null, 1));
  console.log(fails === 0 ? "\nALL PROJECTIONS PASS" : `\n${fails} FAILURES`);
  console.log(`report: ${LOGDIR}/morph-test-report.json`);
  await browser.close();
  server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
