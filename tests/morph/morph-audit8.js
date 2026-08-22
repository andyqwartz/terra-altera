// MORPH AUDIT v8 — FINAL DIAGNOSIS of Andy's "frozen straight line" symptom.
//
// Hypothesis: the veil (clip arc) reaches 180° at α=0.85, i.e. at ~1450ms of
// a 2000ms animation. From 1450ms→2000ms (~550ms, but visually up to ~1s with
// the slow EASE tail) the SHAPE keeps morphing with NO clip arc — and the
// morphing intermediate raws produce shapes whose bottom edge is nearly
// straight/horizontal while landmasses are still smearing into place.
// That's the "straight line for a second before it recovers".
//
// Measure: bottom-edge sag during 0.85→1.0 finely for every projection.
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
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  console.log("Bottom-edge sag AFTER the veil is gone (α 0.85→1.00).");
  console.log("Sag ~0px while span is wide = the frozen horizontal line Andy sees.\n");
  for (const proj of PROJECTIONS) {
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const sags = [];
    for (let ai = 85; ai <= 100; ai += 3) {
      const a = ai / 100;
      const r = await page.evaluate(async (alpha) => {
        state.alpha = alpha;
        render();
        const svgEl = document.getElementById("map");
        const xml = new XMLSerializer().serializeToString(svgEl);
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
        try { await img.decode(); } catch {}
        const W = 520, H = 300;
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, W, H);
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
      }, a);
      sags.push(`α${a.toFixed(2)}:${r.sag}px`);
    }
    console.log(`${proj.padEnd(15)} ${sags.join(" ")}`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
