// MORPH AUDIT v11 — root-cause probes for the 3 real failure classes:
//
// A) T1 equirectangular: bottom edge goes FLAT (3px sag) at α=0.97 while wide.
//    → the morph target is a rectangle; near the end the shape IS a rectangle
//      with a straight bottom. Question: does it look like a "frozen line"?
//      Measure WHEN the flatness starts and how long it lasts.
//
// B) T2 hammer/sinusoidal: widest land run explodes vs final. These are
//    elliptical/pseudo-cylindrical: at α=0.9 the world is still WIDER than
//    final fit? No — refit per frame... Actually the ratio blows up because
//    their FINAL widest run is small (58px/4px = detector artifact: land color
//    threshold fails on their ocean tint). Verify with pixel samples.
//
// C) T4 bbox jumps ~150px between sampled alphas: the EASE curve is steep in
//    the middle; sampling 0.15 apart catches fast motion. Check with fine steps.
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

  console.log("=== A) equirectangular: how long is the bottom FLAT while wide? ===");
  await page.goto(`http://127.0.0.1:${port}/?proj=equirectangular&alpha=0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  for (let ai = 88; ai <= 100; ai += 2) {
    const a = ai / 100;
    const r = await page.evaluate(async (alpha) => {
      state.alpha = alpha; render();
      const svgEl = document.getElementById("map");
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
      try { await img.decode(); } catch {}
      const W = 520, H = 300;
      const cv = document.createElement("canvas"); cv.width=W; cv.height=H;
      const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0,0,W,H).data;
      const bi=4*(2*W+2); const br=d[bi],bg=d[bi+1],bb=d[bi+2];
      const isBg=(i)=>Math.abs(d[i]-br)<10&&Math.abs(d[i+1]-bg)<10&&Math.abs(d[i+2]-bb)<10;
      let xL=W,xR=0,yB=-1;
      for(let y=0;y<H;y++){for(let x=0;x<W;x+=2){const i=(y*W+x)*4;if(!isBg(i)){yB=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}}
      if(yB<0) return {};
      const cols=[0.05,0.25,0.5,0.75,0.95].map(f=>Math.round(xL+(xR-xL)*f));
      const botAt=(xc)=>{for(let y=Math.max(0,yB-90);y<H;y++){const i=(y*W+xc)*4;if(!isBg(i))return y;}return -1;};
      const bots=cols.map(botAt).filter(v=>v>=0);
      return {sag: Math.max(...bots)-Math.min(...bots), spanW: xR-xL};
    }, a);
    console.log(`  α=${a.toFixed(2)} sag=${r.sag}px span=${r.spanW}px`);
  }

  console.log("\n=== B) sinusoidal: land-pixel detector sanity ===");
  await page.goto(`http://127.0.0.1:${port}/?proj=sinusoidal&alpha=0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const pal = await page.evaluate(async () => {
    state.alpha = 1; render();
    const svgEl = document.getElementById("map");
    const xml = new XMLSerializer().serializeToString(svgEl);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
    try { await img.decode(); } catch {}
    const W=640,H=373;
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    const ctx=cv.getContext("2d"); ctx.drawImage(img,0,0,W,H);
    const d=ctx.getImageData(0,0,W,H).data;
    // sample center row colors: ocean left, land center-ish
    const samples=[];
    for(const x of [80,200,320,440,560]) samples.push([x, d[(Math.floor(H*0.55)*W+x)*4], d[(Math.floor(H*0.55)*W+x)*4+1], d[(Math.floor(H*0.55)*W+x)*4+2]]);
    return samples.map(s=>`x${s[0]}:rgb(${s[1]},${s[2]},${s[3]})`).join(" ");
  });
  console.log(" ", pal);

  console.log("\n=== C) continuity with FINE alpha steps (0.03) on equalEarth ===");
  await page.goto(`http://127.0.0.1:${port}/?proj=equalEarth&alpha=0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  let prev=null, worstStep=0, worstAt=0;
  for (let ai = 30; ai <= 100; ai += 3) {
    const a = ai/100;
    const bb = await page.evaluate((alpha) => {
      state.alpha = alpha; render();
      const s = gMap.node().querySelector("path.sphere");
      if (!s) return null;
      const b = s.getBBox(); return {w:b.width,h:b.height};
    }, a);
    if (prev) {
      const step = Math.max(Math.abs(bb.w-prev.w), Math.abs(bb.h-prev.h));
      if (step > worstStep) { worstStep = step; worstAt = a; }
    }
    prev = bb;
  }
  console.log(`  worst bbox step @0.03-alpha granularity: ${worstStep.toFixed(1)}px @α≈${worstAt}`);

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
