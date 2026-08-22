// MORPH AUDIT v2 — the raster detectors above were too coarse (12-row runs and
// 250px bars are just the flat ocean). This version measures what Andy SEES:
//
//  D1' straight-edge: the clip arc becomes a horizontal CHORD across the
//     disc. Detect: at each alpha, find the topmost/bottommost NON-background
//     row; a straight edge shows as the drawing's bottom boundary being a
//     perfectly straight horizontal line spanning >85% of its own width.
//     (A sphere/ellipse bottom is curved; a clipped chord is flat.)
//  D2' stretch-bars INSIDE landmasses: sample only rows that contain land
//     color variance, look for runs of identical color longer than 120px
//     that START after x>50 (not the ocean margin).
//  D3' per-country path teleports during morph (the real "stretch bars"):
//     consecutive path points jumping >40% width inside ONE country path.
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
const ALPHAS = [0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.83,0.86,0.9];

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = {};

  for (const proj of PROJECTIONS) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const out = [];

    for (const a of ALPHAS) {
      const r = await page.evaluate(async (alpha) => {
        state.alpha = alpha;
        render();
        // D3': teleport jumps in country paths (SVG space, canvas 1200x700)
        let worstJump = 0, jumpCountries = [];
        for (const p of gMap.node().querySelectorAll("path")) {
          if (p.classList.contains("sphere") || p.classList.contains("graticule")) continue;
          const dd = p.getAttribute("d") || "";
          if (!dd || /NaN/.test(dd)) continue;
          const nums = dd.match(/-?\d+\.?\d*(?:e-?\d+)?(?:e-?\d+)?/g);
          if (!nums) continue;
          let prev = null;
          for (let i = 0; i + 1 < nums.length; i += 2) {
            const pt = [+nums[i], +nums[i+1]];
            if (prev && Math.abs(pt[0]-prev[0]) < 200 && Math.hypot(pt[0]-prev[0], pt[1]-prev[1]) > 480) {
              if (Math.hypot(pt[0]-prev[0], pt[1]-prev[1]) > worstJump) worstJump = Math.hypot(pt[0]-prev[0], pt[1]-prev[1]);
              jumpCountries.push(p.getAttribute("d").length);
              break;
            }
            prev = pt;
          }
        }
        // D1': rasterize live SVG; check if the drawing's BOTTOM edge is flat-straight
        const svgEl = document.getElementById("map");
        const xml = new XMLSerializer().serializeToString(svgEl);
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("raster")); img.src = url; });
        try { await img.decode(); } catch {}
        const W = 480, H = 280;
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        const bi = 4*(2*W+2); const br=d[bi],bg=d[bi+1],bb=d[bi+2];
        const isBg = (i) => Math.abs(d[i]-br)<10 && Math.abs(d[i+1]-bg)<10 && Math.abs(d[i+2]-bb)<10;
        // content bbox rows
        let yTop=-1,yBot=-1,xL=W,xR=0;
        for (let y=0;y<H;y++) for(let x=0;x<W;x+=2){const i=(y*W+x)*4;if(!isBg(i)){if(yTop<0)yTop=y;yBot=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}
        let flatEdge=false, edgeRun=0;
        if (yBot>0){
          // count non-bg pixels on row yBot-1 and compare with row span
          let cnt=0;
          for(let x=0;x<W;x+=1){const i=((yBot-1)*W+x)*4;if(!isBg(i))cnt++;}
          const span=xR-xL;
          flatEdge = span>80 && cnt/span>0.97;   // bottom row filled across ~all span = straight chord
          edgeRun=cnt;
        }
        return { worstJump: Math.round(worstJump), nJump: jumpCountries.length, flatEdge, edgeRun };
      }, a).catch(e => ({ error: String(e).slice(0,60) }));
      out.push({ a, ...r });
      if (r.flatEdge || r.nJump>0) console.log(`  ${proj} α=${a}: STRAIGHT-BOTTOM-EDGE=${r.flatEdge} (row fill ${r.edgeRun}px) | teleports=${r.nJump} (max ${r.worstJump}px)`);
    }

    const straightAt = out.filter(o=>o.flatEdge).map(o=>o.a);
    const teleports = out.filter(o=>o.nJump>0).map(o=>({a:o.a,n:o.nJump,max:o.worstJump}));
    report[proj] = { straightAt, teleports };
    console.log(`${proj.padEnd(14)} straight-bottom @[${straightAt.join(",")||"-"}]  teleports @${teleports.length?JSON.stringify(teleports):"none"}`);
  }

  fs.writeFileSync("/tmp/morph-audit2.json", JSON.stringify(report, null, 1));
  console.log("\nsaved /tmp/morph-audit2.json");
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
