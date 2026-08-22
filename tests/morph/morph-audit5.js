// MORPH AUDIT v5 — quantitative edge analysis of the captured frames.
// For each frame PNG: measure the bottom boundary of the drawn shape at
// multiple columns; a STRAIGHT horizontal veil edge => sag ~ 0 across the
// whole width. A curved sphere/ellipse bottom => sag large (tens of px).
// Also: detect horizontal STRETCH BARS inside the drawing: rows where a
// single color run exceeds 45% of content width while other rows in the
// same band are diverse (the "pulled taffy" look).
const { chromium } = require("playwright-core");
const fs = require("fs"); const path = require("path");

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage();
  await page.goto("about:blank");
  const files = fs.readdirSync("/tmp/morph-frames").filter(f => f.endsWith(".png")).sort();
  for (const f of files) {
    const b64 = fs.readFileSync("/tmp/morph-frames/" + f).toString("base64");
    const r = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
      // Downscale for speed
      const W = 520, H = 350;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      // background = most common color of corners
      const cornerCols = [0, (H-1)*W].flatMap(y => [0, W-1].map(x => {
        const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2]];
      }));
      const [br,bgc,bb] = cornerCols[0];
      const isBg = (i) => Math.abs(d[i]-br)<12 && Math.abs(d[i+1]-bgc)<12 && Math.abs(d[i+2]-bb)<12;
      // content bbox
      let xL=W,xR=0,yT=-1,yB=-1;
      for(let y=0;y<H;y++){for(let x=0;x<W;x+=2){const i=(y*W+x)*4;if(!isBg(i)){if(yT<0)yT=y;yB=y;if(x<xL)xL=x;if(x>xR)xR=x;break;}}}
      if(yB<0) return {empty:true};
      // bottom boundary at 7 columns across the span
      const cols=[0.08,0.2,0.35,0.5,0.65,0.8,0.92].map(f=>Math.round(xL+(xR-xL)*f));
      const botAt=(xc)=>{for(let y=Math.max(0,yB-60);y<H;y++){const i=(y*W+xc)*4;if(!isBg(i))return y;}return -1;};
      const bots=cols.map(botAt).filter(v=>v>=0);
      const sag = bots.length? Math.max(...bots)-Math.min(...bots) : -1;
      // stretch bars: rows with one color-run > 45% of span, within content rows
      let barRows=0, worstRun=0;
      for(let y=yT;y<=yB;y+=3){
        let run=1,best=1;
        for(let x=xL+1;x<=xR;x++){
          const i=(y*W+x)*4, ip=(y*W+x-1)*4;
          if(Math.abs(d[i]-d[ip])<5&&Math.abs(d[i+1]-d[ip+1])<5&&Math.abs(d[i+2]-d[ip+2])<5){run++;best=Math.max(best,run);}
          else run=1;
        }
        if(best>(xR-xL)*0.45){barRows++;worstRun=Math.max(worstRun,best);}
      }
      return {sag, barRows, worstRun, span: xR-xL};
    }, b64);
    console.log(`${f.padEnd(26)} bottomSag=${String(r.sag).padStart(4)}px  barRows=${String(r.barRows).padStart(3)} worstRun=${r.worstRun}px`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
