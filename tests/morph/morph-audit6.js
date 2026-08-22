// MORPH AUDIT v6 — THE REAL DETECTORS, tuned to Andy's two symptoms:
//
// S1 "veil freezes as a straight horizontal line ~1s before completing":
//    Measure the drawing's bottom-edge sag DURING the last phase. Sag
//    collapsing to ~0 while the shape is still WIDE = the clip chord is a
//    horizontal line across the whole map (what he sees). We sweep finely.
//
// S2 "zones stretched into visible bars during some morphs":
//    The lerp of raws creates intermediate shapes where landmasses get
//    smeared horizontally. Detect: land-colored pixels forming horizontal
//    runs > 45% of content width at rows that ALSO contain high-contrast
//    detail in other rows of the same band (i.e., not ocean).
//    Land color != ocean color: land is rgba(126,97,212,.16) over ocean,
//    borders rgba(126,97,212,.45) — detect "purple-ish" pixels vs deep blue ocean.
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

  for (const proj of ["equalEarth","bertin1953","authaGraph"]) {
    console.log(`\n=== ${proj} — fine bottom-edge sag sweep (the "frozen line") ===`);
    await page.goto(`http://127.0.0.1:${port}/?proj=${proj}&alpha=0`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    let prevSag = null;
    for (let ai = 60; ai <= 100; ai += 2) {
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
        if(yB<0) return {sag:-1};
        const cols=[0.05,0.2,0.4,0.5,0.6,0.8,0.95].map(f=>Math.round(xL+(xR-xL)*f));
        const botAt=(xc)=>{for(let y=Math.max(0,yB-80);y<H;y++){const i=(y*W+xc)*4;if(!isBg(i))return y;}return -1;};
        const bots=cols.map(botAt).filter(v=>v>=0);
        return { sag: Math.max(...bots)-Math.min(...bots), spanW: xR-xL };
      }, a);
      if (r.sag >= 0 && r.sag !== prevSag) {
        console.log(`  α=${a.toFixed(2)}  bottom-sag=${r.sag}px  (span ${r.spanW}px)${r.sag<=3?"   <-- FLAT LINE":""}`);
        prevSag = r.sag;
      }
    }

    // S2: stretch bars mid-morph
    console.log(`  --- stretch-bar scan ---`);
    for (const a of [0.35,0.5,0.65]) {
      const bars = await page.evaluate(async (alpha) => {
        state.alpha = alpha;
        render();
        const svgEl = document.getElementById("map");
        const xml = new XMLSerializer().serializeToString(svgEl);
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
        try { await img.decode(); } catch {}
        const W = 640, H = 373;
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        // Land pixels: purple-ish (r~g*1.5, b highest) — land fill rgba(126,97,212,.16)
        // over ocean #241b45..#120f22 gives muted violet; border strokes are brighter purple.
        const isLandish=(i)=>{const r=d[i],g=d[i+1],b=d[i+2];return b>g+8&&r>g-4&&b>40;};
        let xL=W,xR=0,yT=-1,yB=-1;
        for(let y=0;y<H;y++){for(let x=0;x<W;x+=2){if(isLandish((y*W+x)*4)){if(yT<0)yT=y;yB=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}}
        if(yB<0) return [];
        const out=[];
        for(let y=Math.max(yT,Math.floor(H*0.25));y<Math.min(yB,H*0.9);y+=2){
          // longest land-run on this row
          let run=0,best=0,bestStart=0,cur=0,start=0;
          for(let x=xL;x<=xR;x++){
            if(isLandish((y*W+x)*4)){if(!cur)start=x;cur++;if(cur>best){best=cur;bestStart=start;}}
            else cur=0;
          }
          if(best>(xR-xL)*0.42) out.push({y,runPx:best});
        }
        return out.slice(0,6);
      }, a);
      console.log(`  α=${a}: bar-rows ${bars.length}${bars.length?": "+bars.map(b=>`y=${b.y}(${b.runPx}px)`).join(" "):""}`);
    }
  }

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
