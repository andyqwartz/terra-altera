// MORPH AUDIT v3 — Andy sees: veil ends as a HORIZONTAL LINE for ~1s before
// reopening fully. That is the clip ARC at angles just under 180°: the arc is
// a huge circle whose edge crosses the visible disc as an almost-straight
// horizontal chord. Detector: measure the drawing's bottom boundary curvature.
// Also: capture FRAMES of the real animation to see exactly what he sees.
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
  await page.goto(`http://127.0.0.1:${port}/?proj=equalEarth&alpha=0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Fine sweep near the end: 0.70..0.99 step 0.01 — bottom edge flatness
  console.log("alpha | clipAngle | bottom-edge sag (px @480w) | verdict");
  for (let ai = 70; ai <= 99; ai += 2) {
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
      const W = 480, H = 280;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const bi = 4*(2*W+2); const br=d[bi],bg=d[bi+1],bb=d[bi+2];
      const isBg=(i)=>Math.abs(d[i]-br)<10&&Math.abs(d[i+1]-bg)<10&&Math.abs(d[i+2]-bb)<10;
      // content span
      let xL=W,xR=0,yBot=-1;
      for(let y=0;y<H;y++){for(let x=0;x<W;x+=2){const i=(y*W+x)*4;if(!isBg(i)){yBot=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}}
      if(yBot<0) return {clip:clipForAlpha(alpha), sag:-1};
      // bottom boundary y at three columns: left quarter, center, right quarter
      const botAt=(xc)=>{for(let y=yBot-40<0?0:yBot-40;y<=yBot+2&&y<H;y++){const i=(y*W+xc)*4;if(!isBg(i))return y;}return yBot;};
      const yl=botAt(Math.round(xL+(xR-xL)*0.25)), yc=botAt(Math.round((xL+xR)/2)), yr=botAt(Math.round(xL+(xR-xL)*0.75));
      const sag=Math.max(yl,yr)-yc; // 0 = perfectly straight bottom line
      return {clip: clipForAlpha(alpha).toFixed(1), sag, yl,yc,yr};
    }, a);
    console.log(`${a.toFixed(2)} | ${String(r.clip).padStart(5)} | ${JSON.stringify(r.sag)} px`);
  }

  // Now record the REAL animation frames near the suspicious zone
  await page.evaluate(() => { state.alpha = 0; render(); });
  await page.click("#btn-play");
  const shots = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2400) {
    await page.waitForTimeout(120);
    const s = await page.evaluate(() => ({ a: +state.alpha.toFixed(3), clip: +clipForAlpha(state.alpha).toFixed(1) }));
    shots.push(s);
  }
  console.log("\nreal-time alpha samples:", shots.map(s=>s.a).join(","));
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
